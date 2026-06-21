# social-core

Shared internals for the factory's social-posting MCP servers — the single source of truth so X/LinkedIn logic isn't duplicated across leaves.

Exports:

- **Slack + formatting** (`format.ts`): `slackToText` (Slack mrkdwn → clean text), `xWeight` / `splitThread` (X-weighted 280 thread split, CJK/emoji = 2), `countHashtags`, `planX`, `planLinkedIn`, `linkedinLength`, `X_CHAR_LIMIT`, `LINKEDIN_CHAR_LIMIT`.
- **Publishers** (`publish.ts`): `xPublisher` (thread + optional `communityId`), `linkedinPublisher` (`/rest/posts`, reads `x-restli-id`), `escapeLinkedInCommentary`, plus env helpers `isXConfigured` / `buildX` / `isLinkedInConfigured` / `buildLinkedIn` / `linkedinAuthorUrn`. The HTTP transport is injectable for offline mock tests.

## How it's used

This is a **workspace library**, not a separately published package. Each consuming MCP (`mcp/x-poster`, `mcp/linkedin-poster`, `mcp/crosspost`) imports it and **bundles it into its own `dist/` at build time** (esbuild), so every server stays independently installable (`npx`) with no extra dependency to publish. Build the core first (`npm run build -w social-core`) so consumers can typecheck against its `.d.ts`.

## License

MIT
