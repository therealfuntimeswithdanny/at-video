import type { Env } from './types';

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return atob(padded);
}

export async function verifyServiceToken(
  authorization: string | null,
  expectedAudience: string,
): Promise<string> {
  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('AuthRequired: Missing or invalid Authorization header');
  }

  const token = authorization.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new Error('InvalidToken: Malformed JWT');
  }

  let payload: { iss?: unknown; aud?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(decodeBase64Url(parts[1])) as typeof payload;
  } catch {
    throw new Error('InvalidToken: Invalid JWT payload');
  }

  if (payload.aud !== expectedAudience) {
    throw new Error('InvalidAudience: Token audience does not match this service');
  }
  if (typeof payload.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('TokenExpired');
  }
  if (typeof payload.iss !== 'string' || !payload.iss.startsWith('did:')) {
    throw new Error('InvalidToken: Missing issuer DID');
  }

  return payload.iss;
}

export function tokenFromAuthorization(authorization: string | null): string {
  if (!authorization?.startsWith('Bearer ')) throw new Error('AuthRequired');
  return authorization.slice(7).trim();
}

export function serviceAuthAudience(env: Env): string {
  return env.SERVICE_DID;
}