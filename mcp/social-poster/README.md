# social-poster-mcp

An MCP server for posting to **X (Twitter)** and **Threads** without leaving your agent — write once, preview, and cross-post (auto-splitting long text into a numbered thread).

## Safety first

Posting is **public and irreversible**, so this server is built to not surprise you:

- **`preview_post` makes no network call and needs no credentials** — it just shows exactly what would be posted.
- **`publish_post` refuses unless `confirm: true`** *and* the platform's credentials are present. Without `confirm` it returns the preview.
- Nothing is ever posted implicitly. Recommended flow: `preview_post` → show the user → user approves → `publish_post({ confirm: true })`.

## Tools

| Tool | Network? | Purpose |
| --- | --- | --- |
| `social_status()` | no | Which platforms are configured (booleans only — never reveals tokens) + char limits. |
| `preview_post(text, platforms?, number?)` | **no** | Dry-run: per-platform segmentation, char counts, warnings. Posts nothing. |
| `publish_post(text, platforms?, number?, confirm)` | yes | Posts for real — only when `confirm: true` and credentials exist. Returns the URLs. |

Long text is auto-split on word boundaries into a numbered thread (`(1/3)`, `(2/3)`, …) sized to each platform: **X 280**, **Threads 500** chars. Each segment replies to the previous one (a real thread). `number: false` drops the counters.

## Credentials (env)

You supply already-obtained user tokens; this server does not run the OAuth flow.

- **X (Twitter):** `X_ACCESS_TOKEN` — an OAuth 2.0 **user-context** access token with the `tweet.write` (plus `tweet.read users.read offline.access`) scope, created for your X app. Posts via `POST https://api.x.com/2/tweets`. (X user tokens expire ~2h; refresh them out-of-band.)
- **Threads:** `THREADS_ACCESS_TOKEN` + `THREADS_USER_ID` — a Threads Graph API token. Posts via the two-step `…/threads` → `…/threads_publish` flow. Optional `THREADS_PUBLISH_DELAY_MS` (default 0) inserts a wait before publishing.
- Optional `X_API_BASE` / `THREADS_API_BASE` override the API host (handy for a proxy or tests).

A platform with no credentials simply can't be published to (preview still works).

## Install

```shell
npm install && npm run build

# preview-only (no tokens needed):
claude mcp add social-poster -- node /abs/path/to/mcp/social-poster/dist/index.js

# with publishing:
claude mcp add social-poster \
  -e X_ACCESS_TOKEN=... \
  -e THREADS_ACCESS_TOKEN=... -e THREADS_USER_ID=... \
  -- node /abs/path/to/dist/index.js
```

Once published to npm: `claude mcp add social-poster -- npx -y social-poster-mcp`. Works with any MCP client (Claude Code, Cursor, …).

## Notes

- Acquiring tokens (creating an X app + OAuth, enabling the Threads API) is a one-time manual setup on each platform's developer portal; this tool consumes the resulting tokens.
- The HTTP transport is injectable, so the posting logic (thread chaining, the Threads two-step publish, error handling) is unit-tested offline with a mock — only the live network call is environment-dependent.

## License

MIT
