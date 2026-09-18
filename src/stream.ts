import type { Env } from './types';

interface StreamResponse {
  success: boolean;
  result?: { uid?: string };
  errors?: Array<{ message?: string }>;
}

export async function uploadVideoToStream(env: Env, bytes: ArrayBuffer, contentType: string): Promise<string> {
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
  const data = await response.json() as StreamResponse;
  if (!response.ok || !data.success || !data.result?.uid) {
    throw new Error(data.errors?.[0]?.message || `Cloudflare Stream upload failed (${response.status})`);
  }
  return data.result.uid;
}

export function streamManifestUrl(uid: string): string {
  return `https://videodelivery.net/${encodeURIComponent(uid)}/manifest/video.m3u8`;
}

export function streamThumbnailUrl(uid: string): string {
  return `https://videodelivery.net/${encodeURIComponent(uid)}/thumbnails/thumbnail.jpg`;
}