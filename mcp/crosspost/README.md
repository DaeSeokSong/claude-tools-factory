# crosspost-mcp

Write once (e.g. the AI update you post in Slack), cross-post everywhere — **reformatted per platform**. Give it your message; it cleans Slack markup and posts to **X** as a weighted 280-char numbered thread and to **LinkedIn** as a single long-form post.

## Safety first

Posting is **public and irreversible**:

- **`preview_crosspost` makes no network call and needs no tokens** — it shows exactly what each platform would get.
- **`publish_crosspost` refuses unless `confirm: true`** *and* that platform's credentials exist; otherwise it returns the preview.
- Nothing is posted implicitly. Flow: `preview_crosspost` → show the user → approve → `publish_crosspost({ confirm: true })`.

## Tools

| Tool | Network? | Purpose |
| --- | --- | --- |
| `crosspost_status()` | no | Which platforms are configured (booleans only) + limits + required env. |
| `preview_crosspost(text, platforms?, communityId?, number?)` | **no** | Dry-run: cleaned source + the per-platform plan (X thread, LinkedIn single). |
| `publish_crosspost(text, platforms?, communityId?, number?, confirm)` | yes | Posts for real — only with `confirm: true` and credentials. Returns URLs. |

## What it does per platform

- **Slack cleanup (both):** unwraps `*bold*` / `_italic_` / `~strike~` / `` `code` ``, turns `<url|label>` into `label (url)`, `<#C123|chan>` into `#chan`, drops `<@U123>` mentions, decodes `&amp;`/`&lt;`/`&gt;`.
- **X:** auto-splits into a numbered reply thread at **280 weighted** chars (CJK/Korean/emoji count as 2, like X); optional `communityId` routes the thread root into an X Community; warns at 3+ hashtags.
- **LinkedIn:** a single post up to **3000** chars (refuses if over); shows the part visible before “see more” (~210 chars); suggests 3–5 end hashtags (warns above 5, where reach drops ~68%). Commentary is escaped for LinkedIn's text format (hashtags kept functional).

## Credentials (env)

- **X:** `X_ACCESS_TOKEN` — OAuth 2.0 user token, scope `tweet.write`. (Optional `X_API_BASE`.)
- **LinkedIn:** `LINKEDIN_ACCESS_TOKEN` (OAuth 2.0, scope `w_member_social`) **+** `LINKEDIN_AUTHOR_URN` (e.g. `urn:li:person:abc123`) or `LINKEDIN_PERSON_ID`. Posts via `POST /rest/posts`; optional `LINKEDIN_VERSION` (default `202606`), `LINKEDIN_API_BASE`.

A platform with no credentials simply can't be published to (preview still works for both).

## Install

```shell
npm install && npm run build

# preview-only (no tokens):
claude mcp add crosspost -- node /abs/path/to/mcp/crosspost/dist/index.js

# with publishing:
claude mcp add crosspost \
  -e X_ACCESS_TOKEN=... \
  -e LINKEDIN_ACCESS_TOKEN=... -e LINKEDIN_AUTHOR_URN=urn:li:person:... \
  -- node /abs/path/to/dist/index.js
```

Once published to npm: `claude mcp add crosspost -- npx -y crosspost-mcp`. Works with any MCP client.

## Typical flow

1. Paste your Slack message → `preview_crosspost({ text })`.
2. Eyeball the X thread + the LinkedIn post, tweak wording if you like.
3. `publish_crosspost({ text, confirm: true })` → get the X thread URL + LinkedIn post URL.

## Notes

- Tone/wording is kept as-is (a faithful copy, just reformatted). If you want platform-specific *rewriting*, edit the text before publishing — the agent can do that, then call the tool.
- The HTTP transport is injectable, so thread chaining, the LinkedIn `/rest/posts` call + `x-restli-id` handling, and errors are unit-tested offline with a mock — only the live network call is environment-dependent.

## License

MIT
