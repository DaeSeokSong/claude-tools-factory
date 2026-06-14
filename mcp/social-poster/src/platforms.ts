// Platform publishers for X (Twitter) and Threads. The HTTP transport is injectable so
// the posting logic (thread chaining, two-step Threads publish, error handling) can be
// tested offline with a mock — the real network call is the only un-unit-tested part.

export const PLATFORMS = {
  x: { id: "x", name: "X (Twitter)", charLimit: 280 },
  threads: { id: "threads", name: "Threads", charLimit: 500 },
} as const;

export type PlatformId = keyof typeof PLATFORMS;
export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];

export interface PostResult {
  segment: number; // 1-based index in the thread
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
}

export interface Publisher {
  id: PlatformId;
  /** Publish ordered segments as a thread (each replying to the previous). One result per segment. */
  publish: (segments: string[]) => Promise<PostResult[]>;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  json: unknown;
  text: string;
}
export type Http = (req: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<HttpResponse>;

/** Default transport over the global fetch. */
export const fetchHttp: Http = async (req) => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response
  }
  return { status: res.status, ok: res.ok, json, text };
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const errOf = (r: HttpResponse): string => {
  const j = r.json as { detail?: string; title?: string; error?: { message?: string } } | null;
  return (j?.error?.message || j?.detail || j?.title || r.text || `HTTP ${r.status}`).slice(0, 300);
};

/** X (Twitter) API v2: POST /2/tweets, chaining replies via reply.in_reply_to_tweet_id. */
export function xPublisher(opts: { token: string; http?: Http; base?: string }): Publisher {
  const http = opts.http ?? fetchHttp;
  const base = (opts.base ?? "https://api.x.com").replace(/\/$/, "");
  return {
    id: "x",
    publish: async (segments) => {
      const results: PostResult[] = [];
      let prevId: string | undefined;
      for (let i = 0; i < segments.length; i++) {
        const payload: Record<string, unknown> = { text: segments[i] };
        if (prevId) payload.reply = { in_reply_to_tweet_id: prevId };
        const r = await http({
          method: "POST",
          url: `${base}/2/tweets`,
          headers: { authorization: `Bearer ${opts.token}`, "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const id = (r.json as { data?: { id?: string } } | null)?.data?.id;
        if (!r.ok || !id) {
          results.push({ segment: i + 1, ok: false, error: errOf(r) });
          break; // stop the thread on first failure
        }
        prevId = id;
        results.push({ segment: i + 1, ok: true, id, url: `https://x.com/i/web/status/${id}` });
      }
      return results;
    },
  };
}

/** Threads (Meta) Graph API: create TEXT container, then publish it; chain via reply_to_id. */
export function threadsPublisher(opts: {
  token: string;
  userId: string;
  http?: Http;
  base?: string;
  delayMs?: number;
}): Publisher {
  const http = opts.http ?? fetchHttp;
  const base = (opts.base ?? "https://graph.threads.net/v1.0").replace(/\/$/, "");
  const form = (o: Record<string, string>): string => new URLSearchParams(o).toString();
  return {
    id: "threads",
    publish: async (segments) => {
      const results: PostResult[] = [];
      let prevPublishedId: string | undefined;
      for (let i = 0; i < segments.length; i++) {
        // Step 1 — create a TEXT container (reply to the previous post for i > 0).
        const createParams: Record<string, string> = { media_type: "TEXT", text: segments[i], access_token: opts.token };
        if (prevPublishedId) createParams.reply_to_id = prevPublishedId;
        const c = await http({
          method: "POST",
          url: `${base}/${opts.userId}/threads`,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form(createParams),
        });
        const creationId = (c.json as { id?: string } | null)?.id;
        if (!c.ok || !creationId) {
          results.push({ segment: i + 1, ok: false, error: errOf(c) });
          break;
        }
        if (opts.delayMs && opts.delayMs > 0) await sleep(opts.delayMs);
        // Step 2 — publish the container.
        const p = await http({
          method: "POST",
          url: `${base}/${opts.userId}/threads_publish`,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({ creation_id: creationId, access_token: opts.token }),
        });
        const mediaId = (p.json as { id?: string } | null)?.id;
        if (!p.ok || !mediaId) {
          results.push({ segment: i + 1, ok: false, error: errOf(p) });
          break;
        }
        prevPublishedId = mediaId;
        // Best-effort permalink lookup (non-fatal).
        let url: string | undefined;
        try {
          const link = await http({
            method: "GET",
            url: `${base}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(opts.token)}`,
          });
          url = (link.json as { permalink?: string } | null)?.permalink;
        } catch {
          // ignore
        }
        results.push({ segment: i + 1, ok: true, id: mediaId, url });
      }
      return results;
    },
  };
}

/** Which platforms have credentials configured, built into ready-to-use publishers. */
export function configuredPublishers(
  env: NodeJS.ProcessEnv = process.env,
  http: Http = fetchHttp,
): Partial<Record<PlatformId, Publisher>> {
  const out: Partial<Record<PlatformId, Publisher>> = {};
  if (env.X_ACCESS_TOKEN) out.x = xPublisher({ token: env.X_ACCESS_TOKEN, http, base: env.X_API_BASE });
  if (env.THREADS_ACCESS_TOKEN && env.THREADS_USER_ID) {
    out.threads = threadsPublisher({
      token: env.THREADS_ACCESS_TOKEN,
      userId: env.THREADS_USER_ID,
      http,
      base: env.THREADS_API_BASE,
      delayMs: env.THREADS_PUBLISH_DELAY_MS ? Number(env.THREADS_PUBLISH_DELAY_MS) : 0,
    });
  }
  return out;
}
