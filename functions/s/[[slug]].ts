// functions/s/[[slug]].ts (Direct Download Function)
// This file should be directly inside the 'functions/s' directory.
// It handles requests for /s/SLUG and directly serves the file.

import { Hono } from 'hono';

interface Env {
  FILES_BUCKET: R2Bucket; // Need R2 binding to retrieve files
  DB: D1Database;         // Need D1 binding to retrieve file metadata
}

interface PagesFunctionContext<Env> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  passThroughOnException: () => void;
}

const app = new Hono<{ Bindings: Env }>();

// Helper function to hash a string using SHA-256 (for passcodes)
async function hashPasscode(passcode: string): Promise<string> {
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hexHash;
}

// This route catches requests like /s/SLUG and directly serves the file
app.get('/s/:slug', async (c) => {
  console.log(`[Direct Download /s/:slug] Request received for /s/${c.req.param('slug')}`);
  const slug = c.req.param('slug');
  const providedPasscode = c.req.query('passcode'); // Capture passcode if provided in URL

  console.log(`[Download Debug /s/] Slug: ${slug}, Provided Passcode in URL: ${providedPasscode ? 'YES' : 'NO'}`);

  try {
    // 1. Retrieve file metadata from D1
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM files WHERE short_url_slug = ?'
    ).bind(slug).all();

    if (!results || results.length === 0) {
      console.log('[Download Debug /s/] File metadata not found in D1.');
      return c.json({ success: false, error: 'File not found.' }, 404);
    }

    const fileMetadata = results[0] as any;
    console.log(`[Download Debug /s/] File Metadata from D1: is_private=${fileMetadata.is_private}, stored_passcode_hash=${fileMetadata.passcode_hash}`);

    // 2. Check for expiry
    if (fileMetadata.expiry_timestamp && Date.now() > fileMetadata.expiry_timestamp) {
      console.log('[Download Debug /s/] File expired.');
      return c.json({ success: false, error: 'This file has expired and is no longer available.' }, 410);
    }

    // 3. Check for privacy and passcode
    if (fileMetadata.is_private === 1) { // D1 boolean is 1 for true
      console.log('[Download Debug /s/] File is marked as private (is_private=1).');
      if (!providedPasscode) {
        console.log('[Download Debug /s/] Private file, but NO passcode was provided in the URL.');
        return c.json({ success: false, error: 'This file is private and requires a passcode. Please provide it as a query parameter (e.g., ?passcode=YOUR_PASSCODE).' }, 401);
      }
      const providedPasscodeHash = await hashPasscode(providedPasscode);
      console.log(`[Download Debug /s/] Provided Passcode (hashed): ${providedPasscodeHash}`);
      console.log(`[Download Debug /s/] Stored Passcode (hashed): ${fileMetadata.passcode_hash}`);

      if (providedPasscodeHash !== fileMetadata.passcode_hash) {
        console.log('[Download Debug /s/] Passcode MISMATCH. Invalid passcode provided.');
        return c.json({ success: false, error: 'Invalid passcode provided.' }, 403);
      }
      console.log('[Download Debug /s/] Passcode matched. Access granted.');
    } else {
      console.log('[Download Debug /s/] File is NOT private (is_private=0). No passcode check needed.');
    }

    // 4. Retrieve the file from R2
    const r2ObjectKey = `files/${fileMetadata.id}-${fileMetadata.original_filename}`;
    console.log(`[Download Debug /s/] Attempting to retrieve from R2 with key: ${r2ObjectKey}`);
    const object = await c.env.FILES_BUCKET.get(r2ObjectKey);

    if (!object) {
      console.log('[Download Debug /s/] File content not found in R2 for given key.');
      return c.json({ success: false, error: 'File content not found in storage.' }, 404);
    }
    console.log('[Download Debug /s/] File object retrieved from R2. Streaming content...');

    // 5. Set appropriate headers for file download
    c.header('Content-Type', fileMetadata.mime_type || 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="${fileMetadata.original_filename}"`);
    c.header('Content-Length', fileMetadata.file_size.toString());

    return c.body(object.body); // Stream the file content
  } catch (error) {
    console.error('[Download Debug /s/] Error in /s/:slug handler:', error);
    return c.json({ success: false, error: 'An unexpected error occurred during download.' }, 500);
  }
});

// Fallback for any /s/xyz not explicitly defined within this Hono app.
app.all('*', (c) => {
    console.log('[*] /s/ Hono Fallback route hit!');
    console.log('Fallback Request URL:', c.req.url);
    console.log('Fallback Request Path (Hono):', c.req.path);
    console.log('Fallback Request Method:', c.req.method);
    return c.notFound();
});


// Pages Function entry point for this short URL direct download
export const onRequest = async (context: PagesFunctionContext<Env>) => {
  return app.fetch(context.request, context.env);
};
