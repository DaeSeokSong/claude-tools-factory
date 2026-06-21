# linkedin-poster-mcp

An MCP server for posting to **LinkedIn** from inside your agent — preview a single long-form post, then publish only on explicit confirmation.

## Safety first

Posting is **public and irreversible**:

- **`preview_linkedin_post` makes no network call and needs no token** — it shows exactly what would post.
- **`publish_linkedin_post` refuses unless `confirm: true`** *and* credentials exist; otherwise it returns the preview.

## Tools

| Tool | Network? | Purpose |
| --- | --- | --- |
| `linkedin_status()` | no | Configured? (boolean only) + char limit + required env. |
| `preview_linkedin_post(text)` | **no** | Dry-run: full post, length vs 3000, the “see more” preview, hashtag advice. |
| `publish_linkedin_post(text, confirm)` | yes | Posts for real — only with `confirm: true` and credentials. Returns the URL. |

A single post up to **3000** chars (refused if over). The hook should fit the first ~210 chars (shown before “see more”); 3–5 niche hashtags at the end are ideal (more than 5 cuts reach). Commentary is escaped for LinkedIn's text format (hashtags kept functional).

## Credentials (env)

- `LINKEDIN_ACCESS_TOKEN` — OAuth 2.0 token with scope `w_member_social`.
- `LINKEDIN_AUTHOR_URN` (e.g. `urn:li:person:abc123`) or `LINKEDIN_PERSON_ID`.
- Optional `LINKEDIN_VERSION` (default `202606`), `LINKEDIN_API_BASE`. Posts via `POST /rest/posts`.

## Install

```shell
npm install && npm run build

# preview-only (no token):
claude mcp add linkedin-poster -- node /abs/path/to/mcp/linkedin-poster/dist/index.js

# with publishing:
claude mcp add linkedin-poster \
  -e LINKEDIN_ACCESS_TOKEN=... -e LINKEDIN_AUTHOR_URN=urn:li:person:... \
  -- node /abs/path/to/dist/index.js
```

Once published to npm: `claude mcp add linkedin-poster -- npx -y linkedin-poster-mcp`. Works with any MCP client.

## Notes

- Shares **social-core** with `x-poster` and `crosspost` (bundled into `dist` at build, so this server still installs standalone).
- For the Slack-message → X + LinkedIn workflow, use `crosspost` instead (it cleans Slack markup and posts to both).

## License

MIT
