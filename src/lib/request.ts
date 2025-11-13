export class PayloadTooLargeError extends Error {
  constructor(readonly bytes: number, readonly maxBytes: number) {
    super(`Payload exceeds ${maxBytes} bytes (received ${bytes})`);
    this.name = 'PayloadTooLargeError';
  }
}

type RequestWithText = {
  clone(): { text(): Promise<string> };
};

export async function readJsonWithinLimit<T>(
  request: RequestWithText,
  maxBytes: number
): Promise<{ data: T; bytes: number }> {
  const raw = await request.clone().text();
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > maxBytes) {
    throw new PayloadTooLargeError(bytes, maxBytes);
  }
  return { data: JSON.parse(raw) as T, bytes };
}
