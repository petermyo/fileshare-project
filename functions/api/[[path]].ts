// functions/[[path]].ts (Cloudflare Pages Function Backend)
import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { cors } from 'hono/cors'; // Import CORS middleware for development/cross-origin access

// Define the environment variables (bindings) that Cloudflare Pages Functions will inject
// Also define the PagesFunctionContext type for explicit context handling
interface Env {
  FILES_BUCKET: R2Bucket;
  DB: D1Database;
}

// PagesFunctionContext type for explicit context handling
// This type is automatically provided by Cloudflare Pages runtime.
interface PagesFunctionContext<Env> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  passThroughOnException: () => void;
}


const app = new Hono<{ Bindings: Env }>();

// NO app.basePath() here. Routes will now explicitly include their full paths.

// Add CORS middleware. Apply CORS to all routes this function handles.
app.use('*', cors({ // Apply CORS to all routes *this function* handles (e.g., /api/* and /f/*)
  origin: '*', // Adjust this to your frontend's actual domain(s) in production
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  maxAge: 600,
  credentials: true,
}));

// NEW: Add a middleware to log the path Hono sees
app.use('*', async (c, next) => {
  console.log('[Middleware] Hono processing request.');
  console.log('[Middleware] Request Method:', c.req.method);
  console.log('[Middleware] Request Path (c.req.path):', c.req.path); // This path should be the full path (e.g., /api/upload or /f/xyz)
  console.log('[Middleware] Request URL (c.req.url):', c.req.url);   // This is the full URL
  await next();
});


// Helper function to hash a string using SHA-256 (for passcodes)
async function hashPasscode(passcode: string): Promise<string> {
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hexHash;
}

// Helper to generate a unique short URL slug
const generateShortUrlSlug = async (env: Env): Promise<string> => {
  let slug = '';
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const slugLength = 8; // Increased length for better uniqueness

  while (true) {
    slug = ''; // Reset slug for each attempt
    for (let i = 0; i < slugLength; i++) {
      slug += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    // Check if the generated slug already exists in D1
    const { results } = await env.DB.prepare(
      'SELECT id FROM files WHERE short_url_slug = ?'
    ).bind(slug).all();

    if (results.length === 0) {
      return slug; // Slug is unique, use it
    }
    // If slug exists, the loop continues to generate a new one
  }
};

// --- API Endpoint for File Upload ---
// Route now explicitly includes '/api' prefix
app.post('/api/upload', async (c) => {
  console.log('[/api/upload POST] Route hit!'); // This log should appear if matched
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const passcode = formData.get('passcode') as string | null;
    const expiryDays = formData.get('expiryDays') as string | null;
    const isPrivate = formData.get('isPrivate') === 'true'; // Checkbox value as string

    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file uploaded or file is not a Blob/File.' }, 400);
    }

    const fileId = uuidv4(); // Unique ID for the file object in R2
    const shortUrlSlug = await generateShortUrlSlug(c.env); // Unique short URL
    // R2 Object Key: files/<UUID>-<OriginalFilename> to keep original name reference
    const r2ObjectKey = `files/${fileId}-${file.name}`;

    let passcodeHash: string | null = null;
    if (passcode && passcode.length > 0) {
      passcodeHash = await hashPasscode(passcode);
    }

    let expiryTimestamp: number | null = null;
    if (expiryDays && !isNaN(parseInt(expiryDays)) && parseInt(expiryDays) > 0) {
      // Calculate expiry in milliseconds from now
      expiryTimestamp = Date.now() + parseInt(expiryDays) * 24 * 60 * 60 * 1000;
    }

    // Upload the file to Cloudflare R2
    await c.env.FILES_BUCKET.put(r2ObjectKey, file.stream(), {
        // Optional: Set some R2 metadata if needed
        httpMetadata: {
            contentType: file.type,
        }
    });

    // Store file metadata in Cloudflare D1
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
      isPrivate ? 1 : 0 // D1 stores booleans as 0 or 1
    ).run();

    // The frontend will now construct the URL based on the Pages domain + /download/slug
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

// --- API Endpoint for File Download/Retrieval ---
// Route now explicitly includes '/f' prefix
app.get('/f/:slug', async (c) => { // Route explicitly defined as /f/:slug
  console.log('[/f/:slug GET] Route hit!'); // Updated log
  const slug = c.req.param('slug');
  const providedPasscode = c.req.query('passcode');

  // Retrieve file metadata from D1
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM files WHERE short_url_slug = ?'
  ).bind(slug).all();

  if (!results || results.length === 0) {
    return c.json({ success: false, error: 'File not found.' }, 404);
  }

  const fileMetadata = results[0] as any; // Cast for easier property access

  // 1. Check for expiry
  if (fileMetadata.expiry_timestamp && Date.now() > fileMetadata.expiry_timestamp) {
    // Optionally, you could also delete the file from R2 and D1 here
    // await c.env.FILES_BUCKET.delete(`files/${fileMetadata.id}-${fileMetadata.original_filename}`);
    // await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileMetadata.id).run();
    return c.json({ success: false, error: 'This file has expired and is no longer available.' }, 410); // 410 Gone
  }

  // 2. Check for privacy and passcode
  if (fileMetadata.is_private === 1) { // D1 boolean is 1 for true
    if (!providedPasscode) {
      return c.json({ success: false, error: 'This file is private and requires a passcode. Please provide it as a query parameter (e.g., ?passcode=YOUR_PASSCODE).' }, 401);
    }
    const providedPasscodeHash = await hashPasscode(providedPasscode);
    if (providedPasscodeHash !== fileMetadata.passcode_hash) {
      return c.json({ success: false, error: 'Invalid passcode provided.' }, 403);
    }
  }

  // 3. Retrieve the file from R2
  const r2ObjectKey = `files/${fileMetadata.id}-${fileMetadata.original_filename}`;
  const object = await c.env.FILES_BUCKET.get(r2ObjectKey);

  if (!object) {
    return c.json({ success: false, error: 'File content not found in storage.' }, 404);
  }

  // Set appropriate headers for file download
  c.header('Content-Type', fileMetadata.mime_type || 'application/octet-stream');
  c.header('Content-Disposition', `attachment; filename="${fileMetadata.original_filename}"`);
  c.header('Content-Length', fileMetadata.file_size.toString());

  return c.body(object.body); // Stream the file content
});


// Fallback route for any other API requests that don't match the above
app.all('*', (c) => {
    console.log('[*] Fallback route hit!'); // Updated log for the general fallback
    console.log('Fallback Request URL:', c.req.url);
    console.log('Fallback Request Path:', c.req.path);
    console.log('Fallback Request Method:', c.req.method);
    return c.json({ success: false, message: 'API route not found or method not allowed.' }, 404);
});

// CRUCIAL CHANGE HERE: Explicitly pass context.request and context.env to app.fetch
export const onRequest = async (context: PagesFunctionContext<Env>) => {
  console.log('[onRequest] Pages Function triggered.');
  console.log('Full Request URL from context:', context.request.url);
  console.log('Request method from context:', context.request.method);
  console.log('Request Path (from context.request.url):', new URL(context.request.url).pathname);

  return app.fetch(context.request, context.env);
};
