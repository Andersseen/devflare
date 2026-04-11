# 🚀 Plan de Desarrollo DevFlare

> Fecha: 2026-04-11
> Estado: Base consolidada ✅

---

## ✅ Completado: Limpieza de Base

### Eliminado
- ❌ `apps/api/` - API Express no usada
- ❌ `apps/shop/` - E-commerce boilerplate
- ❌ `apps/shop-e2e/` - Tests E2E de shop
- ❌ `apps/shorter-url/` - App vacía
- ❌ `libs/api/products/` - Librería API
- ❌ `libs/shop/*` - 4 librerías de shop
- ❌ `libs/shared/models/` - Models no usados

### Limpiado
- 🧹 `package.json` - ~20 dependencias no usadas
- 🧹 `nx.json` - Plugins de Docker, Playwright, esbuild
- 🧹 `tsconfig.base.json` - Paths obsoletos reducidos de 10 a 2
- 🧹 `eslint.config.mjs` - Tags de module boundaries simplificados
- 🧹 Tags en project.json para NX module boundaries

### Resultado
- Build exitoso: `pnpm nx build frontend` ✅
- Tamaño reducido: ~500KB de código eliminado
- Deuda técnica: Reducida drásticamente

---

## 📋 Fases de Desarrollo

### FASE 1: Configuración de Desarrollo Local (1-2 días)

**Objetivo:** WebContainers funcionando en desarrollo local

| Tarea | Prioridad | Descripción |
|-------|-----------|-------------|
| 🟡 COOP/COEP Headers | Alta | Configurar Vite para servir con headers Cross-Origin |
| 🟡 HTTPS Local | Alta | WebContainers requieren HTTPS en desarrollo |
| 🟡 Dev Script | Media | Script `pnpm dev` que inicie todo correctamente |

**Implementación sugerida:**
```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
```

---

### FASE 2: Autenticación (2-3 días)

**Objetivo:** Sistema de auth funcional (login/registro)

| Tarea | Prioridad | Tecnología |
|-------|-----------|------------|
| 🔴 Auth Service | Alta | Implementar con Cloudflare D1 + Workers |
| 🔴 Guards | Alta | `authGuard`, `publicGuard` ya existen, conectarlos |
| 🟡 JWT Storage | Media | LocalStorage/IndexedDB |
| 🟡 Logout/Refresh | Media | Manejo de sesión |

**Opciones de Backend:**
- **A) Cloudflare Workers + D1** (Recomendado) - Serverless, free tier generoso
- **B) Supabase Auth** - Rápido de implementar, pero dependencia externa
- **C) Clerk** - Muy bueno pero costoso para uso personal

**Recomendación:** Cloudflare Workers + D1 (ya estás en el ecosistema)

---

### FASE 3: Sistema de Deploy con Cloudflare (3-5 días)

**Objetivo:** Pipeline de deploy real: Git → Build → Cloudflare Pages

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Git Repo   │───▶│  WebContainer│───▶│    Build    │───▶│   Upload    │
│  (GitHub)   │    │   (Browser)  │    │   (npm)     │    │   (R2)      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                             │
                                                             ▼
┌─────────────┐    ┌─────────────┐                      ┌─────────────┐
│   Deploy    │◀───│  Cloudflare │◀─────────────────────│  Worker/API │
│   (Pages)   │    │   Workers   │                      │  (Metadata) │
└─────────────┘    └─────────────┘                      └─────────────┘
```

| Tarea | Prioridad | Descripción |
|-------|-----------|-------------|
| 🔴 Git Integration | Alta | Clonar repos desde GitHub (API o zip download) |
| 🔴 Build Pipeline | Alta | Ejecutar builds en WebContainers |
| 🔴 R2 Storage | Alta | Subir assets estáticos a Cloudflare R2 |
| 🟡 Cloudflare Pages | Alta | Crear proyectos y deploys via API |
| 🟡 KV Metadata | Media | Guardar info de deploys (D1 o KV) |
| 🟡 Preview URLs | Media | URLs de preview para cada deploy |

**Estructura de datos sugerida (D1):**
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  repo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('building', 'success', 'failed')),
  commit_sha TEXT,
  preview_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### FASE 4: Dashboard de Deployments (2-3 días)

**Objetivo:** UI para gestionar proyectos y ver deploys

| Tarea | Prioridad | Descripción |
|-------|-----------|-------------|
| 🟡 Lista de Proyectos | Media | Tabla con proyectos del usuario |
| 🟡 Detalle de Proyecto | Media | Ver deploys históricos |
| 🟡 Logs de Build | Media | Stream de logs en tiempo real |
| 🟢 Analytics | Baja | Stats de visits (Cloudflare Analytics API) |

---

### FASE 5: Mejorar Tools Existentes (Ongoing)

| Tool | Estado | Mejoras Sugeridas |
|------|--------|-------------------|
| Image Compressor | ✅ Funciona | Batch processing, más formatos |
| OG Generator | ✅ Funciona | Templates predefinidos |
| QR Generator | ✅ Funciona | Custom colors, logos |
| URL Shortener | ⚠️ Básico | Integrar con KV real |
| BG Remover | ✅ Funciona | Optimizar modelo (pesa mucho) |
| SEO Simulator | ✅ Funciona | Conectar con API real |
| Screen Recorder | ✅ Funciona | WebM/MP4 export |
| Data Converter | ✅ Funciona | Más formatos (YAML, XML) |
| SVG Optimizer | ✅ Funciona | Integrar SVGO |
| Palette Generator | ✅ Funciona | Exportar a CSS/Sass |

---

### FASE 6: Infraestructura Cloudflare (2-3 días)

**Worker API para DevFlare:**
```
libs/
└── cloudflare/
    ├── src/
    │   ├── index.ts           # Worker entry
    │   ├── routes/
    │   │   ├── auth.ts        # Auth endpoints
    │   │   ├── projects.ts    # CRUD proyectos
    │   │   └── deploy.ts      # Deployments
    │   └── db/
    │       └── schema.ts      # D1 schema
    └── wrangler.toml
```

**Endpoints necesarios:**
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/projects` (list)
- `POST /api/projects` (create)
- `GET /api/projects/:id/deployments`
- `POST /api/deploy` (trigger)
- `GET /api/deploy/:id/logs` (stream)

---

## 🎯 Próximos Pasos Inmediatos

1. **Configurar HTTPS + COOP/COEP** para WebContainers local
2. **Crear Worker básico** en Cloudflare (auth simple)
3. **Integrar autenticación** en frontend
4. **Implementar flujo de deploy** (Git → WebContainer → R2)

---

## 📁 Estructura Final Sugerida

```
devflare/
├── apps/
│   └── frontend/              # Tu app Angular (DevFlare)
│       ├── src/
│       │   ├── app/
│       │   │   ├── features/
│       │   │   │   ├── auth/
│       │   │   │   ├── deploy/
│       │   │   │   ├── tools/
│       │   │   │   └── storage/
│       │   │   └── layout/
│       │   └── environments/
│       └── project.json
├── libs/
│   ├── core/                  # Servicios compartidos
│   │   ├── auth.service.ts
│   │   ├── webcontainer.service.ts
│   │   └── storage.service.ts
│   └── ui/                    # Componentes UI
└── workers/                   # Cloudflare Workers (nuevo)
    └── devflare-api/
        ├── src/
        │   ├── index.ts
        │   └── routes/
        └── wrangler.toml
```

---

## 💡 Consideraciones Técnicas

### WebContainers Limitaciones
- ❌ No funciona en Safari
- ❌ Requiere COOP/COEP
- ❌ Consumo de memoria alto
- ✅ Sin servidor backend para builds

### Alternativa: Build Serverless
Si WebContainers da problemas, considera:
- **GitHub Actions** + webhook a tu API
- **Cloudflare Workers** con wasm para builds simples
- **esbuild-wasm** en browser para proyectos pequeños

### Costos Cloudflare (Estimado)
| Servicio | Free Tier | Tu Uso Estimado |
|----------|-----------|-----------------|
| Workers | 100k req/día | Suficiente |
| R2 | 10GB/mes | ~1-2GB |
| Pages | Ilimitado | Ilimitado |
| D1 | 500k rows | Suficiente |
| KV | 100k ops/día | Suficiente |

**Conclusión:** Free tier de Cloudflare es suficiente para uso personal.

---

## 🏁 Estado Actual

- ✅ Código base limpio
- ✅ Build funcionando
- ✅ 10+ herramientas implementadas
- ⏭️ Siguiente: Auth + Deploy real
