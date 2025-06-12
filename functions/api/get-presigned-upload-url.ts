// functions/api/get-presigned-upload-url.ts
// This Pages Function provides a presigned URL for direct file upload to R2.

import { Hono } from 'hono';

interface Env {
  FILES_BUCKET: R2Bucket; // Ensure this R2 binding is configured in your Pages project
}

interface RequestBody {
  fileName: string;
  fileType: string;
  fileSize: number;
}

const app = new Hono<{ Bindings: Env }>();

app.post('/api/get-presigned-upload-url', async (c) => {
  console.log('[get-presigned-upload-url] Request received.');
  try {
    const { fileName, fileType, fileSize } = await c.req.json() as RequestBody;

    if (!fileName || !fileType || typeof fileSize !== 'number') {
      console.warn('[get-presigned-upload-url] Missing required parameters.');
      return c.json({ success: false, error: 'Missing fileName, fileType, or fileSize' }, 400);
    }

    // Generate a unique ID for the R2 object to avoid collisions
    const fileId = crypto.randomUUID();
    const r2ObjectKey = `files/${fileId}-${fileName}`; // Standard R2 key format

    console.log(`[get-presigned-upload-url] Generating presigned PUT URL for key: ${r2ObjectKey}`);

    let uploadUrl;
    try {
        // --- FIX APPLIED HERE ---
        // Use getPresignedUrl for generating an upload URL for the client.
        // The 'put' method is for directly putting a file from the worker itself.
        uploadUrl = await c.env.FILES_BUCKET.getPresignedUrl(
            r2ObjectKey,
            {
                method: 'PUT', // Crucially specify it's a PUT method for upload
                // Optional: set expiration for the URL (e.g., 1 hour = 3600 seconds)
                expiration: 3600,
                // These headers guide the client on what to send, useful for R2
                headers: {
                    'Content-Type': fileType,
                    // 'Content-Length': fileSize.toString(), // Content-Length can sometimes cause issues if client doesn't send exact match
                },
            }
        );
    } catch (presignError) {
        console.error('[get-presigned-upload-url] R2 getPresignedUrl failed:', presignError);
        // Provide more detail in the error message for debugging
        return c.json({ success: false, error: `R2 presign error: ${presignError.message || presignError}` }, 500);
    }

    console.log('[get-presigned-upload-url] Presigned URL generated successfully.');
    return c.json({ success: true, uploadUrl, r2ObjectKey }, 200);

  } catch (error) {
    console.error('[get-presigned-upload-url] Uncaught error in handler:', error);
    return c.json({ success: false, error: 'Failed to generate presigned URL due to an internal error.' }, 500);
  }
});

export const onRequest: PagesFunction = async (context) => {
  return app.fetch(context.request, context.env as Env, context.waitUntil);
};
