import type { EncryptedPayload } from '../types';

const encoder = new TextEncoder();

async function hmacB64Url(payload: Uint8Array, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const data: ArrayBuffer =
    payload.byteOffset === 0 && payload.byteLength === payload.buffer.byteLength
      ? (payload.buffer as ArrayBuffer)
      : payload.slice().buffer;
  const signature = await crypto.subtle.sign('HMAC', key, data);

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generate random token
export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Hash email or token using HMAC-SHA256
export async function hashEmail(email: string, secret: string): Promise<string> {
  return hmacB64Url(encoder.encode(email.toLowerCase().trim()), secret);
}

export async function hashToken(token: string, secret: string): Promise<string> {
  return hmacB64Url(encoder.encode(token), secret);
}

// Generate DEK for envelope encryption
async function generateDEK(): Promise<CryptoKey> {
  return (await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )) as CryptoKey;
}

// Wrap DEK with KEK using AES-KW
async function wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW');
}

// Unwrap DEK with KEK
async function unwrapDEK(wrappedDek: ArrayBuffer, kek: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    wrappedDek,
    kek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false,  // extractable = false for security
    ['decrypt']
  );
}

// Import KEK from base64
async function importKEK(kekB64: string): Promise<CryptoKey> {
  const kekBytes = Uint8Array.from(atob(kekB64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'raw',
    kekBytes,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

// Build AAD (Additional Authenticated Data)
function buildAAD(table: string, recordId: string, purpose: string): Uint8Array {
  const aad = `${table}:${recordId}:${purpose}`;
  return new TextEncoder().encode(aad);
}

// Encrypt JSON with envelope encryption
export async function encryptJson(
  data: any,
  kekB64: string,
  table: string,
  recordId: string,
  purpose: string
): Promise<string> {
  const kek = await importKEK(kekB64);
  const dek = await generateDEK();
  
  // Generate IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Build AAD
  const aad = buildAAD(table, recordId, purpose);
  
  // Encrypt data
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: aad.buffer as ArrayBuffer },
    dek,
    plaintext
  );
  
  // Wrap DEK
  const wrappedDek = await wrapDEK(dek, kek);
  
  // Package everything
  const payload: EncryptedPayload = {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
    dek_wrapped: btoa(String.fromCharCode(...new Uint8Array(wrappedDek))),
    aad_hint: `${table}:${recordId}:${purpose}`
  };
  
  return JSON.stringify(payload);
}

// Decrypt JSON with envelope encryption
export async function decryptJson(
  encryptedData: string,
  kekB64: string,
  table: string,
  recordId: string,
  purpose: string
): Promise<any> {
  const kek = await importKEK(kekB64);
  const payload: EncryptedPayload = JSON.parse(encryptedData);
  
  // Decode components
  const ciphertext = Uint8Array.from(atob(payload.ciphertext), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
  const wrappedDek = Uint8Array.from(atob(payload.dek_wrapped), c => c.charCodeAt(0));
  
  // Unwrap DEK
  const dek = await unwrapDEK(wrappedDek.buffer as ArrayBuffer, kek);
  
  // Build AAD
  const aad = buildAAD(table, recordId, purpose);
  
  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: aad.buffer as ArrayBuffer },
    dek,
    ciphertext
  );
  
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintext));
}
