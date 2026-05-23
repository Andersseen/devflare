# Plan: `apps/dev-auth` — Microservicio de Autenticación

## Contexto

**DevFlare actual** tiene better-auth embebido dentro de `apps/devflare` con SQLite local (`better-sqlite3`). Esto impide:
- Self-hosting fácil por usuarios (necesitan Node + SQLite)
- Portabilidad a edge/serverless (Cloudflare Workers)
- Reutilización de auth por otras apps

**Objetivo**: Crear `apps/dev-auth` — un microservicio de auth independiente, agnóstico, deployable en Cloudflare Workers + D1 (free tier). Las apps cliente (DevFlare y futuras) se conectan a él vía HTTP.

**Stack propuesto**:
- **Backend**: Hono + better-auth + D1 adapter
- **UI**: HTML/TSX con `@andersseen/web-components` (Stencil) vía CDN
- **Deploy**: Cloudflare Workers
- **Monorepo**: Nx 22 (consistente con el resto del proyecto)

---

## Inventario de Web Components Disponibles

| Package | Qué aporta |
|---------|-----------|
| `@andersseen/web-components` | 24+ componentes UI: `and-button`, `and-input`, `and-card`, `and-alert`, `and-modal`, `and-icon`, etc. |
| `@andersseen/icon` | 70+ iconos SVG tree-shakeables |
| `@andersseen/layout` | Layout attribute-driven (`and-layout`, `and-text`) sin clases CSS |
| `@andersseen/motion` | Animaciones declarativas vía atributos (`and-motion`) |

**Componentes clave para el auth service**:
- `and-button` — 6 variants, loading state
- `and-input` — Form inputs con validación nativa
- `and-card` — Contenedor de contenido
- `and-alert` — Mensajes de error/éxito
- `and-icon` — Iconos en botones y estados
- `and-layout` + `and-text` — Estructura de página sin Tailwind

**Uso en Hono/TSX**: Los componentes se cargan vía CDN (`unpkg` o `jsdelivr`) como `<script type="module">` en el `<head>` del HTML renderizado por Hono. Se usan como etiquetas HTML nativas.

---

## Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Hono App                                               │   │
│  │  ├── /api/auth/*  → better-auth handler (D1 adapter)   │   │
│  │  ├── /login       → página login (and-card + and-input)│   │
│  │  ├── /signup      → página signup                      │   │
│  │  ├── /forgot      → recuperar password                 │   │
│  │  └── /setup       → wizard Cloudflare Setup            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                    ┌──────┴──────┐                              │
│                    ▼             ▼                              │
│              ┌─────────┐   ┌─────────┐                         │
│              │ Cloudflare D1 │   │ Web Components│                         │
│              │ (users,       │   │ (CDN unpkg)   │                         │
│              │  sessions)    │   │               │                         │
│              └─────────┘   └─────────┘                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP + cookies
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  apps/devflare (u otras apps)                                   │
│  ├── libs/shared/auth (cliente better-auth apuntando a dev-auth)│
│  ├── Sin backend de auth propio                                 │
│  └── Cookies de sesión compartidas (mismo dominio o subdominio) │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fases de Implementación

### 🔧 FASE 0: Scaffold del Proyecto

**Objetivo**: Crear la estructura base de `apps/dev-auth` en el monorepo Nx.

| # | Tarea | Archivos afectados | Complejidad |
|---|-------|-------------------|-------------|
| 0.1 | Crear directorio `apps/dev-auth/` con estructura Nx | `apps/dev-auth/project.json`, `package.json` | ⭐ |
| 0.2 | Instalar dependencias: `hono`, `@hono/node-server`, `better-auth`, `@better-auth/d1` o adapter D1, `wrangler` | `package.json` (root) | ⭐ |
| 0.3 | Configurar `wrangler.toml` para Cloudflare Worker + D1 local | `apps/dev-auth/wrangler.toml` | ⭐⭐ |
| 0.4 | Configurar TypeScript (`tsconfig.app.json`, `tsconfig.json`) | `apps/dev-auth/tsconfig.json` | ⭐ |
| 0.5 | Configurar Nx project con targets: `serve` (wrangler dev), `deploy` (wrangler deploy), `lint`, `typecheck` | `apps/dev-auth/project.json` | ⭐⭐ |
| 0.6 | Crear entry point `src/index.ts` con Hono básico + health check | `apps/dev-auth/src/index.ts` | ⭐ |
| 0.7 | Verificar que `wrangler dev` levanta sin errores | — | ⭐ |

**Entregable**: `apps/dev-auth` compila y corre localmente con `nx serve dev-auth` o `wrangler dev`.

---

### 🔐 FASE 1: Backend Core — Hono + better-auth + D1

**Objetivo**: Implementar el backend de autenticación funcional con better-auth usando Cloudflare D1.

| # | Tarea | Descripción | Complejidad |
|---|-------|-------------|-------------|
| 1.1 | Crear `src/auth.config.ts` | Configurar better-auth con D1 adapter. Sin secret hardcodeado (usa env vars). | ⭐⭐ |
| 1.2 | Crear `src/db/schema.sql` | Schema D1 para better-auth (users, sessions, accounts, verifications). Better-auth puede auto-generar tablas. | ⭐ |
| 1.3 | Crear `src/routes/auth.ts` | Mount better-auth handler en `/api/auth/*` con Hono. | ⭐⭐ |
| 1.4 | Configurar CORS | Permitir requests desde orígenes configurables (para apps cliente). | ⭐⭐ |
| 1.5 | Crear middleware de sesión | Helper para validar sesiones en rutas protegidas (ej: `/setup`). | ⭐⭐ |
| 1.6 | Probar endpoints | Sign-up, sign-in, get-session, sign-out vía curl/Postman. | ⭐ |

**Notas técnicas**:
- Better-auth con D1 usa el adapter oficial de better-auth para D1 (basado en `drizzle-orm/d1` o el adapter nativo de better-auth si existe)
- El secreto debe venir de `wrangler secret put BETTER_AUTH_SECRET`
- `baseURL` debe ser configurable vía env var

**Entregable**: API de auth funcional localmente. Se puede registrar un usuario y obtener sesión.

---

### 🎨 FASE 2: UI de Auth con Web Components

**Objetivo**: Crear las páginas visuales de login, signup y forgot-password usando `@andersseen/web-components` vía CDN.

| # | Tarea | Descripción | Complejidad |
|---|-------|-------------|-------------|
| 2.1 | Crear `src/pages/layout.ts` | Layout base HTML con: CDN de web-components, CDN de layout/motion CSS, tema por defecto (dark o light). | ⭐ |
| 2.2 | Crear `src/pages/login.ts` | Página login con `and-card`, `and-input` (email, password), `and-button` (submit), `and-alert` (errores). Form POST a `/api/auth/sign-in/email`. | ⭐⭐ |
| 2.3 | Crear `src/pages/signup.ts` | Página signup con name, email, password, confirm password. Validación básica client-side. POST a `/api/auth/sign-up/email`. | ⭐⭐ |
| 2.4 | Crear `src/pages/forgot.ts` | Página de recuperación de password (placeholder si better-auth no tiene forgot password aún, o integrarlo). | ⭐⭐ |
| 2.5 | Añadir `and-icon` a botones y estados | Iconos en botones de submit, estados de error, etc. | ⭐ |
| 2.6 | Añadir animaciones `and-motion` | Animaciones de entrada en las tarjetas (`fade-in`, `slide-in-up`). | ⭐ |
| 2.7 | Theming consistente | Usar el mismo sistema de design tokens que DevFlare (colores HSL) vía CSS custom properties. | ⭐⭐ |

**Estructura de página login**:
```html
<and-layout center vertical gap:lg>
  <and-card padding:lg shadow:xl>
    <and-text h1 align:center>Sign In</and-text>
    <form action="/api/auth/sign-in/email" method="post">
      <and-input name="email" type="email" label="Email" required />
      <and-input name="password" type="password" label="Password" required />
      <and-button type="submit" variant="primary" full>Sign In</and-button>
    </form>
    <and-text small>Don't have an account? <a href="/signup">Sign Up</a></and-text>
  </and-card>
</and-layout>
```

**Entregable**: Páginas de login/signup visualmente pulidas y funcionales. El usuario puede registrarse y loguearse por navegador.

---

### ☁️ FASE 3: Wizard de Cloudflare Setup

**Objetivo**: Página `/setup` que guía al usuario para configurar su propia instancia de auth en Cloudflare.

| # | Tarea | Descripción | Complejidad |
|---|-------|-------------|-------------|
| 3.1 | Diseñar el wizard (pasos) | Paso 1: Crear cuenta Cloudflare. Paso 2: Crear D1 database. Paso 3: Obtener API token. Paso 4: Deploy. | ⭐ |
| 3.2 | Crear `src/pages/setup.ts` | UI del wizard con `and-card`, `and-input`, `and-button`, progreso visual. | ⭐⭐ |
| 3.3 | Integrar Cloudflare API (client-side o serverless) | Opción A: Form que envía API token al backend y este usa Cloudflare API. Opción B: Todo client-side con fetch a api.cloudflare.com. | ⭐⭐⭐ |
| 3.4 | Auto-crear D1 database | Usar Cloudflare API para crear D1 database automáticamente. | ⭐⭐⭐ |
| 3.5 | Generar `wrangler.toml` dinámico | Generar y descargar el archivo de config con el D1 database_id ya vinculado. | ⭐⭐ |
| 3.6 | Instrucciones de deploy | Mostrar comandos `wrangler deploy` o botón que dispare deploy vía API. | ⭐⭐ |

**Nota**: El wizard puede ser "semi-automático" al principio: guía visual + copy-paste de comandos, sin necesidad de automatizar 100% la API de Cloudflare.

**Entregable**: Página `/setup` funcional que un usuario nuevo puede seguir para tener su propio auth service en Cloudflare.

---

### 🔌 FASE 4: Integración con DevFlare

**Objetivo**: DevFlare deja de tener auth embebido y consume `apps/dev-auth` como servicio externo.

| # | Tarea | Descripción | Complejidad |
|---|-------|-------------|-------------|
| 4.1 | Refactorizar `libs/shared/auth/src/lib/client/auth-client.ts` | Cambiar `baseURL` para apuntar a `dev-auth` (configurable vía env var). | ⭐⭐ |
| 4.2 | Eliminar backend auth de `apps/devflare` | Borrar `apps/devflare/src/server/auth.ts`, `routes/api/auth/[...].ts`. | ⭐ |
| 4.3 | Actualizar `Auth` service | Asegurar que `Auth` funciona con el cliente remoto (cookies cross-domain si aplica). | ⭐⭐ |
| 4.4 | Configurar CORS/cookies en `dev-auth` | Permitir cookies desde el dominio de DevFlare. Si son mismo dominio/subdominio, es trivial. | ⭐⭐ |
| 4.5 | Actualizar API de proyectos | Los endpoints de projects deben validar sesión contra `dev-auth` en lugar de auth local. | ⭐⭐⭐ |
| 4.6 | Añadir variable de entorno `DEV_AUTH_URL` | En DevFlare, configurar la URL del servicio de auth. | ⭐ |
| 4.7 | Probar flujo end-to-end | Registro en dev-auth → login desde DevFlare → acceso a projects protegidos. | ⭐⭐⭐ |

**Nota técnica crítica**: Better-auth usa cookies para sesiones. Para que funcione cross-app:
- **Opción A (recomendada)**: Ambos en subdominios del mismo dominio (`auth.tudominio.com` y `app.tudominio.com`) con cookie `Domain=.tudominio.com`.
- **Opción B**: Mismo dominio con path (`tudominio.com/auth/*` y `tudominio.com/app/*`).
- **Opción C**: Auth service sirve las páginas de login en iframe o redirect (OAuth-like flow).

Para empezar, la Opción A es la más simple y better-auth la soporta nativamente.

**Entregable**: DevFlare funciona con auth externo. El usuario puede desplegar `dev-auth` y `devflare` independientemente.

---

### 🚀 FASE 5: Polish, Testing y Documentación

**Objetivo**: Dejar el servicio listo para producción y self-hosting.

| # | Tarea | Descripción | Complejidad |
|---|-------|-------------|-------------|
| 5.1 | Rate limiting en auth endpoints | Proteger sign-in/sign-up contra brute force (Cloudflare tiene esto nativo, o implementar en Hono). | ⭐⭐ |
| 5.2 | Validación de inputs robusta | Validar email, password strength, etc. antes de llegar a better-auth. | ⭐ |
| 5.3 | Página de error 404 | Página not-found con Web Components. | ⭐ |
| 5.4 | Tests unitarios (Vitest) | Tests para helpers, validaciones, middleware. | ⭐⭐⭐ |
| 5.5 | Tests E2E (Playwright) | Flujo completo: registro → login → logout. | ⭐⭐⭐ |
| 5.6 | README de `apps/dev-auth` | Cómo instalar, configurar env vars, deployar, integrar con otras apps. | ⭐ |
| 5.7 | Documentación del setup Cloudflare | Guía paso a paso para usuarios no técnicos. | ⭐ |
| 5.8 | Eliminar `apps/frontend` (finalmente) | La app legacy ya no es necesaria. | ⭐ |

**Entregable**: `apps/dev-auth` es un producto usable: documentado, testeado, y fácil de deployar.

---

## Dependencias a Instalar

```bash
# Backend
pnpm add -w hono better-auth

# D1 adapter para better-auth (verificar nombre exacto del package)
# better-auth tiene soporte D1 nativo vía drizzle-orm/d1 o un adapter oficial

# Dev/Deploy
pnpm add -D -w wrangler @cloudflare/workers-types

# Web Components (runtime, via CDN, no necesita npm install)
# Opcionalmente para tipos si se usan en TSX:
# pnpm add -D -w @andersseen/web-components
```

**Nota**: `@andersseen/web-components` se carga vía CDN (`unpkg.com`), por lo que no es necesario instalarlo en `package.json` a menos que quieras tipos para desarrollo.

---

## Orden Recomendado de Implementación (sesión a sesión)

| Sesión | Fase | Qué hacemos |
|--------|------|-------------|
| 1 | 0 | Scaffold completo: directorios, config, wrangler, health check |
| 2 | 1 | Better-auth + D1: config, adapter, API routes, test con curl |
| 3 | 2 | UI Login: layout base, página login, theming, animaciones |
| 4 | 2 | UI Signup + Forgot: páginas restantes, validación, iconos |
| 5 | 3 | Cloudflare Setup: wizard UI, generación de wrangler.toml |
| 6 | 4 | Integración DevFlare: refactor cliente, eliminar auth local, probar E2E |
| 7 | 5 | Polish: rate limiting, tests, README, eliminar frontend legacy |

---

## Decisiones Técnicas Clave

### 1. ¿D1 o SQLite local?
**D1** para `dev-auth`. El objetivo es que corra en Cloudflare Workers. Para desarrollo local, Wrangler proporciona un D1 local.

### 2. ¿Cómo se validan sesiones desde DevFlare?
La validación de sesiones en el backend de DevFlare (API de projects) puede hacerse de dos formas:
- **Opción A**: Cada endpoint de DevFlare llama a `dev-auth/api/auth/get-session` para validar el token/cookie.
- **Opción B**: DevFlare usa el mismo `better-auth` como cliente pero sin DB propia, solo para validar el JWT.

Para empezar, **Opción A** es más simple: hacer una petición HTTP interna (o expuesta) al auth service para validar la sesión.

### 3. ¿Web Components vía CDN o bundleado?
**CDN** (`unpkg.com/@andersseen/web-components/...`) para empezar. Es el método más simple y funciona perfectamente con Hono renderizando HTML estático. Si en el futuro necesitas optimizar, puedes bundlearlos.

### 4. ¿Un dominio o dos?
Para el modelo open source, cada usuario self-hosteará su propia instancia. Por lo tanto:
- El usuario despliega `dev-auth` en su Worker (ej: `auth-miusuario.workers.dev`)
- El usuario despliega `devflare` en su Pages/Worker y configura `DEV_AUTH_URL=https://auth-miusuario.workers.dev`

Esto significa que CORS debe ser configurable dinámicamente.

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Better-auth con D1 es experimental | Probar exhaustivamente en Fase 1 antes de seguir. Tener fallback a SQLite local si D1 falla. |
| Cookies cross-domain complicadas | Usar `baseURL` correcto en better-auth. Documentar claramente la configuración de dominios. |
| Web Components no cargan en Worker | CDN externo (unpkg) no depende del Worker. Fallback a script inline si unpkg falla. |
| Cloudflare API rate limits en setup | Hacer el wizard "guidado" primero, automatización opcional después. |
| Migración disruptiva para DevFlare | Mantener auth local como fallback durante la Fase 4, eliminar solo al final. |

---

## Notas sobre `apps/frontend`

`apps/frontend` sigue roto y obsoleto. **No copiar nada de ahí**. El auth service es un proyecto nuevo desde cero. Una vez terminada la Fase 4 de integración, `apps/frontend` puede eliminarse definitivamente (Fase 5.8).
