export interface Env {
  DB: D1Database;
  RAW_STORAGE: R2Bucket;
  CF_ACCOUNT_ID: string;
  CF_STREAM_TOKEN: string;
  STREAM_WEBHOOK_SECRET: string;
  SERVICE_DID: string;
  SERVICE_DOMAIN: string;
  MAX_FILE_SIZE_BYTES: number;
  DAILY_LIMIT_PER_USER: number;
}

export interface VideoJobRecord {
  job_id: string;
  did: string;
  stream_uid: string;
  state: 'created' | 'processing' | 'completed' | 'failed';
  progress: number;
  service_token: string;
  blob_ref?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface BlobRef {
  $type: 'blob';
  ref: {
    $link: string;
  };
  mimeType: string;
  size: number;
}

export interface JobStatusResponse {
  jobStatus: {
    jobId: string;
    did: string;
    state: 'created' | 'processing' | 'completed' | 'failed';
    progress: number;
    blob?: BlobRef;
    error?: string;
    message?: string;
  };
}

export interface UploadLimitsResponse {
  canUpload: boolean;
  remainingDailyVideos: number;
  remainingDailyBytes: number;
  message?: string;
}