// functions/api/[[path]].ts (Cloudflare Pages Function Backend)
// This file should be directly inside the 'functions/api' directory.
import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { cors } from 'hono/cors';

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
app.use('*', cors({
  origin: '*', // IMPORTANT: Adjust this to your Pages domain in production (e.g., 'https://fileshare-project.pages.dev')
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  maxAge: 600,
  credentials: true,
}));

// Middleware for logging request details (useful for debugging)
app.use('*', async (c, next) => {
  console.log(`[Middleware] Processing ${c.req.method} request to: ${c.req.url}`);
  console.log(`[Middleware] Path Hono sees: ${c.req.path}`); // This will be the full path Hono sees (e.g., /api/upload or /api/d/xyz)
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
// Hono route now includes the /api/ prefix
app.post('/api/upload', async (c) => { // CHANGED: Now /api/upload
  console.log('[/api/upload POST] Hono route hit!');
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const passcode = formData.get('passcode') as string | null;
    const expiryDays = formData.get('expiryDays') as string | null;
    const isPrivate = formData.get('isPrivate') === 'true'; // Checkbox value as string

    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file uploaded or file is not a Blob/File.' }, 400);
    }

    const fileId = uuidv4();
    const shortUrlSlug = await generateShortUrlSlug(c.env);
    const r2ObjectKey = `files/${fileId}-${file.name}`;

    let passcodeHash: string | null = null;
    if (passcode && passcode.length > 0) {
      passcodeHash = await hashPasscode(passcode);
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

// --- API Endpoint for File Download/Retrieval ---
// Hono route now includes the /api/ prefix
app.get('/api/d/:slug', async (c) => { // CHANGED: Now /api/d/:slug
  console.log('[/api/d/:slug GET] Hono route hit!');
  const slug = c.req.param('slug');
  const providedPasscode = c.req.query('passcode');

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM files WHERE short_url_slug = ?'
  ).bind(slug).all();

  if (!results || results.length === 0) {
    return c.json({ success: false, error: 'File not found.' }, 404);
  }

  const fileMetadata = results[0] as any;

  if (fileMetadata.expiry_timestamp && Date.now() > fileMetadata.expiry_timestamp) {
    return c.json({ success: false, error: 'This file has expired and is no longer available.' }, 410);
  }

  if (fileMetadata.is_private === 1) {
    if (!providedPasscode) {
      return c.json({ success: false, error: 'This file is private and requires a passcode. Please provide it as a query parameter (e.g., ?passcode=YOUR_PASSCODE).' }, 401);
    }
    const providedPasscodeHash = await hashPasscode(providedPasscode);
    if (providedPasscodeHash !== fileMetadata.passcode_hash) {
      return c.json({ success: false, error: 'Invalid passcode provided.' }, 403);
    }
  }

  const r2ObjectKey = `files/${fileMetadata.id}-${fileMetadata.original_filename}`;
  const object = await c.env.FILES_BUCKET.get(r2ObjectKey);

  if (!object) {
    return c.json({ success: false, error: 'File content not found in storage.' }, 404);
  }

  c.header('Content-Type', fileMetadata.mime_type || 'application/octet-stream');
  c.header('Content-Disposition', `attachment; filename="${fileMetadata.original_filename}"`);
  c.header('Content-Length', fileMetadata.file_size.toString());

  return c.body(object.body);
});

// Fallback for any /api/xyz not explicitly defined.
app.all('*', (c) => {
    console.log('[*] Hono Fallback route hit!');
    console.log('Fallback Request URL:', c.req.url);
    console.log('Fallback Request Path (Hono):', c.req.path);
    console.log('Fallback Request Method:', c.req.method);
    return c.notFound(); // Returns Hono's default 404 Not Found JSON
});

// Pages Function entry point: Cloudflare Pages automatically calls the onRequest export.
export const onRequest = async (context: PagesFunctionContext<Env>) => {
  console.log('[onRequest] Pages Function triggered.');
  console.log('Full Request URL from context:', context.request.url);
  console.log('Request method from context:', context.request.method);
  console.log('Request Path (from context.request.url):', new URL(context.request.url).pathname);

  // Pass the request and environment context to your Hono app
  return app.fetch(context.request, context.env);
};
