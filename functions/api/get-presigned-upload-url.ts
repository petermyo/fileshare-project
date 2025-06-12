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

    console.log(`[get-presigned-upload-url] Generating presigned URL for key: ${r2ObjectKey}`);

    // Generate a presigned PUT URL. The expiresIn property determines how long the URL is valid.
    // Ensure the Content-Type header is explicitly set if you want the browser to send it during PUT
    const uploadUrl = await c.env.FILES_BUCKET.put(r2ObjectKey, null, {
        httpMetadata: {
            contentType: fileType,
        },
        // expiration in seconds (e.g., 3600 seconds = 1 hour)
        // Adjust this based on your needs.
        // It's good practice to make it long enough for the upload to complete, but not excessively long.
        customMetadata: {
            originalFileName: encodeURIComponent(fileName), // Store original name safely
        }
    }).upload.url;

    // The upload.url from .put() is already presigned.

    console.log('[get-presigned-upload-url] Presigned URL generated successfully.');
    return c.json({ success: true, uploadUrl, r2ObjectKey }, 200);

  } catch (error) {
    console.error('[get-presigned-upload-url] Error generating presigned URL:', error);
    return c.json({ success: false, error: 'Failed to generate presigned URL.' }, 500);
  }
});

export const onRequest: PagesFunction = async (context) => {
  return app.fetch(context.request, context.env as Env, context.waitUntil);
};
