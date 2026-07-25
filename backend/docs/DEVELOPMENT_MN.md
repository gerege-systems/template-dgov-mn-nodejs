# Development Guide

> 🌐 [English](DEVELOPMENT.md) · **Монгол**

Энэ заавар нь хөгжүүлэгчдэд **Government Template Platform V3.0** (Цахим
засаглалыг бүтээх суурь) кодын бааз — аливаа цахим засаглалын үйлчилгээг дээр нь
босгох production-ready суурь — дээр тохиргоо хийж, ажиллахад туслана. Түүний
жишиг лавлагаа deployment нь энэ стек дээр бүтээгдсэн eID-д суурилсан төрийн
үйлчилгээний платформ буюу **Government Template Platform**
(node.template.dgov.mn) юм.

> **Эх сурвалж.** Najib Fikri-ийн нээлттэй эх
> [snykk/go-rest-boilerplate](https://github.com/snykk/go-rest-boilerplate)
> (MIT)-аас (Go хувилбараар дамжин) гаралтай. Бүрэн зохиогчдын мэдээллийг
> [ARCHITECTURE_MN.md](./ARCHITECTURE_MN.md#credits--license)-аас үз.

## Шаардлага (Prerequisites)

- **Node.js 22+** (багц нь `engines.node >= 22` тавьсан; CI болон хоёр Docker дүрс 22 ашиглана)
- Docker + Docker Compose (зөвхөн integration тест / локал стекэд)
- PostgreSQL 16+ ба Redis 7+ (эсвэл зүгээр Docker ашигла)

Make ч, Go toolchain ч ХЭРЭГГҮЙ — бүгд npm script-ээр ажиллана.

## Түргэн эхлүүлэх (Quick Start)

```bash
cd backend

# 1. Орчны файлыг хуулна
cp .env.example .env
# .env засна — JWT_SECRET дор хаяж 32 тэмдэгт байх ёстой

# 2. Бүтэн стекийг repo-гийн үндсээс эхлүүлнэ (db + redis + migrate + api + web)
docker compose up -d --build

# 3. Эсвэл API-г локалд, compose-ийн db/redis-ийн эсрэг ажиллуулна
npm install
npm run dev            # tsx watch — халуун ачаалалт
```

Сервер `http://localhost:8080` дээр; Swagger UI нь
`http://localhost:8080/swagger/`.

## Хөгжүүлэлтийн командууд (Development Commands)

`backend/`-ээс ажиллуулна:

```bash
npm run dev             # tsx watch (халуун ачаалалт)
npm run build           # tsc → dist/
npm run fmt             # prettier --write
npm run fmt:check       # prettier --check (CI-ийн gate)
npm run lint            # eslint --max-warnings 0 (type-aware)
npm run typecheck       # tsc --noEmit, тестүүдийг ч хамарна
npm run openapi         # route/DTO-оос docs/openapi.json-ыг дахин үүсгэнэ
npm run pre-push        # CI-г тольдоно: fmt + lint + typecheck + test + openapi drift + build + ESM smoke
```

`frontend/`-ээс бол:

```bash
npm run dev             # Vite dev сервер
npm run build           # build + lint + typecheck (CI-ийн ажиллуулдаг)
npm test                # vitest
```

> **Тэмдэглэл.** `npm run openapi` нь **сонголт биш**. Route эсвэл DTO нэмж/өөрчилж
> байгаад мартвал CI нь OpenAPI drift дээр унана.

## Тест (Testing)

```bash
npm test                # Unit тест (зөвхөн mock — хурдан, Docker-гүй)
npm run test:integration# Integration тест (Docker шаардана: Postgres + Redis)
npm test -- --coverage  # Хамрагдалтын тайлан
npm test -- users       # Зөвхөн "users"-тэй таарах файлууд
npm run smoke:esm       # Build хийсэн модуль бүрийг импортлоно — ESM/CJS interop-ийн эвдрэлийг барина
```

Одоогийн байдал: **45 файлд 775 unit тест**, дээр нь 219 модулийн ESM import
smoke.

## Өгөгдлийн сан (Database)

### Migration-ууд

```bash
# Compose стек `up` бүрд үүнийг өөрөө ажиллуулна (идемпотент, advisory lock-той)
docker compose run --rm migrate

# Эсвэл шууд
cd backend && npx tsx src/cmd/migration/main.ts
```

Migration нь `backend/migrations/` доторх түүхий SQL файлууд (`N_name.up.sql` +
`N_name.down.sql` хос) — **Go хувилбараас хэвээр**, тиймээс нэг өгөгдлийн сан
хоёуланд үйлчилнэ. `src/datasources/migration/` нь зөвхөн **runner**-ыг агуулна
(SQL байхгүй); CLI нэвтрэх цэг нь `src/cmd/migration/main.ts`.

Схем өөрчлөхийн тулд урагшлах SQL migration файл нэмнэ. Runner нь идемпотентоор
хэрэглэнэ: файлууд урд талын дугаараараа эрэмбэлэгдэнэ, файл бүр өөрийн
`schema_migrations` мөрийн хамт НЭГ транзакцид commit болно, бүхэл ажиллагаа нь
session advisory lock барих тул зэрэг ажиллагсад цуварна.

**ORM AutoMigrate БАЙХГҮЙ** — `src/datasources/records/` доторх мөрийн interface
нь **баганын нэртэй яг таарсан snake_case түлхүүртэй** энгийн TypeScript
interface бөгөөс схемийн тодорхойлолт БИШ. Схем нь зөвхөн `*.up.sql` файлуудаас
гарна.

> ⚠️ **Дугаарлалтын давхцлыг анхаар.** Хоёр migration `17_` угтвар хуваалцана
> (`17_least_privilege_config_grants` ба `17_org_rls_recursion_fix`). Тэдгээр нь
> бие даасан бөгөөд хоёулаа хэрэглэгддэг; `18_`-аас дээш migration нэмэх эсвэл
> хэрэглэх дарааллыг бодохдоо санаж бай.

## Кодын зохион байгуулалт (Code Organization)

### Шинэ фичер нэмэх (Adding a New Feature)

Давхаргуудыг дотогшоо чиглэлээр дага. Одоо байгаа `users` / `auth` модулиудыг
лавлагаа болго — backend нь `src/usecases/` дор **24 usecase зүсэм** агуулах ба
тус бүр нь яг энэ загварыг дагана. Жишээ: `Product` нөөц нэмэх.

1. **Домэйн entity** — `src/domain/product.ts`

   Домэйн нь дотоод юуг ч import хийхгүй — зөвхөн `node:*` ба (users-д) `bcryptjs`.

   ```ts
   export interface Product {
     id: string;
     name: string;
     price: number;
     createdAt: Date;
   }
   ```

2. **Repository interface** — `src/datasources/repositories/interface/product.ts`

   Метод бүрийн **эхний параметр** нь `ctx: Ctx` гэдгийг анхаар. Энэ нь Go-гийн
   `context.Context`-ийн Node эквивалент: requestId, RLS identity болон
   `AbortSignal`-ыг зөөнө. Ambient хүсэлтийн төлөв БАЙХГҮЙ тул "identity
   дамжуулахаа мартах" нь чимээгүй RLS тойролт биш compile алдаа болно.

   ```ts
   import type { Ctx } from '../../../pkg/ctx/ctx.js';
   import type { Product } from '../../../domain/product.js';

   export interface ProductRepository {
     store(ctx: Ctx, input: Product): Promise<Product>;
     getById(ctx: Ctx, id: string): Promise<Product>;
   }
   ```

3. **Мөрийн interface + repository хэрэгжүүлэлт** — `src/datasources/records/product.ts` ба
   `src/datasources/repositories/postgres/product/product_postgres.ts`

   Record нь **баганын нэртэй яг таарсан snake_case түлхүүртэй** энгийн interface
   — decorator ч, схемийн тодорхойлолт ч, AutoMigrate ч байхгүй. Soft delete нь
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

   Repository нь `pg` pool-оор гараар бичсэн SQL ажиллуулна. **ЗӨВХӨН
   параметржүүлсэн query** (`$1, $2 …`) — мөр нийлүүлэлт ХЭЗЭЭ Ч биш. `23505`
   давхардлын алдаа нь `apperror.conflict` болно; уншилтууд ил
   `deleted_at IS NULL` предикат нэмнэ.

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

   > 💡 **`noUncheckedIndexedAccess` асаалттай.** `rows[0]` нь
   > `ProductRecord | undefined` төрөлтэй тул дээрх ил шалгалт нь хэт болгоомжлол
   > биш — compiler шаардаж байгаа юм.

4. **Usecase interface + хэрэгжүүлэлт** — `src/usecases/product/`

   Usecase нь **зөвхөн repository interface-ээс** хамаарна — postgres адаптераас
   ХЭЗЭЭ Ч биш. `apperror.*` шид; library-ийн алдааг `internalCause`-ээр боож,
   текст нь клиентэд хэзээ ч хүрэхгүй болго.

   ```ts
   // product_usecase.ts
   export interface ProductUsecase {
     create(ctx: Ctx, req: CreateProductRequest): Promise<Product>;
     getById(ctx: Ctx, id: string): Promise<Product>;
   }
   ```

5. **DTO-ууд** — `src/http/dto/requests/product.ts`

   Хүсэлтүүд нь zod **`strictObject`** — танихгүй талбар 422-оор татгалзагдана,
   энэ нь Go-гийн `DisallowUnknownFields`-тэй дүйцнэ.

   ```ts
   export const createProductSchema = strictObject({
     name: z.string().min(1).max(255),
     price: z.number().int().positive(),
   });
   export type CreateProductBody = z.infer<typeof createProductSchema>;
   ```

6. **Handler** — `src/http/handlers/v1/product/product_handler.ts`

   Handler нь `(req, res) => Promise<void>` бөгөөд route бүртгэх үед `wrap()`-аар
   боогдоно (шидэгдсэн `apperror`-ыг JSON дугтуй болгоно). `decodeBody` нь НЭГ
   алхамд задалж **бас** баталгаажуулна. Контекстийг `req.ctx`-ээс унш.

   ```ts
   create: AsyncHandler = async (req, res) => {
     const body = decodeBody(req, createProductSchema);
     const product = await this.usecase.create(req.ctx, body);
     newSuccessResponse(req, res, 201, 'product created', productResponse(product));
   };
   ```

7. **Route** — `src/http/routes/route_product.ts` (`route_users.ts`-ийг тольдоно)

   > ⛔ **Middleware-ийг ROUTE ТУС БҮРД дамжуул — модуль дотор `use()` ХЭЗЭЭ Ч биш.**
   > chi-д `r.Group(...)` нь middleware-ийг зөвхөн дотроо зарласан route-уудад
   > хүрээлдэг. **Express-д эквивалент БАЙХГҮЙ**: `router.use(sub)` нь дэд
   > router-ийн `use()`-г тэр цэгээс хойших *БҮХ* хүсэлтэд ажиллуулах тул
   > middleware нь байх ёсгүй endpoint рүү гоожино. Go→Node портын үед энэ нь
   > `authMiddleware`-ийг `/auth/eid/poll` руу гоожуулж нэвтрэлтийг 401 болгосон,
   > мөн чанга rate limiter-ийг long-poll рүү гоожуулж байнга 429 үүсгэсэн.
   >
   > Middleware-ийг ҮРГЭЛЖ route дуудлага дотор нь хавсарга:

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

   `src/http/routes/index.ts`-д бүртгэж, `Deps`-д `productUC` нэмнэ.

8. **Холбох** — `src/cmd/api/server/server.ts` дотор одоо байгаагийн хажууд
   repo → usecase → deps-ийг угсарна:

   ```ts
   const productRepo = newProductRepository(db);
   const productUC = newProductUsecase(productRepo);
   // … дараа нь registerRoutes()-д дамжуулах Deps объектод `productUC` нэмнэ
   ```

9. **OpenAPI spec-ийг дахин үүсгэх**

   ```bash
   npm run openapi   # дараа нь backend/docs/openapi.json-ыг commit хийнэ
   ```

   CI нь drift дээр унадаг тул энэ нь сонголт биш.

10. **Row-Level Security (хэрэглэгч / түрээслэгч тус бүрийн хүснэгт)** — шинэ
    хүснэгт нь тодорхой иргэнд хамаарах өгөгдөл агуулж байвал (нийтийн лавлах
    каталог БИШ) RLS policy **ЗААВАЛ** байх ёстой.
    `migrations/14_organizations.up.sql`, `migrations/20_gov_services.up.sql`,
    `migrations/21_user_integrations.up.sql`-ийг дага:
    `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **БА** `FORCE ROW LEVEL SECURITY`,
    дараа нь `app.user_id` / `app.user_role` session GUC дээр түлхүүрлэсэн
    `service` / `admin` / `self` гурвал policy.

    Дараа нь repository нь **RLS-мэдэгч** байх ёстой — query бүрийг
    `db.withRLS(ctx, …)` дотор ажиллуул. Тэр нь транзакц нээж, хүсэлтийн
    identity-г `set_config(..., true)`-оор нийтэлнэ (`SET LOCAL` семантик тул
    identity нь холболтын сангаар дамжин гоожихгүй). Бодит жишээг
    `repositories/postgres/org` / `repositories/postgres/gov`-оос үз.

    Identity-гүй хүсэлт нь GUC-ийг хоосон тавих тул policy бүр мөр бүрийг
    татгалзана (**fail-closed**). RLS нь API нь superuser БИШ DB role-оор
    холбогдсон үед л мөрдөгдөнө — boot guard нь production-д superuser /
    `BYPASSRLS` холболтыг хаана ([SECURITY.md](SECURITY.md)-ийг үз). Нийтийн
    лавлах хүснэгтүүд (жишээ нь `gov_services` каталог) RLS-гүй хэвээр үлдэж,
    хүснэгтийн түвшний grant-аар хамгаалагдана.

### Тест бичих (Writing Tests)

Тестүүд кодынхоо **ХАЖУУД** `*.test.ts` нэрээр байрлаж, [vitest](https://vitest.dev/)
дор ажиллана. Mock нь repository interface-д тааруулсан **гараар бичсэн объект** —
mockery/codegen алхам БАЙХГҮЙ, мөн `typecheck` нь тестийн файлуудыг ч хамардаг тул
interface-ээсээ хазайсан mock нь build-ыг унагана.

#### Unit тест (usecase давхарга)

```ts
// src/usecases/product/product_usecase.test.ts
import { describe, expect, it, vi } from 'vitest';

import { background } from '../../pkg/ctx/ctx.js';
import { newProductUsecase } from './product_usecase.js';
import type { ProductRepository } from '../../datasources/repositories/interface/product.js';

const ctx = background();

it('бүтээгдэхүүн үүсгэнэ', async () => {
  const store = vi.fn(() => Promise.resolve({ id: 'p1', name: 'X', price: 100, createdAt: new Date() }));
  const repo = { store, getById: vi.fn() } satisfies ProductRepository;

  const got = await newProductUsecase(repo).create(ctx, { name: 'X', price: 100 });

  expect(got.id).toBe('p1');
  expect(store).toHaveBeenCalledOnce();
});
```

Мессежээр биш **төрөлжсөн domain алдаагаар** батал — `apperror` нь `ErrorType`
enum зөөнө:

```ts
await expect(uc.create(ctx, { name: '', price: 1 }))
  .rejects.toMatchObject({ type: ErrorType.BadRequest });
```

#### Route-ийн холболтын тест

Express-ийн middleware хүрээ нь chi-ийн `Group`-оос ялгаатай тул **БОДИТ**
router-ыг босгож, аль middleware үнэхээр ажилласныг батал. Энэ төрлийн алдаа
unit тестэд огт харагдахгүй:

```ts
// src/http/routes/route_product.test.ts
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.ctx = background(); next(); });

const v1 = express.Router();
registerProductRoutes(v1, deps);
app.use('/api/v1', v1);

const res = await fetch(`${base}/products/p1`);
expect(res.status).toBe(401);          // auth хамгаалалт үнэхээр энэ route дээр байна
expect(authMw.calls()).toBe(1);
```

#### Integration тест (repository давхарга)

[testcontainers](https://testcontainers.com/)-оор жинхэнэ Postgres + Redis.
Эдгээр нь unit тестийн чадахгүй **RLS policy**-г шалгана:

```ts
// *.integration.test.ts — `npm run test:integration`-ээр ажиллана (Docker шаардана)
const db = await setupPostgres();
const repo = newProductRepository(db);
const got = await repo.store(withUser(background(), 'u-1'), { …product });
expect(got.id).not.toBe('');
```

### Mock-ууд

Mock үүсгэгч БАЙХГҮЙ. Объектыг шууд бичээд compiler-ээр шалгуул:

```ts
const repo = {
  store: vi.fn(),
  getById: vi.fn(),
} satisfies ProductRepository;
```

`satisfies` нь зориудынх — mock-ийн төрлийг **өргөсгөлгүйгээр** хэлбэрийг
interface-тэй тулгана, тиймээс `expect(repo.store).toHaveBeenCalledWith(…)` нь
төрлийн бүрэн мэдээллээ хадгална. Interface шинэ метод авбал ажиллах үед биш,
ЭНД `npm run typecheck` унана.

## Кодын хэв маяг (Code Style)

Формат нь **prettier** (`npm run fmt`), lint нь **төрөл мэдэгч eslint**
(`recommendedTypeChecked`) бөгөөд `--max-warnings 0`. Хоёулаа CI-ийн gate тул
push хийхээс өмнө `npm run pre-push` ажиллуул.

### Хэлний бодлого

Кодын танигч ба commit мессеж **англиар**; тайлбар ба UI-ийн мөрүүд **монголоор**.
Эх файл бүр хоёр мөрийн `Government Template Platform V3.0` толгойгоор эхэлнэ —
байгаа аль ч файлаас хуулж ав.

### Нэрлэх дүрэм (Naming Conventions)

| Төрөл           | Дүрэм       | Жишээ |
|-----------------|-------------|---------|
| Файл            | snake_case  | `product_usecase.ts`, `route_product.ts` |
| Interface / төрөл| PascalCase | `ProductRepository`, `Ctx` |
| Class           | PascalCase  | `AuthHandler` |
| Функц / метод   | camelCase   | `getById` |
| Хувьсагч        | camelCase   | `userCount` |
| Тогтмол         | PascalCase (экспортлосон) / camelCase (модуль дотор) | `RoleAdmin`, `tokenCutoffTTLSeconds` |
| Factory         | `new<Thing>` | `newProductUsecase`, `newProductRepository` |
| DB мөрийн талбар| snake_case  | `request_id`, `created_at` — багантай яг таарна |
| JSON талбар     | snake_case  | `request_id` |

### ESM: харьцангуй import нь `.js` зөөнө

Багц нь `"type": "module"` тул дискэн дээрх файл `.ts` байсан ч **харьцангуй
import бүр `.js`-ээр төгсөх ЁСТОЙ**. Node ажиллах үед яг тэр замыг шийддэг;
орхивол compile үед биш, import үед унана — яг үүний учир `npm run smoke:esm`
тусдаа CI gate болж байгаа юм.

```ts
import { newProductUsecase } from '../../usecases/product/product_usecase.js'; // ✅
import { newProductUsecase } from '../../usecases/product/product_usecase';    // ❌
```

### TypeScript-ийн хатуу горим

`strict` **БА** `noUncheckedIndexedAccess` асаалттай. Сүүлийнх нь `arr[0]`-ыг
`T | undefined` болгодог тул индексээр хандахад ил шалгалт хэрэгтэй. Үүнийг
давуу тал гэж үз: "cannot read property of undefined" төрлийн ихэнх уналт
compile алдаа болж хувирна.

### Алдаа боловсруулалт (Error Handling)

Төрөлжсөн domain алдаа шид (`src/apperror`) — library-ийн түүхий алдааг клиент рүү
ХЭЗЭЭ Ч бүү шид:

```ts
const user = await this.repo.getById(ctx, id);  // apperror.notFound нь 404 болж гарна
```

Дотоод шалтгааныг боож, текстийг нь логдох ч буцаахгүй бол:

```ts
try {
  await this.cipher.decrypt(row.access_token);
} catch (err) {
  throw internalCause(err);   // клиент ерөнхий 500 харна; шалтгаан логдоно
}
```

`respondWithError` (`src/http/response.ts` дотор) нь алдааны төрлийг статус код руу
буулгаж, 5xx шалтгааныг логдож, дугтуйг үзүүлнэ. Дугтуйн туслахууд бүгд тэр
файлд: `decodeBody` (хэмжээ хязгаартай, танихгүй талбарыг татгалздаг задлалт
**БА** zod шалгалт → талбар тус бүрийн дэлгэрэнгүйтэй 422),
`newSuccessResponse`, `newErrorResponse`, `respondWithError`, `wrap`.

### Контекст ашиглах (Context Usage)

`ctx: Ctx`-ийг ҮРГЭЛЖ **эхэнд** дамжуул; handler дотор `req.ctx`-ээс уншиж,
repository дуудлага бүрээр дамжуул:

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

`users` хүснэгт рүү хандахдаа нүцгэн query биш `db.withRLS(ctx, …)`-ээр яв —
[Шинэ фичер нэмэх](#шинэ-фичер-нэмэх-adding-a-new-feature)-ийн 10-р алхмыг үз.

## AI туслахыг өргөтгөх

> Гүн тайлбар: [AI_PIPELINE_MN.md](AI_PIPELINE_MN.md) — урсгал, prompt давхарга, voice, troubleshooting.

Gemini pipeline (`src/usecases/ai`) нь проект бүрд өргөтгөгдөхөөр
зохиогдсон:

- **Tool нэмэх** — `ai.ToolDef` (Gemini function declaration + Go `Execute`
  функц) бичээд `src/cmd/api/server/server.ts`-ийн tool жагсаалтад нэмнэ. Model
  хэзээ дуудахаа өөрөө шийднэ; backend хүсэлтийн context-оор гүйцэтгэдэг тул
  DB хандалтад RLS үйлчилнэ. Жишээ: `KnowledgeSearchTool` (`ai_knowledge`-ээс
  хайдаг), `get_server_time`.
- **Туслахын чиглэлийг өөрчлөх** — `scope` давхаргыг ажиллаж байх үед нь
  засна (Админ → Тохиргоо, эсвэл `PUT /admin/ai/prompts/scope`). Suurь
  хамгаалалтын давхарга (хэл, хүрээний сахилт, prompt-injection эсэргүүцэл)
  `ai_prompts.ts`-д хатуу бичигдсэн — тэр хэвээрээ байх ёстой; guardrail давхаргыг
  **ХЭЗЭЭ Ч** DB-ээс тохируулдаг болгож болохгүй.
- **Мэдлэгийн санг өргөтгөх** — `ai_knowledge`-д мөр нэмнэ
  (title/content/tags). `datasources/repositories/postgres/ai`-ийн ILIKE хайлт нэг query —
  сан томрох үед tsvector эсвэл pgvector-оор солино.
- **Model-ууд** — чат/STT/орчуулга `GEMINI_MODEL`, TTS `GEMINI_TTS_MODEL`
  (audio гаргадаг тусдаа model) хэрэглэнэ; хоёулаа зөвхөн env тохиргоо.

## API баримтжуулалт (API Documentation)

### Spec хэрхэн үүсдэг вэ

Go хувилбар нь spec-ээ handler бүр дээрх **godoc annotation**-аас үүсгэдэг байв.
Энэ хэвлэлд annotation уншигч БАЙХГҮЙ: OpenAPI баримтыг
`src/cmd/openapi/document.ts` дотор **ИЛ** бичиж, `src/cmd/openapi/main.ts`
гаргана.

Энэ солилцоо нь зориудынх. Handler өөрчлөгдөхөд annotation чимээгүй хазайдаг;
ил бичсэн баримт дээр **CI-ийн drift шалгалт** нэмэгдэхэд spec нь хянагддаг
бүтээгдэхүүн болно — гэрээний өөрчлөлт diff дээр харагдана.

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

Handler-ууд метод бүрийнхээ дээр нэг мөрийн гэрээний тайлбар агуулсаар байна
(`/** POST /auth/eid/start · 200 · 422 */`) тул route, method, статус кодууд
кодтойгоо нэг дор харагдана.

### Дахин үүсгэх (Regenerate)

```bash
npm run openapi              # backend/docs/openapi.json бичнэ
npm run openapi -- --check   # CI-ийн ажиллуулдаг — drift дээр унана
```

Swagger UI: `http://localhost:8080/swagger/` (production-д `OBSERVABILITY_TOKEN`-оор
хамгаалагдана — 401 биш **404** буцаадаг тул оршин байгаа нь ч нууцлагдана).

> ⚠️ **Route бүр spec-д байх ёстой.** Route нэмэх эсвэл DTO өөрчлөх →
> `document.ts`-ийг шинэчлэх → `npm run openapi` ажиллуулах →
> `backend/docs/openapi.json`-ыг commit хийх. Эс бөгөөс CI унана.

## Алдаа засах (Troubleshooting)

**Өгөгдлийн сангийн холболт амжилтгүй**
```bash
docker compose ps                 # Postgres асаалттай юу?
# backend/.env доторх DB_POSTGRE_URL / DB_POSTGRE_DSN-ийг шалга
```

**Ажиллах үед `ERR_MODULE_NOT_FOUND`, гэтэл `tsc` дуугүй байсан** — бараг
гарцаагүй харьцангуй import дээр `.js` өргөтгөлийг орхисон байна.
`npm run smoke:esm` үүнийг тогтмол давтана.

**Migration амжилтгүй** — `migrations/`-ийн эрэмбэ болон `schema_migrations`
хүснэгтийг шалга; runner нь advisory lock + файл тус бүрийн транзакц ашиглана.
Хоёр `17_` файлыг санаарай ([Migration-ууд](#migration-ууд)-ыг үз).

**Кодын өөрчлөлтийн дараа бүх зүйл 401 буцааж байна** — route модуль дотор
`router.use(middleware)` нэмсэн эсэхээ шалга. Express-д тэр нь дараагийн БҮХ
хүсэлт рүү гоожино; оронд нь middleware-ийг **route тус бүрд** дамжуул.

**Тест унаж байна**
```bash
npm test -- --reporter=verbose
npm test -- product              # зөвхөн "product"-той таарах файлууд
npm test -- -t "creates a product"   # зөвхөн нэрээр таарах тестүүд
```

**Lint / формат алдаа**
```bash
npm run fmt                       # prettier --write
npm run lint -- --fix
```

**CI нь OpenAPI drift дээр унаж байна** — `npm run openapi` ажиллуулж
`backend/docs/openapi.json`-ыг commit хий.

## Аюулгүй байдлын шалгах жагсаалт (Security Checklist)

Deploy хийхээс өмнө дараахыг хангасан эсэхийг шалга:

- [ ] Хамгаалагдсан endpoint бүр auth middleware-тэй — `use()`-ээр биш, **route тус бүрд дамжуулсан**
- [ ] Нэргүй endpoint-ууд (`/auth/*`) rate limiter + биеийн хязгаараа хадгалсан
- [ ] `JWT_SECRET` нь ≥ 32 санамсаргүй тэмдэгт бөгөөд жишээний утга БИШ
- [ ] Хүсэлтийн DTO бүр zod `strictObject` (танихгүй талбар татгалзагдана)
- [ ] Хэрэглэгч тус бүрийн шинэ хүснэгтүүд RLS policy-тэй **БА** repository нь `withRLS` ашигладаг
- [ ] API нь **superuser БИШ** DB role-оор холбогддог (production-д boot guard мөрдүүлнэ)
- [ ] `INTEGRATION_ENC_KEY` тохируулагдсан (production үүнгүйгээр асахаас татгалзана)
- [ ] Нууцууд орчноос ирдэг, commit хийгддэггүй
- [ ] Production-д `ALLOWED_ORIGINS` тохируулагдсан (wildcard-гүй)
- [ ] HTTPS нь edge / load balancer дээр мөрдөгддөг

---

**Government Template Platform V3.0** — **Gerege Systems Development Team** болон **Claude AI** хамтран бүтээв, 2026.
