// ABOUTME: Provides an in-memory KV store compatible with Cloudflare KV API subset used in tests.
// ABOUTME: Supports basic get/put/delete with expiration semantics for rate limit testing.

type KvEntry = {
  value: string;
  expiresAt?: number;
};

export type InMemoryKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): void;
  advanceTime(seconds: number): void;
  size(): number;
};

export function createInMemoryKv(nowProvider: () => number = () => Math.floor(Date.now() / 1000)): InMemoryKv {
  const store = new Map<string, KvEntry>();
  let currentTimeProvider = nowProvider;

  function pruneExpired() {
    const now = currentTimeProvider();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }

  return {
    async get(key) {
      pruneExpired();
      const entry = store.get(key);
      return entry ? entry.value : null;
    },

    async put(key, value, options) {
      const ttl = options?.expirationTtl;
      const expiresAt = ttl !== undefined ? currentTimeProvider() + ttl : undefined;
      store.set(key, { value, expiresAt });
    },

    async delete(key) {
      store.delete(key);
    },

    clear() {
      store.clear();
    },

    advanceTime(seconds: number) {
      const base = currentTimeProvider();
      currentTimeProvider = () => base + seconds;
      pruneExpired();
    },

    size() {
      pruneExpired();
      return store.size;
    }
  };
}

