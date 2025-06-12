DROP TABLE IF EXISTS files;
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    short_url_slug TEXT UNIQUE NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    upload_timestamp INTEGER NOT NULL,
    expiry_timestamp INTEGER,
    passcode_hash TEXT,
    is_private BOOLEAN NOT NULL DEFAULT 0
);
