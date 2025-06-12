// functions/api/get-presigned-upload-url.ts
// This Pages Function provides a presigned URL for direct file upload to R2
// using the AWS SDK S3 Request Presigner as a workaround for getPresignedUrl issues.

import { Hono } from 'hono';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Ensure these environment variables are set in your Cloudflare Pages project settings
// R2_ACCESS_KEY_ID
// R2_SECRET_ACCESS_KEY
// R2_ACCOUNT_ID (Your Cloudflare Account ID)
// R2_BUCKET_NAME (e.g., 'filesharing')

interface Env {
  // We still list FILES_BUCKET for type safety, but we'll use AWS SDK for presigning
  FILES_BUCKET: R2Bucket; 
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string; // Your Cloudflare Account ID (from dashboard URL or Workers & Pages overview)
  R2_BUCKET_NAME: string; // The name of your R2 bucket (e.g., 'filesharing')
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

    // --- ENHANCED CHECK AND LOGGING FOR ENVIRONMENT VARIABLES ---
    const missingEnv = [];
    if (!c.env.R2_ACCOUNT_ID) missingEnv.push('R2_ACCOUNT_ID');
    if (!c.env.R2_ACCESS_KEY_ID) missingEnv.push('R2_ACCESS_KEY_ID');
    if (!c.env.R2_SECRET_ACCESS_KEY) missingEnv.push('R2_SECRET_ACCESS_KEY');
    if (!c.env.R2_BUCKET_NAME) missingEnv.push('R2_BUCKET_NAME');

    if (missingEnv.length > 0) {
        console.error(`[get-presigned-upload-url] ERROR: Missing environment variables: ${missingEnv.join(', ')}`);
        return c.json({ success: false, error: `Missing R2 configuration environment variables: ${missingEnv.join(', ')}` }, 500);
    }

    console.log(`[get-presigned-upload-url] R2_ACCOUNT_ID: ${c.env.R2_ACCOUNT_ID ? 'SET' : 'NOT SET'}`);
    console.log(`[get-presigned-upload-url] R2_ACCESS_KEY_ID: ${c.env.R2_ACCESS_KEY_ID ? 'SET' : 'NOT SET'} (masked)`);
    console.log(`[get-presigned-upload-url] R2_SECRET_ACCESS_KEY: ${c.env.R2_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET'} (masked)`);
    console.log(`[get-presigned-upload-url] R2_BUCKET_NAME: "${c.env.R2_BUCKET_NAME}"`); // Log the actual value to check for empty string
    // --- END ENHANCED CHECK AND LOGGING ---


    // Generate a unique ID for the R2 object to avoid collisions
    const fileId = crypto.randomUUID();
    const r2ObjectKey = `files/${fileId}-${fileName}`; // Standard R2 key format

    console.log(`[get-presigned-upload-url] Generating presigned PUT URL for key: ${r2ObjectKey} using AWS SDK.`);

    let uploadUrl;
    try {
        // Configure S3Client to point to Cloudflare R2's S3-compatible endpoint
        const s3Client = new S3Client({
            region: 'auto', // Cloudflare R2 does not use traditional AWS regions
            endpoint: `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, // Your R2 custom endpoint
            credentials: {
                accessKeyId: c.env.R2_ACCESS_KEY_ID,
                secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
            },
            // Recommended for Cloudflare R2 (path style access)
            forcePathStyle: true, 
        });

        const command = new PutObjectCommand({
            Bucket: c.env.R2_BUCKET_NAME, // Your bucket name, now explicitly logged
            Key: r2ObjectKey, // The object key in R2
            ContentType: fileType, // The content type of the file
            // You can add other S3 PutObject parameters here if needed
            // e.g., ContentLength: fileSize,
            Metadata: {
              originalfilename: encodeURIComponent(fileName), // Custom metadata for R2
            }
        });

        // Generate the presigned URL
        // expiresIn is in seconds (e.g., 3600 for 1 hour)
        uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        
    } catch (presignError) {
        console.error('[get-presigned-upload-url] R2 presign (AWS SDK) failed:', presignError);
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
