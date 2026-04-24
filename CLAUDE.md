# CLAUDE.md

Guidance for Claude working in this repo. Read this before editing code.

## What this is

An Express + TypeScript API template. Starts with a health endpoint and one fully worked CRUD slice (`land-registry-documents`) that demonstrates the conventions below.

## The slice pattern

Every resource is built as three thin layers plus a type:

```
src/
  routes/<resource>Route.ts          URL → handler wiring only
  controllers/<resource>Controller.ts HTTP in/out, validation, status codes
  data/<resource>.ts                  Mongo access, no HTTP awareness
  types/<resource>.ts                 Shared interface + input type
```

Use the land-registry slice as the canonical example — copy its shape when adding new resources.

### Routes

- File: `src/routes/<resource>Route.ts` (camelCase, singular or plural matching the URL segment).
- Default export an `express.Router()`.
- No logic here — just `router.<verb>(path, handler)` lines.
- Mount in `src/app/appSetup.ts` with a kebab-case URL (`/land-registry-documents`).

### Controllers

- File: `src/controllers/<resource>Controller.ts`.
- Named exports per handler (`listDocuments`, `getDocument`, `createDocument`, ...).
- Every handler is wrapped in try/catch with `handleError(res, err, '<handlerName>')` in the catch.
- Validation uses **Zod** via `schema.safeParse(req.body)` (or `req.query`). Schemas live in `src/types/<resource>.ts` alongside the interface. Use `formatZodError` to turn failures into a single `error` string.
- Response shapes:
  - List: `{ data, pagination: { page, pageSize, total, totalPages } }`
  - Single: the document object
  - Create: 201 + the created document
  - Update: 200 + the updated document
  - Delete: 204 no body
  - Not found: 404 `{ error: 'Not found' }`
  - Validation failure: 400 `{ error: '<message>' }`
  - Unexpected: 500 `{ error: 'Internal server error' }` (generic by design — details go to logs)
- Pagination defaults: `page=1`, `pageSize=20`, max 100. Use `parsePositiveInt`.

### Data layer

- File: `src/data/<resource>.ts`.
- `DB_NAME` and `COLLECTION_NAME` as module-level constants. Lift to env only if asked.
- Access the collection via a local `collection()` helper that calls `returnClient().db(DB_NAME).collection<T>(COLLECTION_NAME)`. Throws if client isn't initialised.
- **All `ObjectId` handling lives here.** Controllers pass string ids; data functions call `ObjectId.isValid` and return `null` for invalid/missing, never throw.
- Timestamp fields (`createdAt`, `updatedAt`) are set in the data layer, not the controller.
- User-supplied input used in regex → run through `escapeRegex`.

### Types + schemas

- Define Zod schemas first, derive TS types via `z.infer<typeof schema>`. One source of truth.
- Conventions per resource:
  - `<resource>InputSchema` — request body shape for create/update.
  - `listQuerySchema` — query-string shape for list endpoints (use `z.coerce.number()` for numeric params).
  - `<Resource>` interface extends the inferred input with server-managed fields (`_id?: ObjectId`, `createdAt`, `updatedAt`).
- Zod is pinned to v3.x (template TypeScript is 4.7.x; v4 requires TS 5+). If you upgrade TypeScript, upgrade Zod too.

## Logging

- Import: `import logger from '../logger'` (default export).
- Levels:
  - `logger.debug(...)` — handler entry + outcome. Inputs, result counts, found/not-found. Only visible in `local`/`development`.
  - `logger.info(...)` — lifecycle events (startup, scheduled jobs firing).
  - `logger.error(...)` — unexpected server failures only. Reserved for `handleError`.
- Client-condition outcomes (validation failure, 404) → `debug`, not `warn`/`error`.
- Log format is single-line strings. Don't pass objects unless debugging locally.

## Environment variables

- Any app-owned env var uses the `CUSTOM_` prefix (e.g. `CUSTOM_PORT`, `CUSTOM_MONGO_CONNECTION`). `src/app/appInfo.ts` auto-surfaces these at startup.
- `NODE_ENV` drives logger config (`local`, `development`, `production`).
- Load order: `.env.development` for dev, `.env` for everything else. Never commit a `.env*` file with real credentials.

## Mongo

- Single connection, created once in `src/app/dbConnect.ts` and reused via `returnClient()`.
- Default DB (from connection string) is available via `returnDB()`. For a named DB, use `returnClient().db('<name>')` — our slice does this.
- Never create a new `MongoClient` in a handler or data module.

## Auth & security

Every endpoint except `/health`, `/auth/login`, `/auth/refresh`, `/auth/password-reset/*`, `/auth/magic-link/*`, `/auth/email-verify/confirm` requires authentication.

### Identities
- **systemAdmin** — `user.isSystemAdmin = true`, `clientId = null`. Bypasses all client/role checks.
- **clientAdmin** — `user.roles` contains `'clientAdmin'`. Scoped to own `clientId`.
- **user** — plain role. Sees only self + trips listed in `user.tripIds`.

### Access mode
`user.accessMode ∈ {'mobile', 'web', 'both'}` controls which platform the user can log in from. Enforced in `login` against the `platform` body field — not negotiable by the client. Mobile users get a 365d access token (no refresh, offline-first). Web users get 15m access + 30d refresh (rotated on refresh).

### Middleware
- `authenticate` (`src/middleware/authenticate.ts`) — verifies JWT signature, looks up session by `sid` (rejects if revoked/expired), loads user, populates `req.user`.
- `requireSystemAdmin`, `requireClientAdminOrSystemAdmin`, `requireAuthenticated` (`src/middleware/authorize.ts`).
- `canAccessClient(req.user, clientId)` and `scopeClientId(req.user)` — use these inside controllers when filtering list queries or checking write targets.

### When writing a new slice that belongs to a client

1. Mount the route with `router.use(authenticate)`.
2. In list handlers: read `scopeClientId(req.user)` and force that as the `clientId` filter unless the caller is sysadmin. If the query supplies a different `clientId` than the user can see → 403.
3. In get/update/delete handlers: load the target first, then `canAccessClient(req.user, target.clientId)` before acting.
4. Never trust a `clientId` from the request body for write scoping — always cross-check against `req.user`.

### Sessions
- Every issued JWT has a matching row in `sessions` (`src/data/sessions.ts`).
- Revocation is server-side: flip `revokedAt`. TTL index on `expiresAt` auto-cleans expired rows.
- After a password reset → `sessions.revokeAllForUser(userId)` (forces re-login everywhere).

### Email flows (password reset, email verify, magic link)

All three use the same pattern in `emailTokens`:
- One collection, `purpose` discriminator (`'passwordReset' | 'emailVerify' | 'magicLink'`).
- Token sent to user is 32 random bytes hex-encoded; only SHA-256 hash is persisted (`src/utils/emailTokenCrypto.ts`).
- TTL index on `expiresAt` auto-expires unused tokens.
- Single-use — mark `usedAt` on confirm.

Link format points to the **web UI**, not the API: `${CUSTOM_WEB_BASE_URL}/<path>?token=…`. The UI extracts the token and POSTs it to the matching confirm endpoint. Don't change this without discussion — it decouples API from UI routing.

Request endpoints (`/password-reset/request`, `/magic-link/request`) always return 204 regardless of whether the email exists, to prevent user enumeration. Log at `debug` level when no user matches.

Magic link is web-only: reject if `user.accessMode === 'mobile'`.

### Adding a new email

1. Add MJML template in `src/emails/<name>.ts` using `layoutMjml(...)` from `src/emails/layout.ts`. Always produce both `html` and `text` — some providers downgrade.
2. Always pass user input through `escapeHtml` before embedding in MJML.
3. Wire the send call in the controller using `sendEmail({ to, subject, html, text })` from `src/utils/mailer.ts`.
4. If it's a click-through flow, store a token via `emailTokens.create(...)` and build the URL with `webBaseUrl()`.

### What not to do (auth)

- Don't add endpoints without `authenticate` unless they're genuinely public (login, reset request, magic link request).
- Don't read `user.clientId` from the request body to scope a query — read it from `req.user`.
- Don't trust `platform` from the login body without checking `user.accessMode`.
- Don't skip the `sessions.findActiveById` check in `authenticate` — JWT signature alone is not sufficient (we need server-side revocation).
- Don't store raw email tokens — always hash with `hashEmailToken`.
- Don't reveal user existence in password-reset or magic-link request responses.
- Don't issue mobile tokens from the magic link flow.

## Adding a new slice

1. Create the four files (`types/`, `data/`, `controllers/`, `routes/`).
2. Follow the response shapes and error conventions above.
3. Mount the route in `src/app/appSetup.ts`.
4. Run `npx tsc --noEmit --project .` to typecheck before reporting done.
5. If the slice needs a new env var, add it with a `CUSTOM_` prefix and document in README.

## What not to do

- Don't put business logic in controllers (validation + HTTP shaping only).
- Don't import `mongodb` outside `src/app/dbConnect.ts` and `src/data/`.
- Don't introduce new dependencies without asking.
- Don't add global error-handling middleware — handlers own their errors.
- Don't add swagger/OpenAPI decorators. If docs are needed, generate from `express-list-endpoints`.
- Don't swap Zod for another validator (Joi, Yup, class-validator) without explicit approval.

## Scripts

- `npm run local` / `npm run dev` / `npm run start` — compile + run, varying `NODE_ENV`.
- `npm run build` — TypeScript compile only, output to `dist/`.
- `npm run deploy` — rsync deploy (see `scripts/deploy.js`). Sentinel-protected; safe re-runs.

## Deploy safety

Two layers guard `rsync --delete`:
1. `package.json` `name` must appear in the server's `remotePath`.
2. A `.deploy-project` sentinel file on the remote must match the local `name`. First-run creates it if the directory is missing/empty; aborts if the directory has files but no sentinel.

If you're asked to deploy, don't bypass either check — fix the config instead.
