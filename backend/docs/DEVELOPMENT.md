# Development Guide

> 🌐 **English** · [Монгол](DEVELOPMENT_MN.md)

This guide helps developers set up and work with the **Government Template
Platform V3.0** (Цахим засаглалыг бүтээх суурь) codebase — a production-ready
foundation on which any digital-government service can be built. Its flagship
reference deployment is **Government Template Platform**
(node.template.dgov.mn), an eID-based government service platform built on this
stack.

> **Origin.** Derived (via the Go edition) from the open-source
> [snykk/go-rest-boilerplate](https://github.com/snykk/go-rest-boilerplate)
> (MIT, by Najib Fikri). See [ARCHITECTURE.md](./ARCHITECTURE.md#credits--license)
> for full credits.

## Prerequisites

- **Node.js 22+** (the package sets `engines.node >= 22`; CI and both Docker images use 22)
- Docker & Docker Compose (only for integration tests / the local stack)
- PostgreSQL 16+ and Redis 7+ (or just use Docker)

No Make, no Go toolchain — everything runs through npm scripts.

## Quick Start

```bash
cd backend

# 1. Copy the environment file
cp .env.example .env
# Edit .env — JWT_SECRET must be at least 32 characters

# 2. Start the whole stack (db + redis + migrate + api + web) from the repo root
docker compose up -d --build

# 3. Or run the API locally against the compose db/redis
npm install
npm run dev            # tsx watch — hot reload
```

The server is available at `http://localhost:8080`; Swagger UI at
`http://localhost:8080/swagger/`.

## Development Commands

Run from `backend/`:

```bash
npm run dev             # tsx watch (hot reload)
npm run build           # tsc → dist/
npm run fmt             # prettier --write
npm run fmt:check       # prettier --check (CI gate)
npm run lint            # eslint --max-warnings 0 (type-aware)
npm run typecheck       # tsc --noEmit, includes tests
npm run openapi         # regenerate docs/openapi.json from routes/DTOs
npm run pre-push        # mirror CI: fmt + lint + typecheck + test + openapi drift + build + ESM smoke
```

And from `frontend/`:

```bash
npm run dev             # Vite dev server
npm run build           # build + lint + typecheck (what CI runs)
npm test                # vitest
```

!!! note
    `npm run openapi` is **not optional**. If you add or change a route or DTO
    and forget it, CI fails on OpenAPI drift.

## Testing

```bash
npm test                # Unit tests (mocks only — fast, no Docker)
npm run test:integration# Integration tests (requires Docker: Postgres + Redis)
npm test -- --coverage  # Coverage report
npm test -- users       # Only files matching "users"
npm run smoke:esm       # Import every built module — catches ESM/CJS interop breakage
```

Current state: **775 unit tests across 45 files**, plus an ESM import smoke over
219 modules.

## Database

### Migrations

```bash
# The compose stack runs this for you on every `up` (idempotent, advisory-locked)
docker compose run --rm migrate

# Or directly
cd backend && npx tsx src/cmd/migration/main.ts
```

Migrations are raw SQL files in `backend/migrations/` (`N_name.up.sql` +
`N_name.down.sql` pairs) — **unchanged from the Go edition**, so the same database
serves either. `src/datasources/migration/` holds only the **runner** (no SQL);
the CLI entrypoint is `src/cmd/migration/main.ts`.

To change the schema, add a forward SQL migration file. The runner applies it
idempotently: files are ordered by their leading number, each file plus its
`schema_migrations` row commits in one transaction, and the whole run holds a
session advisory lock so concurrent runners serialize.

There is **no ORM AutoMigrate** — the row interfaces in
`src/datasources/records/` are plain TypeScript interfaces with **snake_case keys
matching the column names**, not schema definitions. The schema comes only from
the `*.up.sql` files.

!!! warning "Numbering collision to be aware of"
    Two migrations share the `17_` prefix (`17_least_privilege_config_grants` and
    `17_org_rls_recursion_fix`). They are independent and both apply; keep it in
    mind when adding an `18_`-and-up migration or reasoning about apply order.

## Code Organization

### Adding a New Feature

Follow the layers inward-out. Use the existing `users` / `auth` modules as the
reference — the backend ships **24 usecase slices** under `src/usecases/`, each
following this same pattern. Example: adding a `Product` resource.

1. **Domain entity** — `src/domain/product.ts`

   Domain imports **nothing internal** — only `node:*` and (for users) `bcryptjs`.

   ```ts
   export interface Product {
     id: string;
     name: string;
     price: number;
     createdAt: Date;
   }
   ```

2. **Repository interface** — `src/datasources/repositories/interface/product.ts`

   Note `ctx: Ctx` as the **first parameter of every method**. This is the Node
   equivalent of Go's `context.Context`: it carries the request ID, the RLS
   identity and an `AbortSignal`. There is no ambient request state, so
   "forgot to pass the identity" becomes a compile error instead of a silent RLS
   bypass.

   ```ts
   import type { Ctx } from '../../../pkg/ctx/ctx.js';
   import type { Product } from '../../../domain/product.js';

   export interface ProductRepository {
     store(ctx: Ctx, input: Product): Promise<Product>;
     getById(ctx: Ctx, id: string): Promise<Product>;
   }
   ```

3. **Row interface + repository impl** — `src/datasources/records/product.ts` and
   `src/datasources/repositories/postgres/product/product_postgres.ts`

   The record is a **plain interface with snake_case keys matching the column
   names** — no decorators, no schema definition, no AutoMigrate. Soft delete is a
   nullable `deleted_at`.

   ```ts
   // records/product.ts
   export interface ProductRecord {
     id: string;
     name: string;
     price: number;
     created_at: Date;
     deleted_at: Date | null;
   }
   ```

   The repository runs hand-written SQL through the `pg` pool. **Parameterized
   queries only** (`$1, $2 …`) — never string interpolation. A `23505` unique
   violation becomes `apperror.conflict`; reads add an explicit
   `deleted_at IS NULL` predicate.

   ```ts
   async store(ctx: Ctx, input: Product): Promise<Product> {
     try {
       const { rows } = await this.db.query<ProductRecord>(
         ctx,
         `INSERT INTO products (id, name, price)
          VALUES ($1, $2, $3)
          RETURNING id, name, price, created_at, deleted_at`,
         [input.id, input.name, input.price],
       );
       const row = rows[0];
       if (!row) throw internalCause(new Error('insert returned no row'));
       return toDomain(row);
     } catch (err) {
       if (isUniqueViolation(err)) throw conflict('product exists');
       throw err;
     }
   }
   ```

   !!! tip "`noUncheckedIndexedAccess` is on"
       `rows[0]` is typed `ProductRecord | undefined`, so the explicit check above
       is not defensive noise — the compiler requires it.

4. **Usecase interface + impl** — `src/usecases/product/`

   Usecases depend **only on the repository interface**, never on the postgres
   adapter. Throw `apperror.*`; wrap library errors with `internalCause` so their
   text never reaches a client.

   ```ts
   // product_usecase.ts
   export interface ProductUsecase {
     create(ctx: Ctx, req: CreateProductRequest): Promise<Product>;
     getById(ctx: Ctx, id: string): Promise<Product>;
   }
   ```

5. **DTOs** — `src/http/dto/requests/product.ts`

   Requests are zod **`strictObject`** — unknown fields are rejected with 422,
   which is the equivalent of Go's `DisallowUnknownFields`.

   ```ts
   export const createProductSchema = strictObject({
     name: z.string().min(1).max(255),
     price: z.number().int().positive(),
   });
   export type CreateProductBody = z.infer<typeof createProductSchema>;
   ```

6. **Handler** — `src/http/handlers/v1/product/product_handler.ts`

   Handlers are `(req, res) => Promise<void>`, wrapped by `wrap()` at route
   registration (which converts a thrown `apperror` into the JSON envelope).
   `decodeBody` parses **and** validates in one step. Read the context from
   `req.ctx`.

   ```ts
   create: AsyncHandler = async (req, res) => {
     const body = decodeBody(req, createProductSchema);
     const product = await this.usecase.create(req.ctx, body);
     newSuccessResponse(req, res, 201, 'product created', productResponse(product));
   };
   ```

7. **Route** — `src/http/routes/route_product.ts` (mirror `route_users.ts`)

   !!! danger "Pass middleware PER ROUTE — never `use()` inside a module"
       In chi, `r.Group(...)` scopes middleware to the routes declared inside it.
       **Express has no equivalent**: `router.use(sub)` runs the sub-router's
       `use()` for *every* request from that point on, so middleware leaks onto
       endpoints that must not have it. In the Go→Node port this leaked
       `authMiddleware` onto `/auth/eid/poll` (breaking login with 401) and leaked
       the strict rate limiter onto the long-poll endpoint (constant 429).

       Always attach middleware in the route call itself:

   ```ts
   export function registerProductRoutes(router: Router, deps: Deps): void {
     const handler = newProductHandler(deps.productUC);
     const auth = deps.authMiddleware;

     const products = Router();
     products.post('/', auth, wrap(handler.create));
     products.get('/:id', auth, wrap(handler.getById));
     router.use('/products', products);
   }
   ```

   Register it in `src/http/routes/index.ts` and add `productUC` to `Deps`.

8. **Wire up** — in `src/cmd/api/server/server.ts`, construct repo → usecase →
   deps alongside the existing ones:

   ```ts
   const productRepo = newProductRepository(db);
   const productUC = newProductUsecase(productRepo);
   // … then add `productUC` to the Deps object passed to registerRoutes()
   ```

9. **Regenerate the OpenAPI spec**

   ```bash
   npm run openapi   # then commit backend/docs/openapi.json
   ```

   CI fails on drift, so this is not optional.

10. **Row-Level Security (per-user / per-tenant tables)** — if the new table holds
    data belonging to a specific citizen (not a public reference catalogue), it
    **must** carry RLS policies. Follow `migrations/14_organizations.up.sql`,
    `migrations/20_gov_services.up.sql` and `migrations/21_user_integrations.up.sql`:
    `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY`,
    then a `service` / `admin` / `self` policy trio keyed on the `app.user_id` /
    `app.user_role` session GUCs.

    The repository must then be **RLS-aware** — run each query inside
    `db.withRLS(ctx, …)`, which opens a transaction and publishes the request
    identity with `set_config(..., true)` (`SET LOCAL` semantics, so the identity
    cannot leak across pooled connections). See
    `repositories/postgres/org` / `repositories/postgres/gov` for a worked
    example.

    A request with no identity sets empty GUCs, so every policy denies every row
    (**fail-closed**). RLS only enforces when the API connects as a non-superuser
    DB role — the boot guard blocks a superuser / `BYPASSRLS` connection in
    production (see [SECURITY.md](SECURITY.md)). Public reference tables (e.g. the
    `gov_services` catalogue) stay RLS-free and are protected by table-level
    grants instead.

### Writing Tests

Tests live **next to the code** as `*.test.ts` and run under
[vitest](https://vitest.dev/). Mocks are **hand-written object literals** typed to
the repository interface — there is no mockery/codegen step, and `typecheck` covers
the test files too, so a mock that drifts from its interface fails the build.

#### Unit tests (usecase layer)

```ts
// src/usecases/product/product_usecase.test.ts
import { describe, expect, it, vi } from 'vitest';

import { background } from '../../pkg/ctx/ctx.js';
import { newProductUsecase } from './product_usecase.js';
import type { ProductRepository } from '../../datasources/repositories/interface/product.js';

const ctx = background();

it('creates a product', async () => {
  const store = vi.fn(() => Promise.resolve({ id: 'p1', name: 'X', price: 100, createdAt: new Date() }));
  const repo = { store, getById: vi.fn() } satisfies ProductRepository;

  const got = await newProductUsecase(repo).create(ctx, { name: 'X', price: 100 });

  expect(got.id).toBe('p1');
  expect(store).toHaveBeenCalledOnce();
});
```

Assert **typed domain errors**, not messages — `apperror` carries an
`ErrorType` enum:

```ts
await expect(uc.create(ctx, { name: '', price: 1 }))
  .rejects.toMatchObject({ type: ErrorType.BadRequest });
```

#### Route-wiring tests

Because Express's middleware scope differs from chi's `Group`, boot the **real**
router and assert which middleware actually ran. This class of bug is invisible to
unit tests:

```ts
// src/http/routes/route_product.test.ts
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.ctx = background(); next(); });

const v1 = express.Router();
registerProductRoutes(v1, deps);
app.use('/api/v1', v1);

const res = await fetch(`${base}/products/p1`);
expect(res.status).toBe(401);          // auth guard really is on this route
expect(authMw.calls()).toBe(1);
```

#### Integration tests (repository layer)

Real Postgres + Redis via [testcontainers](https://testcontainers.com/). These
exercise the **RLS policies**, which unit tests cannot:

```ts
// *.integration.test.ts — run with `npm run test:integration` (needs Docker)
const db = await setupPostgres();
const repo = newProductRepository(db);
const got = await repo.store(withUser(background(), 'u-1'), { …product });
expect(got.id).not.toBe('');
```

### Mocks

There is no mock generator. Write the object literal inline and let the compiler
check it:

```ts
const repo = {
  store: vi.fn(),
  getById: vi.fn(),
} satisfies ProductRepository;
```

`satisfies` is deliberate — it checks the shape against the interface **without**
widening the mock's type, so `expect(repo.store).toHaveBeenCalledWith(…)` keeps
full type information. If the interface gains a method, `npm run typecheck` fails
here rather than at runtime.

## Code Style

Formatting is **prettier** (`npm run fmt`), linting is **type-aware eslint**
(`recommendedTypeChecked`) with `--max-warnings 0`. Both are CI gates, so run
`npm run pre-push` before pushing.

### Language policy

Code identifiers and commit messages in **English**; comments and UI strings in
**Mongolian**. Every source file starts with the two-line
`Government Template Platform V3.0` header — copy it from any existing file.

### Naming conventions

| Type            | Convention  | Example |
|-----------------|-------------|---------|
| File            | snake_case  | `product_usecase.ts`, `route_product.ts` |
| Interface / type| PascalCase  | `ProductRepository`, `Ctx` |
| Class           | PascalCase  | `AuthHandler` |
| Function / method | camelCase | `getById` |
| Variable        | camelCase   | `userCount` |
| Constant        | PascalCase (exported) / camelCase (module-local) | `RoleAdmin`, `tokenCutoffTTLSeconds` |
| Factory         | `new<Thing>` | `newProductUsecase`, `newProductRepository` |
| DB row field    | snake_case  | `request_id`, `created_at` — matches the column exactly |
| JSON field      | snake_case  | `request_id` |

### ESM: relative imports carry `.js`

The package is `"type": "module"`, so **every relative import must end in `.js`**
even though the file on disk is `.ts`. That is the path Node resolves at runtime;
omitting it fails at import time, not compile time — which is exactly why
`npm run smoke:esm` exists as a separate CI gate.

```ts
import { newProductUsecase } from '../../usecases/product/product_usecase.js'; // ✅
import { newProductUsecase } from '../../usecases/product/product_usecase';    // ❌
```

### TypeScript strictness

`strict` **and** `noUncheckedIndexedAccess` are on. The latter means `arr[0]` is
`T | undefined`, so index access needs an explicit check. Treat that as a feature:
most "cannot read property of undefined" crashes become compile errors.

### Error handling

Throw typed domain errors (`src/apperror`) — never throw raw library errors at the
client:

```ts
const user = await this.repo.getById(ctx, id);  // apperror.notFound surfaces as 404
```

Wrap an internal cause so its text is logged but **not** returned:

```ts
try {
  await this.cipher.decrypt(row.access_token);
} catch (err) {
  throw internalCause(err);   // client sees a generic 500; the cause is logged
}
```

`respondWithError` (in `src/http/response.ts`) maps the error type to a status
code, logs 5xx causes, and renders the envelope. The envelope helpers all live in
that file: `decodeBody` (size-capped, unknown-field-rejecting parse **and**
zod validation → 422 with per-field detail), `newSuccessResponse`,
`newErrorResponse`, `respondWithError`, and `wrap`.

### Context usage

Always pass `ctx: Ctx` **first**; in handlers read it from `req.ctx` and thread it
through every repository call:

```ts
async getById(ctx: Ctx, id: string): Promise<User> {
  const { rows } = await this.db.query<UserRecord>(
    ctx,
    `SELECT ${userColumns} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound('user not found');
  return toDomain(row);
}
```

For `users`-table access, go through `db.withRLS(ctx, …)` instead of a bare
query — see [Adding a New Feature](#adding-a-new-feature) step 10.

## Extending the AI assistant

> Deep dive: [AI_PIPELINE.md](AI_PIPELINE.md) — flows, prompt layers, voice, troubleshooting.

The Gemini pipeline (`src/usecases/ai`) is built to be extended per project:

- **Add a tool** — implement an `ai.ToolDef` (a Gemini function declaration +
  an `execute` function) and append it to the tool list in
  `src/cmd/api/server/server.ts`. The model decides when to call it; the backend
  executes it with the request context (so RLS applies to any DB access).
  `KnowledgeSearchTool` (searches `ai_knowledge`) and `get_server_time` are
  the shipped examples.
- **Change what the assistant helps with** — edit the `scope` prompt layer at
  runtime (Admin → Settings, or `PUT /admin/ai/prompts/scope`). The base
  guardrail layer (language, scope enforcement, prompt-injection resistance)
  is hardcoded in `ai_prompts.ts` and should stay that way — **never** make the
  guardrail layer DB-configurable.
- **Grow the knowledge base** — insert rows into `ai_knowledge`
  (title/content/tags). The ILIKE search in
  `datasources/repositories/postgres/ai` is a single query — swap it for tsvector
  or pgvector when the corpus grows.
- **Models** — chat/STT/translate use `GEMINI_MODEL`; TTS uses
  `GEMINI_TTS_MODEL` (a separate, audio-capable model). Both are env-only
  config.

## API Documentation

### How the spec is produced

The Go edition generated its spec from **godoc annotations** on each handler.
This edition has no annotation scanner: the OpenAPI document is written
**explicitly** in `src/cmd/openapi/document.ts` and emitted by
`src/cmd/openapi/main.ts`.

The trade-off is deliberate. Annotations drift silently when a handler changes;
an explicit document plus a **CI drift check** makes the spec a reviewed artifact
— you can see the contract change in the diff.

```ts
// src/cmd/openapi/document.ts
'/auth/eid/start': {
  post: {
    summary: 'Start eID login',
    description: 'Begin an eID login session (returns a QR / deep-link challenge to poll).',
    tags: ['auth'],
    requestBody: { … },
    responses: {
      '200': { $ref: '#/components/responses/Ok' },
      '422': { $ref: '#/components/responses/Error' },
    },
  },
},
```

Handlers still carry a one-line contract comment above each method
(`/** POST /auth/eid/start · 200 · 422 */`) so the route, method and status codes
are visible where the code is.

### Regenerate

```bash
npm run openapi              # writes backend/docs/openapi.json
npm run openapi -- --check   # what CI runs — fails on drift
```

Swagger UI: `http://localhost:8080/swagger/` (gated in production by
`OBSERVABILITY_TOKEN` — it returns **404**, not 401, so its existence stays
hidden).

!!! warning "Every route must be in the spec"
    Add a route or change a DTO → update `document.ts` → run `npm run openapi` →
    commit `backend/docs/openapi.json`. CI fails otherwise.

## Troubleshooting

**Database connection failed**
```bash
docker compose ps                 # is Postgres up?
# check DB_POSTGRE_URL / DB_POSTGRE_DSN in backend/.env
```

**`ERR_MODULE_NOT_FOUND` at runtime, but `tsc` was happy** — you almost certainly
omitted the `.js` extension on a relative import. `npm run smoke:esm` reproduces
it deterministically.

**Migration failed** — inspect `migrations/` ordering and the `schema_migrations`
table; the runner uses an advisory lock + per-file transaction. Remember the two
`17_` files (see [Migrations](#migrations)).

**Everything returns 401 after a code change** — check whether you added
`router.use(middleware)` inside a route module. In Express that leaks onto every
later request; pass middleware **per route** instead.

**Tests failing**
```bash
npm test -- --reporter=verbose
npm test -- product              # only files matching "product"
npm test -- -t "creates a product"   # only tests matching the name
```

**Lint / format errors**
```bash
npm run fmt                       # prettier --write
npm run lint -- --fix
```

**CI fails on OpenAPI drift** — run `npm run openapi` and commit
`backend/docs/openapi.json`.

## Security Checklist

Before deploying, ensure:

- [ ] All protected endpoints carry the auth middleware — **passed per route**, not via `use()`
- [ ] Anonymous endpoints (`/auth/*`) keep the rate limiter + body cap
- [ ] `JWT_SECRET` is ≥ 32 random chars and not the example value
- [ ] Every request DTO is a zod `strictObject` (unknown fields rejected)
- [ ] New per-user tables have RLS policies **and** the repository uses `withRLS`
- [ ] The API connects as a **non-superuser** DB role (the boot guard enforces this in production)
- [ ] `INTEGRATION_ENC_KEY` is set (production refuses to start without it)
- [ ] Secrets come from the environment, never committed
- [ ] `ALLOWED_ORIGINS` is set (no wildcard) in production
- [ ] HTTPS is enforced at the edge / load balancer

---

**Government Template Platform V3.0** — Co-developed by the **Gerege Systems Development Team** and **Claude AI**, 2026.
