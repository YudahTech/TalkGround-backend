# How to document endpoints in Swagger (NestJS)

**Swagger UI:** `http://localhost:3001/docs`  
**OpenAPI JSON:** `http://localhost:3001/docs/openapi.json`

NestJS builds Swagger from your **controllers**. If a route exists in Nest but looks “missing” in Swagger, it is usually:

1. Under a tag you did not expand (scroll the left/sidebar list)
2. Named differently than you expect (`/users/me` not `/user/me`)
3. Missing `@ApiTags` / `@ApiOperation` (still listed, but hard to find)

---

## Find Users endpoints right now

1. Hard-refresh Swagger: `Ctrl+Shift+R` on `http://localhost:3001/docs`
2. Look for tag: **`Users — Me (JWT)`**
3. You should see:
   - `GET /api/v1/users/me`
   - `PATCH /api/v1/users/me`
   - `GET /api/v1/users/me/dashboard`
   - `GET /api/v1/users/me/reviews`
4. Tag **`Users — Public`**: `GET /api/v1/users/{username}`

**Before calling Me routes:**

1. `POST /api/v1/auth/login`
2. Copy `accessToken`
3. Click **Authorize** → paste token → Authorize
4. Then Execute `GET /users/me`

---

## Checklist: add a new endpoint to Swagger

Whenever you add a route, add these decorators:

### 1. Tag the controller or method

```typescript
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';

@ApiTags('My Feature')          // groups endpoints in Swagger UI
@Controller('my-feature')
export class MyFeatureController {
```

### 2. Describe each route

```typescript
  @ApiOperation({
    summary: 'GET /my-feature — short title shown in Swagger',
    description: 'Longer help text for frontend / QA.',
  })
  @Get()
  findAll() { ... }
```

### 3. If JWT is required

```typescript
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: '...' })
  @Get('private')
  privateThing(@CurrentUser() user: { id: string }) { ... }
```

`SWAGGER_BEARER_AUTH` must match the name in `main.ts` → `addBearerAuth(..., SWAGGER_BEARER_AUTH)`.

### 4. If the route is public

Keep `@Public()` for Nest guards. Swagger does not need a special decorator for public, but say so in the summary:

```typescript
  @Public()
  @ApiOperation({ summary: 'GET /home — public, no JWT' })
  @Get('home')
```

### 5. Document params / body (optional but useful)

```typescript
  @ApiParam({ name: 'slug', example: 'nexxas-kitchen' })
  @Get(':slug')
  findOne(@Param('slug') slug: string) { ... }
```

DTOs with `class-validator` (`@IsString()`, etc.) already show up as request body schemas when the parameter is typed as a DTO class.

### 6. Restart / wait for watch mode

`npm run start:dev` recompiles. Then **hard-refresh** the browser on `/docs`.

---

## Where Swagger is configured

| File | Role |
|------|------|
| `src/main.ts` | `DocumentBuilder` + `SwaggerModule.setup('docs', ...)` |
| `src/common/swagger.ts` | Bearer auth scheme name constant |
| `*.controller.ts` | `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth` |

You do **not** manually list every path in `main.ts`. Controllers are scanned automatically.

---

## Common mistakes

| Mistake | Result |
|---------|--------|
| Looking for `/user/me` | Real path is `/users/me` (plural) |
| Not expanding the tag | Endpoints hidden in collapsed section |
| Forgetting Authorize | 401 on Me / Admin routes |
| Putting `@Get(':id')` before `@Get('me')` | Nest may treat `"me"` as an id — **static routes before params** |
| No hard refresh after code change | Old Swagger cache |

---

## Verify OpenAPI includes your route

```powershell
(Invoke-WebRequest http://localhost:3001/docs/openapi.json).Content |
  Select-String "users/me"
```

Or open `http://localhost:3001/docs/openapi.json` and search for `users/me`.

---

## Minimal template for a new controller

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';
import { CurrentUser } from '../common/current-user.decorator';

@ApiTags('Example')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller('example')
export class ExampleController {
  @ApiOperation({ summary: 'GET /example — needs JWT' })
  @Get()
  list(@CurrentUser() user: { id: string }) {
    return { data: { userId: user.id } };
  }
}
```

Register the controller in its module → import module in `AppModule` → it appears in Swagger.
