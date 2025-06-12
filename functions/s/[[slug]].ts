// functions/s/[[slug]].ts (Short URL Direct Download / UI Redirect Function)
// This file should be directly inside the 'functions/s' directory.

import { Hono } from 'hono';

interface Env {
  FILES_BUCKET: R2Bucket; // Need R2 binding to retrieve files
  DB: D1Database;         // Need D1 binding to retrieve file metadata
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

// This route catches requests like /s/SLUG
app.get('/s/:slug', async (c) => {
  console.log(`[Direct Download /s/:slug] Request received for /s/${c.req.param('slug')}`);
  const slug = c.req.param('slug');
  const providedPasscode = c.req.query('passcode'); // Capture passcode if provided in URL
  const adSeen = c.req.query('ad') === 'seen'; // Check if the ad has already been seen

  console.log(`[Download Logic /s/] Slug: ${slug}, Provided Passcode in URL: ${providedPasscode ? 'YES' : 'NO'}, Ad Seen Flag: ${adSeen}`);

  // --- NEW AD INTERCEPTION LOGIC ---
  // If the 'ad=seen' flag is NOT present, redirect to the ad screen.
  // This ensures the ad is shown before proceeding with download/passcode logic.
  if (!adSeen) {
    console.log('[Download Logic /s/] Ad not seen. Redirecting to ad screen.');
    // Construct the full original download URL for the ad screen to use
    // This will be the URL that the ad screen redirects back to.
    const currentFullDownloadUrl = c.req.url; // This will now be on file.myozarniaung.com

    // Dynamically get the current origin (file.myozarniaung.com)
    const currentOrigin = new URL(c.req.url).origin;

    // Construct the URL to redirect to your React App's Ad Screen
    // It will pass the original download URL for the AdScreen to return to.
    const adScreenRedirectUrl = new URL(currentOrigin); // Redirect to the current domain
    adScreenRedirectUrl.searchParams.set('showAd', 'true');
    adScreenRedirectUrl.searchParams.set('downloadUrl', currentFullDownloadUrl);

    return c.redirect(adScreenRedirectUrl.toString(), 302);
  }
  // --- END NEW AD INTERCEPTION LOGIC ---

  // If adSeen is true, proceed with original download logic
  try {
    // 1. Retrieve file metadata from D1
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM files WHERE short_url_slug = ?'
    ).bind(slug).all();

    if (!results || results.length === 0) {
      console.log('[Download Logic /s/] File metadata not found in D1.');
      // Redirect to frontend with an error message
      const errorMessage = encodeURIComponent('File not found or has been removed.');
      return c.redirect(`/?error=${errorMessage}`, 302);
    }

    const fileMetadata = results[0] as any;
    console.log(`[Download Logic /s/] File Metadata from D1: is_private=${fileMetadata.is_private}, stored_passcode_hash=${fileMetadata.passcode_hash}`);

    // 2. Check for expiry
    if (fileMetadata.expiry_timestamp && Date.now() > fileMetadata.expiry_timestamp) {
      console.log('[Download Logic /s/] File expired.');
      const errorMessage = encodeURIComponent('This file has expired and is no longer available.');
      return c.redirect(`/?error=${errorMessage}`, 302);
    }

    // 3. Check for privacy and passcode
    if (fileMetadata.is_private === 1) { // D1 boolean is 1 for true
      console.log('[Download Logic /s/] File is marked as private (is_private=1).');
      if (!providedPasscode) {
        console.log('[Download Logic /s/] Private file, but NO passcode was provided in the URL. Redirecting to UI.');
        // Redirect to frontend with prompt for passcode
        const promptMessage = encodeURIComponent('This file is private. Please enter the passcode to download.');
        return c.redirect(`/?slug=${slug}&promptDownload=true&message=${promptMessage}`, 302);
      }

      const providedPasscodeHash = await hashPasscode(providedPasscode);
      console.log(`[Download Logic /s/] Provided Passcode (hashed): ${providedPasscodeHash}`);
      console.log(`[Download Logic /s/] Stored Passcode (hashed): ${fileMetadata.passcode_hash}`);

      if (providedPasscodeHash !== fileMetadata.passcode_hash) {
        console.log('[Download Logic /s/] Passcode MISMATCH. Redirecting to UI with error.');
        const errorMessage = encodeURIComponent('Invalid passcode provided.');
        return c.redirect(`/?slug=${slug}&promptDownload=true&message=${errorMessage}`, 302);
      }
      console.log('[Download Logic /s/] Passcode matched. Access granted.');
    } else {
      console.log('[Download Logic /s/] File is NOT private (is_private=0). No passcode check needed.');
    }

    // If we reach here, it's either public or private with correct passcode. Proceed with R2 download.
    // 4. Retrieve the file from R2
    const r2ObjectKey = `files/${fileMetadata.id}-${fileMetadata.original_filename}`;
    console.log(`[Download Logic /s/] Attempting to retrieve from R2 with key: ${r2ObjectKey}`);
    const object = await c.env.FILES_BUCKET.get(r2ObjectKey);

    if (!object) {
      console.log('[Download Logic /s/] File content not found in R2 for given key.');
      const errorMessage = encodeURIComponent('File content not found in storage.');
      return c.redirect(`/?error=${errorMessage}`, 302);
    }
    console.log('[Download Logic /s/] File object retrieved from R2. Streaming content...');

    // 5. Set appropriate headers for file download
    c.header('Content-Type', fileMetadata.mime_type || 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="${fileMetadata.original_filename}"`);
    c.header('Content-Length', fileMetadata.file_size.toString());

    return c.body(object.body); // Stream the file content
  } catch (error) {
    console.error('[Download Logic /s/] Error in /s/:slug handler:', error);
    const errorMessage = encodeURIComponent('An unexpected error occurred during download.');
    return c.redirect(`/?error=${errorMessage}`, 302);
  }
});

// Fallback for any /s/xyz not explicitly defined within this Hono app.
app.all('*', (c) => {
    console.log('[*] /s/ Hono Fallback route hit!');
    console.log('Fallback Request URL:', c.req.url);
    console.log('Fallback Request Path (Hono):', c.req.path);
    console.log('Fallback Request Method:', c.req.method);
    const errorMessage = encodeURIComponent('Short URL not recognized.');
    return c.redirect(`/?error=${errorMessage}`, 302);
});

// Pages Function entry point for this short URL direct download
export const onRequest = async (context: PagesFunctionContext<Env>) => {
  return app.fetch(context.request, context.env);
};
