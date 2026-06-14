// X (Twitter) API v2 publisher. POST /2/tweets, chaining a thread via
// reply.in_reply_to_tweet_id, and optionally routing the thread root into an X Community
// via community_id (the only API lever for "category"-style targeting within one account).
// The HTTP transport is injectable so posting logic is unit-tested offline with a mock.

export const X_CHAR_LIMIT = 280;

export interface PostResult {
  segment: number; // 1-based index in the thread
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
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

const errOf = (r: HttpResponse): string => {
  const j = r.json as { detail?: string; title?: string; errors?: Array<{ message?: string }> } | null;
  return (j?.errors?.[0]?.message || j?.detail || j?.title || r.text || `HTTP ${r.status}`).slice(0, 300);
};

export interface Publisher {
  publish: (segments: string[]) => Promise<PostResult[]>;
}

/**
 * Build an X publisher. If `communityId` is set, the thread *root* is posted into that
 * Community; replies chain to the previous post (replies inherit the community context).
 */
export function xPublisher(opts: { token: string; http?: Http; base?: string; communityId?: string }): Publisher {
  const http = opts.http ?? fetchHttp;
  const base = (opts.base ?? "https://api.x.com").replace(/\/$/, "");
  return {
    publish: async (segments) => {
      const results: PostResult[] = [];
      let prevId: string | undefined;
      for (let i = 0; i < segments.length; i++) {
        const payload: Record<string, unknown> = { text: segments[i] };
        if (prevId) payload.reply = { in_reply_to_tweet_id: prevId };
        else if (opts.communityId) payload.community_id = opts.communityId; // root → community
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

/** Whether an X token is present in the environment. */
export function isXConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.X_ACCESS_TOKEN;
}

/** Build a publisher from env (+ optional per-call communityId), or null if no token. */
export function buildXPublisher(
  env: NodeJS.ProcessEnv = process.env,
  http: Http = fetchHttp,
  communityId?: string,
): Publisher | null {
  if (!env.X_ACCESS_TOKEN) return null;
  return xPublisher({ token: env.X_ACCESS_TOKEN, http, base: env.X_API_BASE, communityId });
}
