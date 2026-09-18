-- Cloudflare D1 Schema for app.bsky.video XRPC Microservice

CREATE TABLE IF NOT EXISTS video_jobs (
    job_id TEXT PRIMARY KEY,
    did TEXT NOT NULL,
    stream_uid TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('created', 'processing', 'completed', 'failed')),
    progress INTEGER NOT NULL DEFAULT 0,
    service_token TEXT NOT NULL,
    blob_ref TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_quotas (
    did TEXT PRIMARY KEY,
    videos_today INTEGER DEFAULT 0,
    bytes_today INTEGER DEFAULT 0,
    last_reset_date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_did ON video_jobs(did);
CREATE INDEX IF NOT EXISTS idx_video_jobs_state ON video_jobs(state);
