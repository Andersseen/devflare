## Approved Plan:

# Plan de Migración: `apps/frontend` → `apps/devflare`

## Contexto

- **`apps/frontend`**: App Angular estándar (la antigua). Tiene 12+ herramientas, layouts, auth, settings, deploy dashboard, etc. Está **rota en varios puntos** (componentes faltantes, servicios inexistentes, app.config.ts corrupto).
- **`apps/devflare`**: App Angular + AnalogJS (la nueva). Tiene sidebar VOLTUI, dashboard básico, login, 2 tools (image compressor, QR generator), deploy mock, projects vacío. Backend funcional con better-auth + SQLite + db0.

**Objetivo**: Migrar las features de `frontend` a `devflare` poco a poco, usando componentes **VOLTUI** siempre que sea posible, y reemplazando el uso de `@org/ui` en las páginas existentes de `devflare`.

---

## Inventario VOLTUI Disponible

| Categoría    | Componentes                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Form**     | `VoltInput`, `VoltTextarea`, `VoltSelect`, `VoltCheckbox`, `VoltSwitch`, `VoltToggle`, `VoltRadioGroup/Item`, `VoltSlider`, `VoltFormField`, `VoltLabel`, `VoltHint`, `VoltError`  |
| **Layout**   | `VoltCard` (+ header/title/description/content/footer), `VoltSidebar` (+ header/content/group/item/footer/service), `VoltNavSidebar`, `VoltSeparator`, `VoltAccordion`, `VoltTabs` |
| **Feedback** | `VoltBadge`, `VoltProgress`, `VoltTooltip`, `VoltAvatar`                                                                                                                           |
| **Overlay**  | `VoltDialog`, `VoltPopover`, `VoltDropdownMenu`                                                                                                                                    |
| **Nav**      | `VoltBreadcrumbs`, `VoltNavigationMenu`                                                                                                                                            |

**NO disponible en VOLTUI**: Tablas de datos, sliders de rango nativos (sí hay `VoltSlider`), drag-drop zones.

---

## Fases de Migración (de más fácil a más complejo)

### 🔧 FASE 0: Fundamentos & Limpieza

**Objetivo**: Dejar `devflare` en un estado sólido antes de añadir features.

| #   | Tarea                                                                                             | Archivos afectados                                                  | Complejidad |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------- |
| 0.1 | Eliminar código muerto: `nx-welcome.ts`, `app.html` viejo, `analog-welcome.component.ts`          | `apps/devflare/src/app/`                                            | ⭐          |
| 0.2 | Unificar iconos: reemplazar SVG inline en sidebar/dashboard por **lucide-angular** (ya instalado) | `sidebar.component.ts`, `(home).page.ts`                            | ⭐          |
| 0.3 | Migrar páginas existentes de `@org/ui` → **VOLTUI**: login, image-compressor, qr-generator        | `login.page.ts`, `image-compressor.page.ts`, `qr-generator.page.ts` | ⭐⭐        |
| 0.4 | Aplicar `authGuard` a rutas protegidas y `guestGuard` a login                                     | `app.routes.ts`                                                     | ⭐          |

---

### 🔐 FASE 1: Auth (Registro)

**Objetivo**: Completar el flujo de auth que frontend sí tenía.

| #   | Tarea                          | Descripción                                                                                                             | Complejidad |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1.1 | Crear página `sign-up.page.ts` | Formulario email/password/name con VOLTUI (`VoltInput`, `VoltButton`, `VoltCard`). Reutilizar `AuthService.register()`. | ⭐⭐        |
| 1.2 | Actualizar sidebar             | Añadir estado de usuario logueado + botón logout en el sidebar/footer                                                   | ⭐⭐        |
| 1.3 | Redirecciones auth             | Login → redirect si ya autenticado. Rutas protegidas → redirect a login si no autenticado.                              | ⭐          |

---

### 🛠️ FASE 2: Tools Puramente Frontend (Fáciles)

**Objetivo**: Migrar tools que no necesitan servicios backend ni librerías especiales. Son 100% lógica cliente.

| #   | Tool                | Ruta                   | Descripción                                                                      | VOLTUI a usar                                           | Complejidad |
| --- | ------------------- | ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------- |
| 2.1 | **SVG Optimizer**   | `/tools/svg-optimizer` | Minificación regex-based de SVG. Tabs Código/Preview. Stats de compresión.       | `VoltTabs`, `VoltTextarea`, `VoltButton`, `VoltBadge`   | ⭐⭐        |
| 2.2 | **SEO Simulator**   | `/tools/seo-simulator` | Preview de meta tags en Google/Twitter/Facebook/Slack. Validación de longitudes. | `VoltTabs`, `VoltInput`, `VoltTextarea`, `VoltCard`     | ⭐⭐        |
| 2.3 | **Data Converter**  | `/tools/converter`     | JSON ↔ CSV con `papaparse` (ya instalado).                                      | `VoltTextarea`, `VoltSelect`, `VoltButton`, `VoltBadge` | ⭐⭐        |
| 2.4 | **Screen Recorder** | `/tools/recorder`      | `getDisplayMedia` + `MediaRecorder`. Preview y descarga WebM.                    | `VoltButton`, `VoltCard`, `VoltBadge`                   | ⭐⭐        |

---

### 🎨 FASE 3: Tools con Librerías Instaladas (Medianas)

**Objetivo**: Aprovechar dependencias que ya están en `package.json` pero no se usan en `devflare`.

| #   | Tool                         | Ruta                      | Librería                                                               | VOLTUI a usar                                                                     | Complejidad |
| --- | ---------------------------- | ------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| 3.1 | **OG Generator**             | `/tools/og-generator`     | `html-to-image` (toPng). Editor WYSIWYG de tarjetas sociales 1200×630. | `VoltInput`, `VoltTextarea`, `VoltSelect`, `VoltButton`, `VoltCard`, `VoltSlider` | ⭐⭐⭐      |
| 3.2 | **Cinematic Palette**        | `/tools/palette`          | `colorthief`. Extrae dominantes + genera composición canvas.           | `VoltButton`, `VoltCard`, `VoltBadge`                                             | ⭐⭐⭐      |
| 3.3 | **Background Remover**       | `/tools/bg-remover`       | `@imgly/background-removal` (WASM). Split view original/resultado.     | `VoltButton`, `VoltCard`, `VoltBadge`, `VoltProgress`                             | ⭐⭐⭐      |
| 3.4 | **Mejorar QR Generator**     | `/tools/qr-generator`     | `qrcode` (ya usado). Añadir modo Wi-Fi (`WIFI:T:...`) y más opciones.  | `VoltRadioGroup`, `VoltInput`, `VoltButton`                                       | ⭐⭐        |
| 3.5 | **Mejorar Image Compressor** | `/tools/image-compressor` | `browser-image-compression` (WebWorkers). Preview comparativo + stats. | `VoltSlider`, `VoltSelect`, `VoltButton`, `VoltCard`, `VoltBadge`                 | ⭐⭐⭐      |

---

### 🏠 FASE 4: Páginas Principales (Complejas)

**Objetivo**: Reemplazar/Mejorar las páginas core de la app.

| #   | Tarea                       | Descripción                                                                                                                        | VOLTUI a usar                                                                 | Complejidad |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------- |
| 4.1 | **Home / Tools Grid**       | Reemplazar el dashboard actual por un grid de 12+ tarjetas de herramientas con iconos, colores y navegación (como tenía frontend). | `VoltCard`, `VoltBadge`                                                       | ⭐⭐⭐      |
| 4.2 | **URL Shortener**           | Acortador con alias. Historial en localStorage. Generar QR del enlace acortado.                                                    | `VoltInput`, `VoltButton`, `VoltCard`, `VoltBadge`                            | ⭐⭐⭐      |
| 4.3 | **Settings / Perfil**       | Página de settings con tabs (Perfil, Integraciones, Apariencia).                                                                   | `VoltTabs`, `VoltInput`, `VoltAvatar`, `VoltSwitch`, `VoltButton`, `VoltCard` | ⭐⭐⭐      |
| 4.4 | **Projects** (datos reales) | Conectar la página projects vacía a la DB via API. Listar, crear, eliminar proyectos.                                              | `VoltCard`, `VoltButton`, `VoltBadge`, `VoltDialog`                           | ⭐⭐⭐⭐    |

---

### 🚀 FASE 5: Backend & Features Avanzadas

**Objetivo**: Conectar todo con datos reales del servidor.

| #   | Tarea                          | Descripción                                                                   | Complejidad |
| --- | ------------------------------ | ----------------------------------------------------------------------------- | ----------- |
| 5.1 | **API CRUD Projects**          | Endpoints Nitro: `GET/POST/DELETE /api/v1/projects`                           | ⭐⭐⭐      |
| 5.2 | **API CRUD Deployments**       | Endpoints Nitro: `GET/POST /api/v1/deployments`                               | ⭐⭐⭐      |
| 5.3 | **Dashboard con datos reales** | Stats cards conectados a la DB (count projects, deployments, tools used)      | ⭐⭐⭐      |
| 5.4 | **Deploy Dashboard**           | Página `/deploy/dashboard` con lista real de deployments desde la DB          | ⭐⭐⭐⭐    |
| 5.5 | **URL Shortener backend**      | API para acortar URLs persistentes en SQLite                                  | ⭐⭐⭐⭐    |
| 5.6 | **Cloud Storage Explorer**     | Navegador de archivos (necesita servicio de storage — puede ser mock primero) | ⭐⭐⭐⭐⭐  |

---

## Principios de Migración

1. **VOLTUI primero**: Cada nueva página/tool debe usar VOLTUI. Las páginas existentes de `devflare` que usan `@org/ui` se migrarán a VOLTUI en la FASE 0.
2. **AnalogJS file-based routing**: Las nuevas páginas se crean como `.page.ts` en `src/app/pages/` y se añaden a `app.routes.ts` con `loadComponent`.
3. **Standalone components**: Todos los componentes son `standalone: true` (o sin decorator en AnalogJS).
4. **Signals over RxJS**: Preferir signals de Angular. Solo usar RxJS donde `frontend` ya lo usaba y sea necesario.
5. **lucide-angular para iconos**: No más SVG inline. Usar `lucide-angular` con `<lucide-icon name="xxx">`.
6. **Un archivo por página**: Cada tool es un archivo `.page.ts` autónomo (template inline) para mantener simplicidad.
7. **Backend solo cuando sea necesario**: Las tools puramente cliente no necesitan API. Los datos persistentes (projects, deployments, URLs) sí.

---

## Orden Recomendado de Implementación (sesión a sesión)

| Sesión | Fase | Qué hacemos                                           |
| ------ | ---- | ----------------------------------------------------- |
| 1      | 0    | Limpieza + unificar iconos + migrar login a VOLTUI    |
| 2      | 0-1  | Migrar QR e Image Compressor a VOLTUI + crear sign-up |
| 3      | 2    | SVG Optimizer + SEO Simulator                         |
| 4      | 2    | Data Converter + Screen Recorder                      |
| 5      | 3    | OG Generator + Cinematic Palette                      |
| 6      | 3    | Background Remover + mejorar QR (WiFi)                |
| 7      | 3-4  | Mejorar Image Compressor + Home/Tools Grid            |
| 8      | 4    | URL Shortener (localStorage) + Settings               |
| 9      | 4-5  | Projects con datos reales + API CRUD                  |
| 10     | 5    | Deploy Dashboard + Backend URL Shortener              |

---

## Notas sobre `apps/frontend`

`frontend` tiene **problemas críticos** que hacen que no compile actualmente:

- `app.config.ts` está roto (falta clase en `ErrorHandler`)
- Faltan componentes de layout (`SidebarComponent`, `DrawerComponent`, etc.)
- Faltan servicios (`ImageProcessingService`, `StorageService`, etc.)
- Faltan interceptores

**Por eso la estrategia es "reescribir/adaptar en devflare" en lugar de "copiar tal cual"**. Tomamos la lógica y el diseño de `frontend` pero lo reimplementamos con:

- VOLTUI como sistema de componentes
- AnalogJS como framework
- El backend de `devflare` (better-auth + SQLite)
