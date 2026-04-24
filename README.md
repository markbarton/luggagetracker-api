# api-template

Express + TypeScript + MongoDB API template. Use this as the starting point for new API projects.

## Quick start

```bash
npm install
cp .env.example .env.development   # fill in real values
npm run dev
```

`.env*` files are gitignored — only `.env.example` is tracked. Never commit real credentials.

Server listens on `CUSTOM_PORT` (default `8765`). At startup it logs the active env vars and every mounted route.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run local` | Compile + run with `NODE_ENV=local` |
| `npm run dev` | Compile + run with `NODE_ENV=development` |
| `npm run start` | Compile + run with `NODE_ENV=production` |
| `npm run build` | TypeScript compile only (`dist/`) |
| `npm run deploy` | rsync deploy (see below) |

## Environment variables

App-owned vars use the `CUSTOM_` prefix. Logged automatically at startup by `src/app/appInfo.ts`.

| Var | Purpose |
| --- | --- |
| `APP_NAME` | Identifies the service in logs |
| `CUSTOM_PORT` | HTTP port |
| `CUSTOM_MONGO_CONNECTION` | Mongo connection string |
| `NODE_ENV` | `local` / `development` / `production` — drives logger config |
| `CUSTOM_JWT_SECRET` | JWT signing secret (≥32 chars; generate with `openssl rand -hex 32`) |
| `CUSTOM_JWT_WEB_ACCESS_TTL` | Web access token lifetime (default `15m`) |
| `CUSTOM_JWT_WEB_REFRESH_TTL` | Web refresh token lifetime (default `30d`) |
| `CUSTOM_JWT_MOBILE_ACCESS_TTL` | Mobile access token lifetime (default `365d`) |
| `CUSTOM_BCRYPT_ROUNDS` | bcrypt work factor, 4–15 (default `12`) |
| `CUSTOM_WEB_BASE_URL` | Base URL of the web UI — used inside email links |
| `CUSTOM_SMTP_HOST` / `_PORT` / `_SECURE` / `_USER` / `_PASS` / `_FROM` | SMTP provider settings for nodemailer |
| `CUSTOM_EMAIL_TOKEN_PASSWORD_RESET_TTL` | Password-reset link lifetime (default `1h`) |
| `CUSTOM_EMAIL_TOKEN_EMAIL_VERIFY_TTL` | Verify-email link lifetime (default `24h`) |
| `CUSTOM_EMAIL_TOKEN_MAGIC_LINK_TTL` | Magic-link lifetime (default `15m`) |

## Project layout

```
src/
  app/            bootstrap (db connect, middleware, route mount, startup logging)
  routes/         URL → handler wiring only
  controllers/    HTTP in/out, validation, status codes
  data/           Mongo access, no HTTP awareness
  types/          shared interfaces
  logger.ts       winston + pretty-error logger
  server.ts       entry point
scripts/
  deploy.js       rsync deploy with sentinel safety
```

See [CLAUDE.md](./CLAUDE.md) for the full slice pattern.

## Authentication & access control

### Identities

Three levels, all stored in `users`:

- **systemAdmin** — `isSystemAdmin: true`. Bypasses all checks. Not tied to a client.
- **clientAdmin** — has `'clientAdmin'` in `roles`. Scoped to their own `clientId`. Can manage users and trips for that client.
- **user** — plain role. Can see themselves and any trip in their `tripIds`.

### Platform / access mode

`user.accessMode` is one of:

| Value | Behaviour |
| --- | --- |
| `web` | 15m access token + 30d refresh token. Refresh rotates both. |
| `mobile` | Single 365d access token. **No refresh.** Designed for offline-first usage — device lock is the practical gate, server revocation kicks in when the app next syncs. |
| `both` | Platform is chosen at login time via the `platform` field. |

The platform is validated server-side against `accessMode` — clients cannot upgrade themselves to a long-lived mobile token.

### Bootstrap

Create the first system admin from the CLI:

```bash
npx ts-node src/scripts/createSystemAdmin.ts admin@example.com StrongPassw0rd "First" "Last"
```

Once that exists, log in as them and create clients + client admins via the API.

### Sessions & revocation

Every JWT has a matching row in `sessions` (includes `userId`, `platform`, `kind`, `expiresAt`). Revocation is server-side — `authenticate` middleware rejects a token if its session is `revokedAt` or expired. Endpoints: `GET /auth/sessions` (list your own), `POST /auth/sessions/:id/revoke`. Password reset revokes **all** of a user's sessions.

## Example endpoints

### Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | — | Body: `{ email, password, platform: 'web'\|'mobile', deviceLabel? }`. Returns `{ accessToken, refreshToken?, user }`. `refreshToken` only for web. |
| `POST` | `/auth/refresh` | — | Body: `{ refreshToken }`. Web only. Rotates the pair; old refresh is invalidated. |
| `POST` | `/auth/logout` | bearer | Revokes the current session. Optional `{ refreshToken }` in body also revoked. |
| `GET` | `/auth/me` | bearer | Current user profile. |
| `GET` | `/auth/sessions` | bearer | List the current user's active sessions. |
| `POST` | `/auth/sessions/:id/revoke` | bearer | Revoke a specific session. Self or systemAdmin. |
| `POST` | `/auth/password-reset/request` | — | Body: `{ email }`. Always returns 204. |
| `POST` | `/auth/password-reset/confirm` | — | Body: `{ token, newPassword }`. Revokes all user sessions on success. |
| `POST` | `/auth/email-verify/send` | bearer | Sends a verification link to the current user. 204 if already verified. |
| `POST` | `/auth/email-verify/confirm` | — | Body: `{ token }`. Marks user verified. |
| `POST` | `/auth/magic-link/request` | — | Body: `{ email }`. Web-only (rejected silently for mobile-only users). Always 204. |
| `POST` | `/auth/magic-link/confirm` | — | Body: `{ token }`. Returns `{ accessToken, refreshToken, user }` like a normal web login. |

Send authenticated requests as `Authorization: Bearer <accessToken>`.

### Email click-through flow

Email links point to the **web UI**, not the API:

```
${CUSTOM_WEB_BASE_URL}/reset-password?token=...
${CUSTOM_WEB_BASE_URL}/verify-email?token=...
${CUSTOM_WEB_BASE_URL}/magic-link?token=...
```

The web app renders its own UI for each, reads `token` from the query string, and POSTs it to the matching `/auth/*/confirm` endpoint.

Tokens are 32 random bytes hex-encoded, stored only as a SHA-256 hash, single-use, and expire per the `CUSTOM_EMAIL_TOKEN_*_TTL` env vars. Request endpoints never reveal whether an email is registered.

### Resources

| Method | Path | Who can hit it |
| --- | --- | --- |
| `GET` `POST` `PUT` `DELETE` | `/clients[/:id]` | systemAdmin only |
| `GET` | `/users` | systemAdmin sees all; clientAdmin sees own client; user sees own client (filtered by data layer) |
| `GET` | `/users/:id` | systemAdmin; clientAdmin for same-client user; self |
| `POST` | `/users` | systemAdmin; clientAdmin (can create users in own client only, cannot create systemAdmin) |
| `PUT` | `/users/:id` | systemAdmin; clientAdmin for same-client user |
| `PUT` | `/users/:id/password` | Same as update, **or** self |
| `PUT` | `/users/:id/trips` | systemAdmin; clientAdmin for same-client user. Body: `{ tripIds: string[] }` |
| `DELETE` | `/users/:id` | Soft-delete. Same as update. |
| `GET` | `/trips` | systemAdmin all; clientAdmin own client; user sees only trips in their `user.tripIds` |
| `GET` | `/trips/:id` | Same scoping as list |
| `POST` `PUT` `DELETE` | `/trips[/:id]` | systemAdmin; clientAdmin for own client |
| `GET` `POST` `PUT` `DELETE` | `/land-registry-documents[/:id]` | Template example — currently **unauthenticated** |

Delete operations on users/clients/trips are **soft** — they set `status: 'deleted'` and are excluded from normal queries.

### List response shape

```json
{
  "data": [...],
  "pagination": { "page": 1, "pageSize": 20, "total": 123, "totalPages": 7 }
}
```

## Deployment

`npm run deploy` syncs the project to a remote server via rsync. Configuration lives in `deploy.config.json` (branch → server mapping, excludes, post-deploy commands).

Two safety layers before any `rsync --delete`:

1. The server's `remotePath` must contain the `package.json` `name`.
2. A `.deploy-project` sentinel file on the remote must match the local project name. Auto-created on first deploy into an empty/missing directory; hard-abort if the directory has files but no sentinel (protects against deploying over a different project).

Useful flags:

```
npm run deploy -- --dry-run          Preview without deploying
npm run deploy -- --backup           Pull a remote backup before deploying
npm run deploy -- --backup-only      Backup only, no deploy
npm run deploy <server> -- --logs    pm2 logs on the target
npm run deploy <server> -- --status  pm2 status on the target
npm run deploy -- --help             Full list
```

## Working with Claude

Read [CLAUDE.md](./CLAUDE.md) — it codifies the conventions Claude should follow when adding features, especially the slice pattern and logging/error rules.
