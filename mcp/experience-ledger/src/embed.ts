// Optional vector-embedding layer for semantic ("vector RAG") retrieval.
//
// Design goals that keep the server zero-config and zero-dependency by default:
//   - No hard dependency: API providers use the built-in global `fetch`; there is
//     also a deterministic, offline local embedder.
//   - Opt-in: a provider is selected only via EXPERIENCE_LEDGER_EMBED. When unset,
//     the server stays purely lexical (the original behavior) and never makes a
//     network call.
//   - Graceful: a misconfigured provider logs a warning and falls back to lexical.

export interface Embedder {
  /** Stable identifier, e.g. "voyage:voyage-3-lite" — used in status output. */
  id: string;
  /** Embed a batch of texts into vectors (one per input, order preserved). */
  embed: (texts: string[]) => Promise<number[][]>;
}

/** Cosine similarity in [-1, 1]; 0 if either vector is empty/zero. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// FNV-1a (32-bit) — a small, fast, deterministic string hash for feature hashing.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic, dependency-free, OFFLINE embedder via feature hashing of tokens
 * (signed hashing into a fixed-width L2-normalized vector). It is stable and needs
 * no network, so it powers offline tests and an "EXPERIENCE_LEDGER_EMBED=hash" mode.
 * It is NOT a trained model: its similarity is close to lexical overlap, so for real
 * semantic recall use an API provider (voyage/openai). Useful as a working fallback.
 */
export function hashEmbedder(dims = 256): Embedder {
  const one = (text: string): number[] => {
    const v = new Array<number>(dims).fill(0);
    const toks = norm(text).split(" ").filter((w) => w.length > 2);
    for (const tok of toks) {
      const h = fnv1a(tok);
      const idx = h % dims;
      const sign = (h & 0x80000000) !== 0 ? -1 : 1; // sign hashing reduces collisions
      v[idx] += sign;
    }
    let mag = 0;
    for (const x of v) mag += x * x;
    mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < dims; i++) v[i] /= mag;
    return v;
  };
  return { id: `hash:${dims}`, embed: async (texts) => texts.map(one) };
}

/** Shared HTTP embedding call for the OpenAI-compatible `{ data: [{ embedding }] }` shape. */
async function httpEmbed(
  url: string,
  apiKey: string,
  model: string,
  texts: string[],
  extra: Record<string, unknown> = {},
): Promise<number[][]> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: texts, ...extra }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`embedding API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    if (!json.data || json.data.length !== texts.length) throw new Error("embedding API returned a mismatched batch");
    return json.data.map((d) => d.embedding);
  } finally {
    clearTimeout(timeout);
  }
}

/** Voyage AI embeddings (recommended for Anthropic stacks). Needs VOYAGE_API_KEY. */
export function voyageEmbedder(opts: { apiKey: string; model?: string }): Embedder {
  const model = opts.model ?? "voyage-3-lite";
  return {
    id: `voyage:${model}`,
    embed: (texts) => httpEmbed("https://api.voyageai.com/v1/embeddings", opts.apiKey, model, texts),
  };
}

/** OpenAI embeddings. Needs OPENAI_API_KEY. */
export function openAIEmbedder(opts: { apiKey: string; model?: string }): Embedder {
  const model = opts.model ?? "text-embedding-3-small";
  return {
    id: `openai:${model}`,
    embed: (texts) => httpEmbed("https://api.openai.com/v1/embeddings", opts.apiKey, model, texts),
  };
}

/**
 * Build an embedder from the environment, or return null to stay lexical-only:
 *   EXPERIENCE_LEDGER_EMBED = voyage | openai | hash | none (default: none)
 *   VOYAGE_API_KEY / OPENAI_API_KEY     — provider key
 *   EXPERIENCE_LEDGER_EMBED_MODEL       — optional model override
 * A selected API provider with a missing key warns and falls back to lexical (null).
 */
export function embedderFromEnv(): Embedder | null {
  const kind = (process.env.EXPERIENCE_LEDGER_EMBED ?? "none").toLowerCase();
  const model = process.env.EXPERIENCE_LEDGER_EMBED_MODEL || undefined;
  if (kind === "none" || kind === "") return null;
  if (kind === "hash") return hashEmbedder();
  if (kind === "voyage") {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      console.error("EXPERIENCE_LEDGER_EMBED=voyage but VOYAGE_API_KEY is unset — falling back to lexical retrieval.");
      return null;
    }
    return voyageEmbedder({ apiKey, model });
  }
  if (kind === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("EXPERIENCE_LEDGER_EMBED=openai but OPENAI_API_KEY is unset — falling back to lexical retrieval.");
      return null;
    }
    return openAIEmbedder({ apiKey, model });
  }
  console.error(`Unknown EXPERIENCE_LEDGER_EMBED="${kind}" — falling back to lexical retrieval.`);
  return null;
}
