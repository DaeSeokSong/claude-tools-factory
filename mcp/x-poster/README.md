# x-poster-mcp

An MCP server for posting to **X (Twitter)** from inside your agent — reach-aware and safe. Write once, preview, auto-split into a numbered reply thread, optionally route into an X **Community**, and publish only on explicit confirmation.

> Focused on X by design. X has no "folder tree" to categorize posts within one account; the only API lever for topical targeting is **Communities** (`community_id`), and hashtags are a weak/limited signal in 2026 — so this tool leans into what actually drives reach.

## Safety first

Posting is **public and irreversible**:

- **`preview_x_post` makes no network call and needs no token** — it shows exactly what would post.
- **`publish_x_post` refuses unless `confirm: true`** *and* `X_ACCESS_TOKEN` is set; otherwise it returns the preview.
- Nothing is posted implicitly. Flow: `preview_x_post` → show the user → approve → `publish_x_post({ confirm: true })`.

## Tools

| Tool | Network? | Purpose |
| --- | --- | --- |
| `x_status()` | no | Token present? + char limit + community support + reach tips (boolean only, no token value). |
| `preview_x_post(text, communityId?, number?)` | **no** | Dry-run: the numbered thread, char counts, target community, and a hashtag-reach lint. |
| `publish_x_post(text, communityId?, number?, confirm)` | yes | Posts for real — only with `confirm: true` and a token. Returns the URL(s). |

- **Threading:** long text auto-splits on word boundaries into a numbered reply thread (`(1/3)`…), each replying to the previous, sized to X's **280** chars.
- **Community routing:** pass `communityId` to post the thread **root** into that X Community (`POST /2/tweets` `community_id`) — the one real way to target a topical audience within a single account.
- **Hashtag lint:** flags 3+ hashtags (which *reduce* reach via X's spam filter in 2026) and nudges toward 0–2 niche tags.

## What actually drives reach on X (2026)

X ranks the For You feed by **engagement velocity in the first ~30 minutes** (replies weighted far above likes), **author authority**, **recency**, and relationship strength — content is categorized by **semantic NLP, not hashtags**. So: strong hook, invite replies, post when your audience is active, ≤2 niche tags, and use Communities for topical reach. There is no per-post "folder"/category in a profile.

## Credentials (env)

- `X_ACCESS_TOKEN` — an OAuth 2.0 **user-context** access token with `tweet.write` (plus `tweet.read users.read offline.access`) for your X app. Posts via `POST https://api.x.com/2/tweets`. (X user tokens expire ~2h; refresh out-of-band.)
- Optional `X_API_BASE` overrides the API host (proxy/testing).

## Install

```shell
npm install && npm run build

# preview-only (no token needed):
claude mcp add x-poster -- node /abs/path/to/mcp/x-poster/dist/index.js

# with publishing:
claude mcp add x-poster -e X_ACCESS_TOKEN=... -- node /abs/path/to/dist/index.js
```

Once published to npm: `claude mcp add x-poster -- npx -y x-poster-mcp`. Works with any MCP client (Claude Code, Cursor, …).

## Notes

- Acquiring a token (create an X app + OAuth) and joining a Community are one-time manual steps; this tool consumes the resulting token / community id.
- The HTTP transport is injectable, so thread chaining, community routing, and error handling are unit-tested offline with a mock — only the live network call is environment-dependent.

## License

MIT
