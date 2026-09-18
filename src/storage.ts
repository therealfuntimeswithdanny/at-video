import type { Env } from './types';

export async function storeVideo(
  env: Env,
  jobId: string,
  body: ReadableStream<Uint8Array> | null,
  contentType: string,
  contentLength: number | null,
): Promise<{ key: string; size: number }> {
  if (!body) throw new Error('EmptyRequestBody');
  if (contentLength !== null && contentLength > env.MAX_FILE_SIZE_BYTES) {
    throw new Error('UploadTooLarge');
  }

  const key = `videos/${jobId}`;
  let size = 0;
  const countingBody = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > env.MAX_FILE_SIZE_BYTES) throw new Error('UploadTooLarge');
      controller.enqueue(chunk);
    },
  }));

  await env.RAW_STORAGE.put(key, countingBody, {
    httpMetadata: { contentType: contentType || 'video/mp4' },
  });
  return { key, size };
}