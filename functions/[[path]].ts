// functions/[[path]].ts (Cloudflare Pages Function Backend)
// This file should be directly inside the 'functions' directory.
import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { cors } from 'hono/cors';

// Define the environment variables (bindings)
interface Env {
  FILES_BUCKET: R2Bucket;
  DB: D1Database;         // For file metadata
  USER_DB: D1Database;    // NEW: For user authentication
  // JWT_SECRET: string;  // Recommended: Bind this secret via wrangler secret put JWT_SECRET
}

// PagesFunctionContext type for explicit context handling (provided by Cloudflare Pages runtime)
interface PagesFunctionContext<Env> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  passThroughOnException: () => void;
}

const app = new Hono<{ Bindings: Env }>();

// Apply CORS middleware to all routes handled by this function.
app.use('*', cors({
  origin: '*', // IMPORTANT: Adjust to your frontend's actual domain(s) in production
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Auth'], // NEW: Allow X-Admin-Auth header
  allowMethods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'], // NEW: Allow PUT and DELETE
  maxAge: 600,
  credentials: true,
}));

// Middleware for logging request details (useful for debugging)
app.use('*', async (c, next) => {
  console.log(`[Middleware] Processing ${c.req.method} request to: ${c.req.url}`);
  console.log(`[Middleware] Path: ${c.req.path}`);
  await next();
});

// Helper function to hash a string using SHA-256 (for passcodes and user passwords)
async function hashString(input: string): Promise<string> {
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hexHash;
}

// Secret for signing/verifying tokens (for demonstration, hardcoded. For production: use wrangler secret)
const JWT_SECRET_KEY = 'your_super_secret_jwt_key_12345'; // !!! CHANGE THIS IN PRODUCTION AND USE WRANGLER SECRET !!!

// --- Admin Authentication & Authorization Logic ---

// Generate a simple signed token
async function generateToken(userId: string, username: string, role: string, expiresInMinutes: number): Promise<string> {
    const payload = {
        userId,
        username,
        role,
        exp: Date.now() + expiresInMinutes * 60 * 1000, // Expiry timestamp
    };
    const header = { alg: 'HS256', typ: 'JWT' };

    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(JWT_SECRET_KEY),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(signatureInput)
    );

    const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${encodedHeader}.${encodedPayload}.${base64Signature}`;
}

// Verify a simple signed token
async function verifyToken(token: string): Promise<any | null> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.log('Invalid token format.');
            return null;
        }
        const [encodedHeader, encodedPayload, signature] = parts;

        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(JWT_SECRET_KEY),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        const isVerified = await crypto.subtle.verify(
            'HMAC',
            key,
            Uint8Array.from(atob(signature), c => c.charCodeAt(0)),
            new TextEncoder().encode(signatureInput)
        );

        if (!isVerified) {
            console.log('Token signature invalid.');
            return null;
        }

        const payload = JSON.parse(atob(encodedPayload));
        if (payload.exp < Date.now()) {
            console.log('Token expired.');
            return null;
        }

        return payload; // Return decoded payload if valid and not expired
    } catch (e) {
        console.error('Error verifying token:', e);
        return null;
    }
}

// Middleware to protect admin routes
app.use('/api/admin/*', async (c, next) => {
    console.log('[Admin Auth Middleware] Checking admin access...');
    const authHeader = c.req.header('X-Admin-Auth'); // Using custom header

    if (!authHeader) {
        console.log('[Admin Auth Middleware] No X-Admin-Auth header provided.');
        return c.json({ success: false, error: 'Authorization header missing.' }, 401);
    }

    const token = authHeader; // Assuming token is directly in header for simplicity

    const payload = await verifyToken(token);

    if (!payload) {
        console.log('[Admin Auth Middleware] Token verification failed or expired.');
        return c.json({ success: false, error: 'Unauthorized: Invalid or expired token.' }, 401);
    }

    if (payload.role !== 'admin') {
        console.log(`[Admin Auth Middleware] User ${payload.username} is not an admin.`);
        return c.json({ success: false, error: 'Forbidden: Admin access required.' }, 403);
    }

    console.log(`[Admin Auth Middleware] Admin user ${payload.username} authenticated successfully.`);
    // You can attach user info to context for downstream handlers if needed
    // c.set('user', payload);
    await next();
});

// --- Admin Login Endpoint ---
app.post('/api/admin/login', async (c) => {
    console.log('[/api/admin/login POST] Route hit!');
    const { username, password } = await c.req.json();

    if (!username || !password) {
        return c.json({ success: false, error: 'Username and password are required.' }, 400);
    }

    try {
        const { results } = await c.env.USER_DB.prepare(
            'SELECT id, username, password_hash, role FROM users WHERE username = ?'
        ).bind(username).all();

        if (!results || results.length === 0) {
            console.log(`Login failed: User '${username}' not found.`);
            return c.json({ success: false, error: 'Invalid credentials.' }, 401);
        }

        const user = results[0] as any;
        const hashedPassword = await hashString(password);

        if (hashedPassword !== user.password_hash) {
            console.log(`Login failed: Invalid password for user '${username}'.`);
            return c.json({ success: false, error: 'Invalid credentials.' }, 401);
        }

        if (user.role !== 'admin') {
            console.log(`Login failed: User '${username}' is not an admin.`);
            return c.json({ success: false, error: 'Forbidden: Admin access required.' }, 403);
        }

        // Generate session token (expires in 30 minutes)
        const sessionToken = await generateToken(user.id, user.username, user.role, 30);
        console.log(`Admin login successful for ${username}. Token generated.`);
        return c.json({ success: true, message: 'Login successful.', token: sessionToken });

    } catch (error) {
        console.error('Admin login error:', error);
        return c.json({ success: false, error: 'An error occurred during login.' }, 500);
    }
});


// --- Admin File Management Endpoints (Protected by Middleware) ---

// Get all files for admin panel
app.get('/api/admin/files', async (c) => {
    console.log('[/api/admin/files GET] Admin route hit!');
    try {
        const { results } = await c.env.DB.prepare('SELECT id, short_url_slug, original_filename, mime_type, file_size, upload_timestamp, expiry_timestamp, is_private FROM files').all();
        return c.json({ success: true, files: results });
    } catch (error) {
        console.error('Error fetching admin files:', error);
        return c.json({ success: false, error: 'Failed to fetch files.' }, 500);
    }
});

// Update a file's metadata (e.g., toggle private status)
app.put('/api/admin/files/:id', async (c) => {
    console.log('[/api/admin/files/:id PUT] Admin route hit!');
    const fileId = c.req.param('id');
    const { is_private } = await c.req.json(); // Expecting updated properties

    if (typeof is_private === 'undefined') {
        return c.json({ success: false, error: 'No update data provided.' }, 400);
    }

    try {
        const { success } = await c.env.DB.prepare(
            'UPDATE files SET is_private = ? WHERE id = ?'
        ).bind(is_private ? 1 : 0, fileId).run();

        if (success) {
            return c.json({ success: true, message: 'File updated successfully.' });
        } else {
            return c.json({ success: false, error: 'File not found or no changes made.' }, 404);
        }
    } catch (error) {
        console.error('Error updating file:', error);
        return c.json({ success: false, error: 'Failed to update file.' }, 500);
    }
});

// Delete a file and its metadata
app.delete('/api/admin/files/:id', async (c) => {
    console.log('[/api/admin/files/:id DELETE] Admin route hit!');
    const fileId = c.req.param('id');

    try {
        // First get metadata to know R2 object key
        const { results } = await c.env.DB.prepare('SELECT original_filename FROM files WHERE id = ?').bind(fileId).all();
        if (!results || results.length === 0) {
            return c.json({ success: false, error: 'File metadata not found.' }, 404);
        }
        const fileMetadata = results[0] as any;
        const r2ObjectKey = `files/${fileId}-${fileMetadata.original_filename}`;

        // Delete from R2
        await c.env.FILES_BUCKET.delete(r2ObjectKey);

        // Delete from D1
        const { success } = await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run();

        if (success) {
            return c.json({ success: true, message: 'File deleted successfully.' });
        } else {
            return c.json({ success: false, error: 'File not found in database.' }, 404);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        return c.json({ success: false, error: 'Failed to delete file.' }, 500);
    }
});


// --- Other Existing Endpoints ---

// Helper to generate a unique short URL slug (exists, but included for completeness)
// This was already present, ensuring consistency

// --- API Endpoint for File Upload (exists, but included for completeness) ---
app.post('/api/upload', async (c) => {
  console.log('[/api/upload POST] Route hit!');
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const passcode = formData.get('passcode') as string | null;
    const expiryDays = formData.get('expiryDays') as string | null;
    const isPrivate = formData.get('isPrivate') === 'true';

    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file uploaded or file is not a Blob/File.' }, 400);
    }

    const fileId = uuidv4();
    const shortUrlSlug = await generateShortUrlSlug(c.env);
    const r2ObjectKey = `files/${fileId}-${file.name}`;

    let passcodeHash: string | null = null;
    if (passcode && passcode.length > 0) {
      passcodeHash = await hashString(passcode);
    }

    let expiryTimestamp: number | null = null;
    if (expiryDays && !isNaN(parseInt(expiryDays)) && parseInt(expiryDays) > 0) {
      expiryTimestamp = Date.now() + parseInt(expiryDays) * 24 * 60 * 60 * 1000;
    }

    await c.env.FILES_BUCKET.put(r2ObjectKey, file.stream(), {
        httpMetadata: {
            contentType: file.type,
        }
    });

    await c.env.DB.prepare(
      `INSERT INTO files (id, short_url_slug, original_filename, mime_type, file_size, upload_timestamp, expiry_timestamp, passcode_hash, is_private)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      fileId,
      shortUrlSlug,
      file.name,
      file.type,
      file.size,
      Date.now(),
      expiryTimestamp,
      passcodeHash,
      isPrivate ? 1 : 0
    ).run();

    return c.json({
      success: true,
      shortUrlSlug: shortUrlSlug,
      originalFilename: file.name,
      isPrivate: isPrivate,
      expiryTimestamp: expiryTimestamp,
    });

  } catch (error) {
    console.error('File upload error:', error);
    return c.json({ success: false, error: 'Failed to upload file. Please try again.' }, 500);
  }
});

// --- API Endpoint for File Download/Retrieval (exists, but included for completeness) ---
app.get('/f/:slug', async (c) => {
  console.log('[/f/:slug GET] Route hit!');
  console.log('Download slug:', c.req.param('slug'));
  console.log('Provided passcode (if any):', c.req.query('passcode'));

  try {
    const slug = c.req.param('slug');
    const providedPasscode = c.req.query('passcode');

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM files WHERE short_url_slug = ?'
    ).bind(slug).all();

    console.log('D1 query results:', results);

    if (!results || results.length === 0) {
      console.log('File metadata not found for slug:', slug);
      return c.json({ success: false, error: 'File not found.' }, 404);
    }

    const fileMetadata = results[0] as any;
    console.log('File metadata from D1:', fileMetadata);

    if (fileMetadata.expiry_timestamp && Date.now() > fileMetadata.expiry_timestamp) {
      console.log('File expired:', slug);
      return c.json({ success: false, error: 'This file has expired and is no longer available.' }, 410);
    }

    if (fileMetadata.is_private === 1) {
      if (!providedPasscode) {
        console.log('Private file, no passcode provided.');
        return c.json({ success: false, error: 'This file is private and requires a passcode. Please provide it as a query parameter (e.g., ?passcode=YOUR_PASSCODE).' }, 401);
      }
      const providedPasscodeHash = await hashString(providedPasscode);
      if (providedPasscodeHash !== fileMetadata.passcode_hash) {
        console.log('Private file, invalid passcode.');
        return c.json({ success: false, error: 'Invalid passcode provided.' }, 403);
      }
    }

    const r2ObjectKey = `files/${fileMetadata.id}-${fileMetadata.original_filename}`;
    console.log('Attempting to retrieve from R2 with key:', r2ObjectKey);
    const object = await c.env.FILES_BUCKET.get(r2ObjectKey);

    if (!object) {
      console.log('File content not found in R2 for key:', r2ObjectKey);
      return c.json({ success: false, error: 'File content not found in storage.' }, 404);
    }
    console.log('File object retrieved from R2.');

    c.header('Content-Type', fileMetadata.mime_type || 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="${fileMetadata.original_filename}"`);
    c.header('Content-Length', fileMetadata.file_size.toString());

    return c.body(object.body);
  } catch (error) {
    console.error('Download route handler error:', error);
    return c.json({ success: false, error: 'An unexpected error occurred during download.' }, 500);
  }
});


// Fallback route for any other requests that don't match the above
app.all('*', (c) => {
    console.log('[*] Fallback route hit!');
    console.log('Fallback Request URL:', c.req.url);
    console.log('Fallback Request Path:', c.req.path);
    console.log('Fallback Request Method:', c.req.method);
    return c.json({ success: false, message: 'API route not found or method not allowed.' }, 404);
});

// Pages Function entry point
export const onRequest = async (context: PagesFunctionContext<Env>) => {
  return app.fetch(context.request, context.env);
};
