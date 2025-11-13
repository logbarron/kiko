import type { Env } from '../types';
import { getSigningKey } from './access-jwks';

interface JwtPayload {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  email?: string;
  sub?: string;
}

function decodeBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  if (typeof atob === 'function') {
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }

  const buffer = (globalThis as any).Buffer?.from(padded, 'base64');
  if (buffer) {
    return new Uint8Array(buffer);
  }

  throw new Error('Base64 decoding not supported in this environment');
}

function parseJwt(token: string): {
  header: Record<string, unknown>;
  payload: JwtPayload;
  signature: ArrayBuffer;
  signed: ArrayBuffer;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT structure');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const headerBytes = decodeBase64Url(headerB64);
  const payloadBytes = decodeBase64Url(payloadB64);
  const headerJson = decodeURIComponent(escape(String.fromCharCode(...headerBytes)));
  const payloadJson = decodeURIComponent(escape(String.fromCharCode(...payloadBytes)));
  const header = JSON.parse(headerJson) as Record<string, unknown>;
  const payload = JSON.parse(payloadJson) as JwtPayload;
  const signatureBytes = decodeBase64Url(signatureB64);
  const signatureBuffer = signatureBytes.buffer.slice(
    signatureBytes.byteOffset,
    signatureBytes.byteOffset + signatureBytes.byteLength
  ) as ArrayBuffer;
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`).buffer;
  return { header, payload, signature: signatureBuffer, signed };
}

type RequestLike = {
  headers: {
    get(name: string): string | null;
  };
};

export async function requireAccessAssertion(
  request: RequestLike,
  env: Env
): Promise<{ email?: string; sub?: string } | Response> {
  if ((env as any).DEV_MODE === 'true') {
    return { email: 'dev@localhost', sub: 'dev-mode' };
  }

  const aud = env.ACCESS_AUD;
  const iss = env.ACCESS_JWT_ISS;
  if (!aud || !iss) {
    return new Response('Access not configured', { status: 503 });
  }

  const assertion = request.headers.get('CF-Access-Jwt-Assertion');
  if (!assertion) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { header, payload, signature, signed } = parseJwt(assertion);
    if (header.alg !== 'RS256') {
      return new Response('Unauthorized', { status: 401 });
    }

    const kid = typeof header.kid === 'string' ? header.kid : null;
    if (!kid) {
      return new Response('Unauthorized', { status: 401 });
    }

    const key = await getSigningKey(env, kid);
    if (!key) {
      return new Response('Unauthorized', { status: 401 });
    }

    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
    if (!valid) {
      return new Response('Unauthorized', { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);
    if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(aud)) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (payload.iss !== iss) {
      return new Response('Unauthorized', { status: 401 });
    }

    return { email: payload.email, sub: payload.sub };
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }
}
