// functions/[[path]].ts (Cloudflare Pages Function Backend)
// This file should be directly inside the 'functions' directory, NOT 'functions/api'
import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { cors } from 'hono/cors'; // Import CORS middleware

// Define the environment variables (bindings)
interface Env {
  FILES_BUCKET: R2Bucket;
  DB: D1Database;
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
// Since [[path]].ts is at the root of 'functions', it catches all non-static requests.
app.use('*', cors({
  origin: '*', // IMPORTANT: Adjust to your frontend's actual domain(s) in production (e.g., 'https://fileshare-project.pages.dev')
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  maxAge: 600,
  credentials: true,
}));

// Middleware for logging request details (useful for debugging)
app.use('*', async (c, next) => {
  console.log(`[Middleware] Processing ${c.req.method} request to: ${c.req.url}`);
  console.log(`[Middleware] Path: ${c.req.path}`); // This will be the full path Hono sees (e.g., /api/upload or /f/xyz)
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
// Explicitly define the '/api/upload' route
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

    const fileId = uuidv4(); // Unique ID for the file object in R2
    const shortUrlSlug = await generateShortUrlSlug(c.env); // Unique short URL
    const r2ObjectKey = `files/${fileId}-${file.name}`; // R2 Key format

    let passcodeHash: string | null = null;
    if (passcode && passcode.length > 0) {
      passcodeHash = await hashPasscode(passcode);
    }

    let expiryTimestamp: number | null = null;
    if (expiryDays && !isNaN(parseInt(expiryDays)) && parseInt(expiryDays) > 0) {
      expiryTimestamp = Date.now() + parseInt(expiryDays) * 24 * 60 * 60 * 1000; // Expiry in milliseconds
    }

    // Upload the file to Cloudflare R2
    await c.env.FILES_BUCKET.put(r2ObjectKey, file.stream(), {
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

// --- API Endpoint for File Download/Retrieval ---
// Explicitly define the '/f/:slug' route
app.get('/f/:slug', async (c) => {
  console.log('[/f/:slug GET] Route hit!');
  console.log('Download slug:', c.req.param('slug'));
  console.log('Provided passcode (if any):', c.req.query('passcode'));

  try {
    const slug = c.req.param('slug');
    const providedPasscode = c.req.query('passcode');

    // Retrieve file metadata from D1
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM files WHERE short_url_slug = ?'
    ).bind(slug).all();

    console.log('D1 query results:', results);

    if (!results || results.length === 0) {
      console.log('File metadata not found for slug:', slug);
      return c.json({ success: false, error: 'File not found.' }, 404);
    }

    const fileMetadata = results[0] as any; // Cast for easier property access
    console.log('File metadata from D1:', fileMetadata);

    // 1. Check for expiry
    if (fileMetadata.expiry_timestamp && Date.now() > fileMetadata.expiry_timestamp) {
      console.log('File expired:', slug);
      return c.json({ success: false, error: 'This file has expired and is no longer available.' }, 410);
    }

    // 2. Check for privacy and passcode
    if (fileMetadata.is_private === 1) {
      if (!providedPasscode) {
        console.log('Private file, no passcode provided.');
        return c.json({ success: false, error: 'This file is private and requires a passcode. Please provide it as a query parameter (e.g., ?passcode=YOUR_PASSCODE).' }, 401);
      }
      const providedPasscodeHash = await hashPasscode(providedPasscode);
      if (providedPasscodeHash !== fileMetadata.passcode_hash) {
        console.log('Private file, invalid passcode.');
        return c.json({ success: false, error: 'Invalid passcode provided.' }, 403);
      }
    }

    // 3. Retrieve the file from R2
    const r2ObjectKey = `files/${fileMetadata.id}-${fileMetadata.original_filename}`;
    console.log('Attempting to retrieve from R2 with key:', r2ObjectKey);
    const object = await c.env.FILES_BUCKET.get(r2ObjectKey);

    if (!object) {
      console.log('File content not found in R2 for key:', r2ObjectKey);
      return c.json({ success: false, error: 'File content not found in storage.' }, 404);
    }
    console.log('File object retrieved from R2.');

    // Set appropriate headers for file download
    c.header('Content-Type', fileMetadata.mime_type || 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="${fileMetadata.original_filename}"`);
    c.header('Content-Length', fileMetadata.file_size.toString());

    return c.body(object.body); // Stream the file content
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
  console.log('[onRequest] Pages Function triggered.');
  console.log('Full Request URL from context:', context.request.url);
  console.log('Request method from context:', context.request.method);
  console.log('Request Path (from context.request.url):', new URL(context.request.url).pathname);

  return app.fetch(context.request, context.env);
};
