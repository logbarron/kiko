import { logError } from './logger';
import type { Env } from '../types';

type Jwk = {
  kid: string;
  kty: string;
  alg: string;
  use?: string;
  n: string;
  e: string;
};

type CachedKeys = {
  expiresAt: number;
  keys: Map<string, CryptoKey>;
};

const DEFAULT_CACHE_MINUTES = 5;
let cache: CachedKeys | null = null;
let inflightFetch: Promise<CachedKeys> | null = null;

function getCacheMillis(env: Env): number {
  const raw = env.ACCESS_CERTS_CACHE_MIN;
  const minutes = raw ? Number.parseInt(raw, 10) : DEFAULT_CACHE_MINUTES;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_CACHE_MINUTES * 60_000;
  }
  return minutes * 60_000;
}

async function importJwk(jwk: Jwk): Promise<CryptoKey> {
  const normalized = {
    kty: jwk.kty,
    alg: jwk.alg || 'RS256',
    e: jwk.e,
    n: jwk.n,
    ext: true,
    key_ops: ['verify']
  } as JsonWebKey;

  return crypto.subtle.importKey(
    'jwk',
    normalized,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

async function fetchKeys(env: Env): Promise<CachedKeys> {
  const issuer = env.ACCESS_JWT_ISS;
  if (!issuer) {
    throw new Error('ACCESS_JWT_ISS is not configured');
  }

  const url = new URL('/cdn-cgi/access/certs', issuer).toString();

  const response = await fetch(url, {
    cf: { cacheTtl: 60, cacheEverything: false }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Access certs: ${response.status}`);
  }

  const body = (await response.json()) as { keys?: Jwk[]; public_certs?: Array<{ kid: string; cert: string }>; };

  if (!Array.isArray(body.keys)) {
    throw new Error('Access certs response is missing keys');
  }

  const map = new Map<string, CryptoKey>();

  for (const jwk of body.keys) {
    if (!jwk?.kid || !jwk.n || !jwk.e) {
      continue;
    }
    try {
      const key = await importJwk(jwk);
      map.set(jwk.kid, key);
    } catch (error) {
      logError?.('access/jwks/import', error);
    }
  }

  if (map.size === 0) {
    throw new Error('No valid Access signing keys were imported');
  }

  return {
    keys: map,
    expiresAt: Date.now() + getCacheMillis(env)
  };
}

async function loadKeys(env: Env): Promise<CachedKeys> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache;
  }

  if (inflightFetch) {
    return inflightFetch;
  }

  inflightFetch = fetchKeys(env)
    .then((result) => {
      cache = result;
      inflightFetch = null;
      return result;
    })
    .catch((error) => {
      inflightFetch = null;
      throw error;
    });

  return inflightFetch;
}

export async function getSigningKey(env: Env, kid: string): Promise<CryptoKey | null> {
  try {
    const { keys } = await loadKeys(env);
    return keys.get(kid) ?? null;
  } catch (error) {
    logError('access/jwks', error);
    return null;
  }
}
