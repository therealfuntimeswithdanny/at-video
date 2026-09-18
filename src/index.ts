import { serviceAuthAudience, tokenFromAuthorization, verifyServiceToken } from './auth';
import { resolvePdsEndpoint, uploadBlobToPds } from './pds';
import { storeVideo } from './storage';
import { streamManifestUrl, streamThumbnailUrl, uploadVideoToStream } from './stream';
import type { Env, JobStatusResponse, UploadLimitsResponse, VideoJobRecord } from './types';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    const url = new URL(request.url);

    try {
      const watchMatch = url.pathname.match(/^\/watch\/([^/]+)\/([^/]+)\/(playlist\.m3u8|video\.mp4|thumbnail\.jpg)$/);
      if (watchMatch && (request.method === 'GET' || request.method === 'HEAD')) {
        return await handleWatchRequest(env, request, decodeURIComponent(watchMatch[1]), watchMatch[2], watchMatch[3]);
      }

      if (url.pathname === '/xrpc/app.bsky.video.getUploadLimits' && request.method === 'GET') {
        const did = await verifyServiceToken(request.headers.get('Authorization'), serviceAuthAudience(env));
        const quota = await getQuota(env, did);
        return json(limits(env, quota.videos_today, quota.bytes_today));
      }


async function handleWatchRequest(env: Env, request: Request, did: string, cid: string, format: string): Promise<Response> {
  // Videos created before this service became the CDN live on Bluesky's public video CDN.
  // Redirecting preserves the manifest's relative segment URLs and requires no Cloudflare auth.
  const legacyUrl = `https://video.cdn.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/${format}`;
  if (format === 'playlist.m3u8' || format === 'thumbnail.jpg') {
    const legacyResponse = await fetch(legacyUrl, { redirect: 'manual' });
    if (legacyResponse.status >= 200 && legacyResponse.status < 400) {
      return Response.redirect(legacyUrl, 302);
    }
  }

  const cachedStreamUid = await findStreamUid(env, did, cid);
  if (cachedStreamUid) {
    return Response.redirect(format === 'thumbnail.jpg' ? streamThumbnailUrl(cachedStreamUid) : streamManifestUrl(cachedStreamUid), 302);
  }

  const pdsEndpoint = await resolvePdsEndpoint(did);
  const blobUrl = new URL(`${pdsEndpoint}/xrpc/com.atproto.sync.getBlob`);
  blobUrl.searchParams.set('did', did);
  blobUrl.searchParams.set('cid', cid);
  if (format === 'playlist.m3u8') {
    const blobResponse = await fetch(blobUrl);
    if (!blobResponse.ok) return json({ error: 'VideoPlaybackNotFound' }, 404);
    const streamUid = await uploadVideoToStream(env, await blobResponse.arrayBuffer(), blobResponse.headers.get('Content-Type') || 'video/mp4');
    await cacheStreamJob(env, did, cid, streamUid);
    return Response.redirect(streamManifestUrl(streamUid), 302);
  }
  if (format === 'thumbnail.jpg') {
    const blobResponse = await fetch(blobUrl);
    if (!blobResponse.ok) return json({ error: 'VideoPlaybackNotFound' }, 404);
    const streamUid = await uploadVideoToStream(env, await blobResponse.arrayBuffer(), blobResponse.headers.get('Content-Type') || 'video/mp4');
    await cacheStreamJob(env, did, cid, streamUid);
    return Response.redirect(streamThumbnailUrl(streamUid), 302);
  }

  const blobResponse = await fetch(blobUrl, {
    method: 'GET',
    headers: request.headers.get('Range') ? { Range: request.headers.get('Range')! } : undefined,
  });
  if (!blobResponse.ok) return json({ error: 'VideoPlaybackNotFound' }, 404);
  return new Response(blobResponse.body, {
    status: blobResponse.status,
    headers: {
      ...headers,
      'Content-Type': blobResponse.headers.get('Content-Type') || 'video/mp4',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...(blobResponse.headers.get('Content-Length') ? { 'Content-Length': blobResponse.headers.get('Content-Length')! } : {}),
      ...(blobResponse.headers.get('Content-Range') ? { 'Content-Range': blobResponse.headers.get('Content-Range')! } : {}),
      ...(blobResponse.headers.get('Accept-Ranges') ? { 'Accept-Ranges': blobResponse.headers.get('Accept-Ranges')! } : { 'Accept-Ranges': 'bytes' }),
    },
  });
}

async function findStreamUid(env: Env, did: string, cid: string): Promise<string | null> {
  const jobs = await env.DB.prepare('SELECT stream_uid, blob_ref FROM video_jobs WHERE did = ? AND state = ?')
    .bind(did, 'completed')
    .all<{ stream_uid: string; blob_ref: string | null }>();
  for (const job of jobs.results) {
    if (!job.blob_ref || !job.stream_uid || job.stream_uid.startsWith('videos/')) continue;
    try {
      if ((JSON.parse(job.blob_ref) as { ref?: { $link?: string } }).ref?.$link === cid) return job.stream_uid;
    } catch {
      // Ignore malformed historical blob references.
    }
  }
  return null;
}

async function cacheStreamJob(env: Env, did: string, cid: string, streamUid: string) {
  const jobId = `legacy-${cid}`;
  const blobRef = JSON.stringify({ $type: 'blob', ref: { $link: cid } });
  await env.DB.prepare(`INSERT INTO video_jobs (job_id, did, stream_uid, state, progress, service_token, blob_ref) VALUES (?, ?, ?, 'completed', 100, '', ?) ON CONFLICT(job_id) DO UPDATE SET stream_uid = excluded.stream_uid, state = excluded.state, progress = excluded.progress, blob_ref = excluded.blob_ref, updated_at = CURRENT_TIMESTAMP`)
    .bind(jobId, did, streamUid, blobRef)
    .run();
}
      if (url.pathname === '/xrpc/app.bsky.video.uploadVideo' && request.method === 'POST') {
        const authorization = request.headers.get('Authorization');
        const did = await verifyServiceToken(authorization, serviceAuthAudience(env));
        const quota = await getQuota(env, did);
        if (quota.videos_today >= env.DAILY_LIMIT_PER_USER) return json({ error: 'DailyLimitExceeded' }, 429);

        const jobId = crypto.randomUUID();
        const contentType = request.headers.get('Content-Type') || 'video/mp4';
        const stored = await storeVideo(env, jobId, request.body, contentType, request.headers.get('Content-Length') ? Number(request.headers.get('Content-Length')) : null);
        const token = tokenFromAuthorization(authorization);
        await env.DB.prepare('INSERT INTO video_jobs (job_id, did, stream_uid, state, progress, service_token) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(jobId, did, stored.key, 'processing', 10, token).run();
        await incrementQuota(env, did, stored.size);
        ctx.waitUntil(processVideoJob(env, jobId, did, stored.key, token, contentType));
        return json({ jobStatus: { jobId, did, state: 'processing', progress: 10 } }, 202);
      }

      if (url.pathname === '/xrpc/app.bsky.video.getJobStatus' && request.method === 'GET') {
        const did = await verifyServiceToken(request.headers.get('Authorization'), serviceAuthAudience(env));
        const jobId = url.searchParams.get('jobId');
        if (!jobId) return json({ error: 'MissingJobId' }, 400);
        const job = await env.DB.prepare('SELECT * FROM video_jobs WHERE job_id = ? AND did = ?').bind(jobId, did).first<VideoJobRecord>();
        if (!job) return json({ error: 'JobNotFound' }, 404);
        const result: JobStatusResponse = { jobStatus: { jobId: job.job_id, did: job.did, state: job.state, progress: job.progress } };
        if (job.blob_ref) result.jobStatus.blob = JSON.parse(job.blob_ref);
        if (job.error_message) result.jobStatus.error = job.error_message;
        return json(result);
      }
      return new Response('Not Found', { status: 404, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'InternalServerError';
      const status = message.startsWith('Auth') || message.startsWith('Invalid') || message === 'TokenExpired' ? 401 : message === 'UploadTooLarge' ? 413 : 400;
      return json({ error: message }, status);
    }
  },
};

async function getQuota(env: Env, did: string): Promise<{ videos_today: number; bytes_today: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare('SELECT videos_today, bytes_today, last_reset_date FROM user_quotas WHERE did = ?').bind(did).first<{ videos_today: number; bytes_today: number; last_reset_date: string }>();
  if (!row || row.last_reset_date !== today) return { videos_today: 0, bytes_today: 0 };
  return row;
}

function limits(env: Env, videos: number, bytes: number): UploadLimitsResponse {
  return { canUpload: videos < env.DAILY_LIMIT_PER_USER, remainingDailyVideos: Math.max(0, env.DAILY_LIMIT_PER_USER - videos), remainingDailyBytes: Math.max(0, env.MAX_FILE_SIZE_BYTES - bytes) };
}

async function incrementQuota(env: Env, did: string, bytes: number) {
  const today = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(`INSERT INTO user_quotas (did, videos_today, bytes_today, last_reset_date) VALUES (?, 1, ?, ?) ON CONFLICT(did) DO UPDATE SET videos_today = CASE WHEN last_reset_date = excluded.last_reset_date THEN videos_today + 1 ELSE 1 END, bytes_today = CASE WHEN last_reset_date = excluded.last_reset_date THEN bytes_today + excluded.bytes_today ELSE excluded.bytes_today END, last_reset_date = excluded.last_reset_date`).bind(did, bytes, today).run();
}

async function processVideoJob(env: Env, jobId: string, did: string, key: string, token: string, contentType: string) {
  try {
    const object = await env.RAW_STORAGE.get(key);
    if (!object) throw new Error('Video object missing from R2 storage');
    const videoBytes = await object.arrayBuffer();
    const streamUid = await uploadVideoToStream(env, videoBytes, contentType);
    await env.DB.prepare('UPDATE video_jobs SET stream_uid = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?').bind(streamUid, 60, jobId).run();
    const blob = await uploadBlobToPds(await resolvePdsEndpoint(did), token, videoBytes, contentType);
    await env.DB.prepare('UPDATE video_jobs SET state = ?, progress = ?, blob_ref = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?').bind('completed', 100, JSON.stringify(blob), jobId).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ProcessingFailed';
    await env.DB.prepare('UPDATE video_jobs SET state = ?, progress = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?').bind('failed', 100, message, jobId).run();
  }
}