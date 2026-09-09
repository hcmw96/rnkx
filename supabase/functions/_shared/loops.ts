/**
 * Server-side Loops API helpers. Import only from Edge Functions —
 * LOOPS_API_KEY must never ship in the client bundle.
 */

const LOOPS_CREATE_CONTACT = 'https://app.loops.so/api/v1/contacts/create';
const LOOPS_UPDATE_CONTACT = 'https://app.loops.so/api/v1/contacts/update';
const LOOPS_SEND_EVENT = 'https://app.loops.so/api/v1/events/send';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

export type LoopsPropertyValue = string | number | boolean;
export type LoopsProperties = Record<string, LoopsPropertyValue>;

function getLoopsApiKey(): string {
  const key = Deno.env.get('LOOPS_API_KEY')?.trim();
  if (!key) {
    throw new Error('LOOPS_API_KEY is not set');
  }
  return key;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 10_000);
    }
  }
  return BASE_BACKOFF_MS * 2 ** (attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function loopsPost(url: string, payload: Record<string, unknown>): Promise<unknown> {
  const apiKey = getLoopsApiKey();
  const body = JSON.stringify(payload);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[loops] ${url} network error (attempt ${attempt}/${MAX_ATTEMPTS})`, lastError.message);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw lastError;
    }

    const text = await readBody(res);
    if (res.ok) {
      if (!text) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }

    console.error(`[loops] ${url} failed`, res.status, text);

    if (attempt < MAX_ATTEMPTS && isRetryableStatus(res.status)) {
      await sleep(backoffMs(attempt, res.headers.get('Retry-After')));
      continue;
    }

    throw new LoopsHttpError(res.status, text || res.statusText);
  }

  throw lastError ?? new Error('Loops request failed');
}

class LoopsHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Loops request failed (${status}): ${body}`);
    this.status = status;
    this.body = body;
  }
}

/** Create a Loops contact, or update if the email already exists (409). */
export async function upsertContact(
  email: string,
  properties: LoopsProperties = {},
): Promise<unknown> {
  const payload = { email, ...properties };
  try {
    return await loopsPost(LOOPS_CREATE_CONTACT, payload);
  } catch (err) {
    if (err instanceof LoopsHttpError && err.status === 409) {
      return await loopsPost(LOOPS_UPDATE_CONTACT, payload);
    }
    throw err;
  }
}

/** Fire a Loops event for a contact, optionally with event properties. */
export async function sendEvent(
  email: string,
  eventName: string,
  eventProperties?: LoopsProperties,
): Promise<unknown> {
  const payload: Record<string, unknown> = { email, eventName };
  if (eventProperties && Object.keys(eventProperties).length > 0) {
    payload.eventProperties = eventProperties;
  }
  return await loopsPost(LOOPS_SEND_EVENT, payload);
}
