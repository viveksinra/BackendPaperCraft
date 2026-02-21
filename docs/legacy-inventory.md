## Legacy Backend Inventory (Phase 5 Discovery)

### Express Entrypoint
- [`Backend/server.js`](../server.js) boots an Express app via `require("./routes/api")` style routers and mounts:
  - `/api/v1/auth`, `/api/v1/companies`, `/api/v1/memberships`, `/api/v1/analytics`, `/api/v1/pages`, `/api/v1/templates`, plus miscellaneous `public` + `other` endpoints.
- `helmet`, `cors`, `compression`, legacy `requestContext` middleware, and a minimal logger sit in this stack.

### Route Map (pre-migration)
All routers live under [`Backend/routes/api/v1`](../routes/api/v1):

| File | Primary Paths | Key deps |
| --- | --- | --- |
| `auth.js` | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/profile`, `POST /auth/signup` | `Models/User`, `utils/auth` |
| `companies.js` | CRUD for companies, sessions, invites, company settings, branding & SEO defaults | `Models/Company`, `Models/Membership`, `_companyContext`, `utils/email` |
| `memberships.js` | `/memberships` listing + role transfers | `Models/Membership`, `_companyContext` |
| `analytics.js` | `/analytics/rules`, `/analytics/alerts`, `/analytics/time-series` | `Models/Analytics*`, `_companyContext`, `services/analytics` |
| `pages.js` | `/pages`, `/pages/:id`, override workflows, publish toggles | `Models/PageOverride`, dataset/template helpers |
| `templates.js` | `/templates`, `/templates/:id`, dataset bindings | `Models/Template`, `services/templates` |
| `_companyContext.js` | Shared middleware to resolve `companyId` from headers/cookies; used across routers. |

Other folders (`auth/`, `public/`, `other/`) expose OAuth callbacks and webhook shims.

### Queues & Jobs
- [`Backend/src/queue/queues.ts`](../src/queue/queues.ts) and `redisClient.ts` configure BullMQ queues: `generation`, `publish`, `qaGate`, `analytics`.
- Legacy `Backend/jobs/notificationWorker.js` is a placeholder worker invoked by old cron scripts.

### Data & Schema (Legacy)
- Mongo models live in [`Backend/Models`](../Models):
  - `Company`, `CompanySettings`, `Membership`, `User`, `Template`, `PageOverride`, analytics-related collections.
  - Programmatic SEO data is spread between template documents (schema/branding), dataset rows embedded in template JSON, and override docs per page.
- The TS refactor already defines normalized models under [`Backend/src/models`](../src/models):
  - `dataset`, `datasetRow`, `draftPage`, `publishJob`, `publishBatch`, `domainConfig`, etc.
  - These are not yet hydrated from production data—Phase 5 migration must backfill them.

### Supporting Services
- Legacy utilities in [`Backend/utils`](../utils) handle auth (JWT issue/verify, password hashing), email, and request envelope helpers.
- TS versions exist for logging, routing context, dataset ingestion, and generation under [`Backend/src/services`](../src/services) but are only partially wired.

### Gaps Identified
1. Dual-routing (pre-migration): the original `Backend/src/app.ts` required the legacy routers because auth/membership/analytics/pages CRUD had not yet been ported to TypeScript.
2. Company scoping: legacy `_companyContext` relies on cookies/query params; new routing middleware (`tenantContext`, `routingContext`) expects headers—needs consolidation.
3. Schema: templates/pages reference legacy collections; new normalized models + QA/publish logs need migration scripts.
4. Queues: bullmq queues exist but generation/publish jobs still triggered by legacy routes.

This document seeds the Phase 5 migration by freezing the legacy surface area before code moves into `src/api`, `src/shared`, and `src/worker`.

