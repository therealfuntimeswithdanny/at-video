import type { Env } from './types';

interface StreamUploadResponse {
  success: boolean;
  result?: { uid?: string };
  errors?: Array<{ message?: string }>;
}

export async function uploadVideoToStream(
  env: Env,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<string> {
  if (!env.CF_ACCOUNT_ID || !env.CF_STREAM_TOKEN) {
    throw new Error('StreamConfigurationMissing: Set CF_ACCOUNT_ID and CF_STREAM_TOKEN');
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_STREAM_TOKEN}`,
      'Content-Type': contentType,
    },
    body: bytes,
  });
  const data = await response.json() as StreamUploadResponse;
  if (!response.ok || !data.success || !data.result?.uid) {
    const message = data.errors?.[0]?.message || `Cloudflare Stream upload failed (${response.status})`;
    throw new Error(message);
  }
  return data.result.uid;
}