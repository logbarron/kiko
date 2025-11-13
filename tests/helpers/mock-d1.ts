// ABOUTME: Provides a minimal in-memory D1Database mock for tests.
// ABOUTME: Tracks statements and lets callers supply results per query.

export type MockD1Call = {
  query: string;
  method: 'first' | 'run' | 'all';
  params: unknown[];
};

type Dispatcher = (query: string, method: MockD1Call['method'], params: unknown[]) => unknown;

type Statement = {
  bind: (...params: unknown[]) => Statement;
  first: () => Promise<unknown>;
  run: () => Promise<unknown>;
  all: () => Promise<unknown>;
};

export function createMockD1(dispatcher: Dispatcher) {
  const calls: MockD1Call[] = [];

  function record<T>(query: string, method: MockD1Call['method'], params: unknown[], value: T): T {
    calls.push({ query, method, params });
    return value;
  }

  function buildStatement(query: string, params: unknown[] = []): Statement {
    let boundParams = params;

    return {
      bind: (...nextParams: unknown[]) => {
        boundParams = [...boundParams, ...nextParams];
        return buildStatement(query, boundParams);
      },
      first: async () => record(query, 'first', boundParams, await dispatcher(query, 'first', boundParams)),
      run: async () => record(query, 'run', boundParams, await dispatcher(query, 'run', boundParams)),
      all: async () => record(query, 'all', boundParams, await dispatcher(query, 'all', boundParams)),
    };
  }

  const DB = {
    prepare(query: string) {
      return buildStatement(query);
    }
  };

  return { DB, calls };
}
