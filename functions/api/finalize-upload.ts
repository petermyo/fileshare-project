// functions/api/finalize-upload.ts
// This Pages Function receives metadata after a direct R2 upload and saves it to D1.

import { Hono } from 'hono';

interface Env {
  DB: D1Database; // Ensure this D1 binding is configured in your Pages project
}

interface RequestBody {
  r2ObjectKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  isPrivate: boolean;
  passcode: string; // Raw passcode will be hashed here
  expiryDays: string; // Number as string or empty
}

const app = new Hono<{ Bindings: Env }>();

// Helper function to hash a string using SHA-256 (copied from s/[[slug]].ts)
async function hashPasscode(passcode: string): Promise<string> {
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hexHash;
}

// Helper to generate a short slug
function generateShortSlug(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}


app.post('/api/finalize-upload', async (c) => {
  console.log('[finalize-upload] Request received.');
  try {
    const { r2ObjectKey, originalFilename, mimeType, fileSize, isPrivate, passcode, expiryDays } = await c.req.json() as RequestBody;

    if (!r2ObjectKey || !originalFilename || !mimeType || typeof fileSize !== 'number') {
      console.warn('[finalize-upload] Missing required metadata.');
      return c.json({ success: false, error: 'Missing required file metadata.' }, 400);
    }

    let shortUrlSlug = generateShortSlug(); // Generate a slug for the public download URL
    let expiryTimestamp: number | null = null;
    let passcodeHash: string | null = null;

    if (isPrivate && passcode) {
      passcodeHash = await hashPasscode(passcode);
    } else if (isPrivate && !passcode) {
      // This should ideally be caught on the frontend, but as a backend safeguard:
      return c.json({ success: false, error: 'Passcode is required for private files.' }, 400);
    }

    if (expiryDays) {
      const days = parseInt(expiryDays, 10);
      if (!isNaN(days) && days > 0) {
        expiryTimestamp = Date.now() + (days * 24 * 60 * 60 * 1000); // Convert days to milliseconds
      }
    }
    
    // Extract fileId from r2ObjectKey (e.g., "files/FILEID-filename.ext")
    const fileId = r2ObjectKey.split('/')[1].split('-')[0];

    // Insert metadata into D1
    const { success } = await c.env.DB.prepare(
      `INSERT INTO files (
        id,
        original_filename,
        mime_type,
        file_size,
        short_url_slug,
        is_private,
        passcode_hash,
        expiry_timestamp,
        uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      fileId, // Use the generated fileId from R2 key
      originalFilename,
      mimeType,
      fileSize,
      shortUrlSlug,
      isPrivate ? 1 : 0, // D1 stores booleans as 1 or 0
      passcodeHash,
      expiryTimestamp,
      Date.now()
    ).run();

    if (!success) {
        throw new Error("Failed to insert file metadata into database.");
    }

    console.log('[finalize-upload] File metadata saved to D1 successfully.');
    return c.json({
        success: true,
        shortUrlSlug,
        originalFilename, // Return originalFilename for local storage consistency
        isPrivate,
        expiryTimestamp
    }, 200);

  } catch (error) {
    console.error('[finalize-upload] Error saving file metadata:', error);
    return c.json({ success: false, error: error.message || 'Failed to save file metadata.' }, 500);
  }
});

export const onRequest: PagesFunction = async (context) => {
  return app.fetch(context.request, context.env as Env, context.waitUntil);
};
