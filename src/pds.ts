import type { BlobRef } from './types';

export async function resolvePdsEndpoint(did: string): Promise<string> {
  let documentUrl: string;
  if (did.startsWith('did:web:')) {
    const domain = did.slice('did:web:'.length).replace(/:/g, '/');
    documentUrl = `https://${domain}/.well-known/did.json`;
  } else if (did.startsWith('did:plc:')) {
    documentUrl = `https://plc.directory/${encodeURIComponent(did)}`;
  } else {
    throw new Error('Unsupported DID format');
  }

  const response = await fetch(documentUrl);
  if (!response.ok) throw new Error(`DID resolution failed (${response.status})`);
  const document = await response.json() as { service?: Array<{ id?: string; type?: string; serviceEndpoint?: string }> };
  const service = document.service?.find((entry) =>
    entry.id?.endsWith('#atproto_pds') || entry.type === 'AtprotoPersonalDataServer',
  );
  if (!service?.serviceEndpoint) throw new Error('PDS endpoint not found in DID document');
  return service.serviceEndpoint.replace(/\/$/, '');
}

export async function uploadBlobToPds(
  endpoint: string,
  serviceToken: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<BlobRef> {
  const response = await fetch(`${endpoint}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': contentType },
    body: bytes,
  });
  if (!response.ok) throw new Error(`PDS uploadBlob failed (${response.status}): ${await response.text()}`);
  const data = await response.json() as { blob?: BlobRef };
  if (!data.blob) throw new Error('PDS uploadBlob returned no blob reference');
  return data.blob;
}