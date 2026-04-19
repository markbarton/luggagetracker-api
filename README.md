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

## Example endpoints

The `land-registry-documents` slice is a worked CRUD example to copy when adding new resources.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness + Mongo ping |
| `GET` | `/land-registry-documents` | Paginated list. Query: `page`, `pageSize` (max 100), `titleNumber` (prefix match) |
| `GET` | `/land-registry-documents/:id` | Single document |
| `POST` | `/land-registry-documents` | Create. Body: `titleNumber`, `address`, `tenure`, optional `pricePaid`, `transferDate` |
| `PUT` | `/land-registry-documents/:id` | Replace |
| `DELETE` | `/land-registry-documents/:id` | 204 on success |

List response shape:

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
