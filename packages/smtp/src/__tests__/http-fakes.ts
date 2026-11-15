import { vi } from 'vitest';
import type { FetchLike } from '../lib/http.js';

export type NextResponse = () => Response | Promise<Response>;

export const jsonResponse =
  (body: unknown, init: ResponseInit = {}): NextResponse =>
  () =>
    new Response(JSON.stringify(body), init);

export type FetchHarness = {
  fetchImpl: FetchLike;
  calls: Array<{ url: string; init: RequestInit }>;
  sleeps: number[];
  sleep: (ms: number) => Promise<void>;
};

/**
 * Fake `fetch` that replays the supplied responses (the last one repeats) and
 * records every request, plus a fake sleep so retry delays stay instant.
 */
export const createFetchHarness = (responses: Array<NextResponse | Error>): FetchHarness => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;

  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;

    if (next instanceof Error) throw next;

    return next();
  }) as unknown as FetchLike;

  const sleeps: number[] = [];

  return {
    fetchImpl,
    calls,
    sleeps,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    }
  };
};

export const headersOf = (init: RequestInit): Record<string, string> =>
  init.headers as Record<string, string>;

export const bodyOf = (init: RequestInit): unknown =>
  init.body === undefined ? undefined : JSON.parse(init.body as string);
