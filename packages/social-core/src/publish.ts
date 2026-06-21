// Network layer shared by the social MCP servers: X (thread, optional community) and
// LinkedIn (single post) publishers. The HTTP transport is injectable (and returns response
// headers — LinkedIn returns the new post id in the `x-restli-id` header) so all posting
// logic is unit-tested offline with a mock.

export interface HttpResponse {
  status: number;
  ok: boolean;
  json: unknown;
  text: string;
  headers: Record<string, string>;
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
    // non-JSON
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  return { status: res.status, ok: res.ok, json, text, headers };
};

function errOf(r: HttpResponse): string {
  const j = r.json as
    | { message?: string; detail?: string; title?: string; error?: { message?: string }; errors?: Array<{ message?: string }> }
    | null;
  return (j?.message || j?.detail || j?.title || j?.error?.message || j?.errors?.[0]?.message || r.text || `HTTP ${r.status}`).slice(0, 300);
}

export interface PostResult {
  ok: boolean;
  segment?: number;
  id?: string;
  url?: string;
  error?: string;
}

// ─── X (Twitter) ────────────────────────────────────────────────────────────────

export function xPublisher(opts: { token: string; http?: Http; base?: string; communityId?: string }): {
  publish: (segments: string[]) => Promise<PostResult[]>;
} {
  const http = opts.http ?? fetchHttp;
  const base = (opts.base ?? "https://api.x.com").replace(/\/$/, "");
  return {
    publish: async (segments) => {
      const results: PostResult[] = [];
      let prevId: string | undefined;
      for (let i = 0; i < segments.length; i++) {
        const payload: Record<string, unknown> = { text: segments[i] };
        if (prevId) payload.reply = { in_reply_to_tweet_id: prevId };
        else if (opts.communityId) payload.community_id = opts.communityId;
        const r = await http({
          method: "POST",
          url: `${base}/2/tweets`,
          headers: { authorization: `Bearer ${opts.token}`, "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const id = (r.json as { data?: { id?: string } } | null)?.data?.id;
        if (!r.ok || !id) {
          results.push({ ok: false, segment: i + 1, error: errOf(r) });
          break;
        }
        prevId = id;
        results.push({ ok: true, segment: i + 1, id, url: `https://x.com/i/web/status/${id}` });
      }
      return results;
    },
  };
}

export function isXConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.X_ACCESS_TOKEN;
}
export function buildX(
  env: NodeJS.ProcessEnv = process.env,
  http: Http = fetchHttp,
  communityId?: string,
): ReturnType<typeof xPublisher> | null {
  if (!env.X_ACCESS_TOKEN) return null;
  return xPublisher({ token: env.X_ACCESS_TOKEN, http, base: env.X_API_BASE, communityId });
}

// ─── LinkedIn ──────────────────────────────────────────────────────────────────

/**
 * LinkedIn's Posts API `commentary` is "Little Text Format": these structural/format
 * characters must be backslash-escaped to appear literally. We escape all of them EXCEPT
 * '#', so hashtags stay functional. (Slack cleanup already strips * _ ~ markers.)
 */
export function escapeLinkedInCommentary(text: string): string {
  return text.replace(/[\\(){}\[\]<>@|~_*]/g, (m) => "\\" + m);
}

export function linkedinPublisher(opts: {
  token: string;
  authorUrn: string;
  http?: Http;
  base?: string;
  version?: string;
}): { publish: (text: string) => Promise<PostResult> } {
  const http = opts.http ?? fetchHttp;
  const base = (opts.base ?? "https://api.linkedin.com").replace(/\/$/, "");
  const version = opts.version ?? "202606";
  return {
    publish: async (text) => {
      const body = JSON.stringify({
        author: opts.authorUrn,
        commentary: escapeLinkedInCommentary(text),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      });
      const r = await http({
        method: "POST",
        url: `${base}/rest/posts`,
        headers: {
          authorization: `Bearer ${opts.token}`,
          "content-type": "application/json",
          "linkedin-version": version,
          "x-restli-protocol-version": "2.0.0",
        },
        body,
      });
      if (!r.ok) return { ok: false, error: errOf(r) };
      const id = r.headers["x-restli-id"] || (r.json as { id?: string } | null)?.id;
      if (!id) return { ok: false, error: "LinkedIn accepted the request but returned no post id (x-restli-id)" };
      return { ok: true, id, url: `https://www.linkedin.com/feed/update/${id}/` };
    },
  };
}

export function linkedinAuthorUrn(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.LINKEDIN_AUTHOR_URN) return env.LINKEDIN_AUTHOR_URN;
  if (env.LINKEDIN_PERSON_ID) return `urn:li:person:${env.LINKEDIN_PERSON_ID}`;
  return undefined;
}
export function isLinkedInConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.LINKEDIN_ACCESS_TOKEN && !!linkedinAuthorUrn(env);
}
export function buildLinkedIn(
  env: NodeJS.ProcessEnv = process.env,
  http: Http = fetchHttp,
): ReturnType<typeof linkedinPublisher> | null {
  const author = linkedinAuthorUrn(env);
  if (!env.LINKEDIN_ACCESS_TOKEN || !author) return null;
  return linkedinPublisher({ token: env.LINKEDIN_ACCESS_TOKEN, authorUrn: author, http, base: env.LINKEDIN_API_BASE, version: env.LINKEDIN_VERSION });
}
