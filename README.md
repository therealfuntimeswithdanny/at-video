# Self-hosted Bluesky video service

This Cloudflare Worker accepts `app.bsky.video` uploads, stores the source in R2, uploads it asynchronously to the user's PDS, and returns the ATProto blob reference for use in an `app.bsky.embed.video` post.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create the configured D1 database and R2 bucket, or update `wrangler.json` with your existing resource IDs and names.

3. Apply the schema:

   ```sh
   npx wrangler d1 execute bsky-video-db --remote --file=schema.sql
   ```

4. Ensure the service DID in `wrangler.json` serves a DID document containing an `AtprotoPersonalDataServer` service, then deploy:

   ```sh
   npm run deploy
   ```

## Endpoints

- `GET /xrpc/app.bsky.video.getUploadLimits`
- `POST /xrpc/app.bsky.video.uploadVideo` with a video request body
- `GET /xrpc/app.bsky.video.getJobStatus?jobId=...`

All endpoints require an ATProto service-auth bearer token targeted at `SERVICE_DID`. Job status is restricted to the DID that created the job. Uploads are limited by `MAX_FILE_SIZE_BYTES` and `DAILY_LIMIT_PER_USER`.

## Local checks

```sh
npm run check
npx wrangler deploy --dry-run
```