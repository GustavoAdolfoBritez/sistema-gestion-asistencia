# Análisis e Implementación: Pull-to-Refresh y Cold Start Failure

---

## Problema 1: Pull-to-Refresh (Deslizar para recargar)

### Diagnóstico

El gesto nativo de pull-to-refresh estaba bloqueado por tres capas de CSS defensivo en el layout:

| Ubicación | Clase/Selector | Valor anterior | Problema |
|---|---|---|---|
| `index.css:1005` | `.scroll-region` | `overscroll-contain` | Bloquea overscroll en todos los contenedores de scroll |
| `index.css:1400` | `.app-scroll-content` (mobile, @layer) | `overscroll-behavior-y: contain` | Impide que el estiramiento se propague |
| `index.css:1564` | `.app-scroll-content` (mobile, sin @layer) | `overscroll-behavior-y: contain` | Ídem, con prioridad de cascada superior |
| `index.css:1591` | `html` | `overflow: hidden` | Bloquea scroll del body |
| `index.css:1606` | `#root` | `overflow: hidden` | Bloquea scroll del root |

Además, el hook personalizado `usePullToRefresh` y el componente `PullToRefreshIndicator` ya existían pero requerían integración manual por página con un `ref` al contenedor de scroll correcto.

### Solución aplicada

**1. CSS: liberar overscroll sin romper el layout**

- `index.css:1005` — `.scroll-region`: `overscroll-contain` → `overscroll-auto`
- `index.css:1400` — `.app-scroll-content` mobile: `overscroll-behavior-y: contain` → `auto`
- `index.css:1564` — `.app-scroll-content` mobile (sin @layer): `overscroll-behavior-y: contain` → `auto`

El `overflow: hidden` en `html` y `#root` se mantiene (necesario para el layout de app shell fija). El hook `usePullToRefresh` ya llama `event.preventDefault()` después de 8px de pull, lo que previene doble refresh. Con overscroll liberado, el efecto visual de estiramiento ahora es natural.

**2. Nuevo componente wrapper: `PagePullToRefresh`**

Archivo: `src/components/ui/page-pull-to-refresh.tsx`

```tsx
<PagePullToRefresh onRefresh={() => recargarDatos()}>
  {/* contenido de la página */}
</PagePullToRefresh>
```

Encapsula:
- El `ref` al contenedor de scroll
- La llamada a `usePullToRefresh`
- El `PullToRefreshIndicator`
- Las clases CSS necesarias (`scroll-region app-scroll-content flex-1 min-h-0 min-w-0 overflow-auto`)

Para integrar en una página nueva, solo se necesita este wrapper. Las páginas existentes que ya usan el hook directamente siguen funcionando.

### Archivos modificados/creados

| Archivo | Acción |
|---|---|
| `src/index.css` | Modificado — 3 líneas de overscroll |
| `src/components/ui/page-pull-to-refresh.tsx` | Creado — nuevo wrapper |

---

## Problema 2: Cold Start Failure (Pantalla en blanco al reactivar)

### Diagnóstico

Cuando el navegador suspende la pestaña y la restaura horas después:

1. El motor del navegador ejecuta un "autorefresh" pero React puede quedar en estado inconsistente
2. `localStorage` puede devolver `null`, datos corruptos, o tardar en responder
3. Las lecturas de storage sin `try/catch` lanzan excepciones que matan el renderizado
4. No existía `ErrorBoundary` — cualquier error en un componente hijo tumbaba toda la app dejando pantalla en blanco
5. El `main.tsx` original solo chequeaba `root.children.length` sin timeout de seguridad

### Solución aplicada

**1. Nuevo `ErrorBoundary` global**

Archivo: `src/components/ui/error-boundary.tsx`

- Envuelve toda la app en `App.tsx`
- `getDerivedStateFromError` + `componentDidCatch` capturan cualquier error de renderizado
- Muestra pantalla de recuperación con:
  - Botón "Reintentar" (resetea estado y re-monta hijos)
  - Botón "Ir al inicio" (limpia localStorage corrupto y redirige a `/login`)
- Reporta errores al backend vía `navigator.sendBeacon` a `/api/errores-frontend`

**2. `session-user.ts` reforzado**

- `readStoredUser()`: try/catch + validación de `parsed.id`; si falla, limpia `currentUser` del storage
- `safeGetStorageItem(key)`: wrapper con try/catch que devuelve `null` si falla
- `safeRemoveStorageItem(key)`: wrapper con try/catch

**3. `RequireAuth.tsx` y `App.tsx` con lecturas seguras**

- Todas las llamadas a `localStorage.getItem` reemplazadas por `safeGetStorageItem`
- `readStoredUser()` envuelta en try/catch en cada punto de consumo
- `RootRedirect` ahora maneja storage corrupto sin crashear

**4. `main.tsx` con guardias de montaje**

- Verifica existencia de `#root` antes de `createRoot`; si no existe, muestra HTML inline de error
- Guardián de montaje: `setTimeout(8000)` — si tras 8s el `#root` sigue vacío, limpia storage y recarga
- `visibilitychange`: flag `reloadScheduled` previene múltiples reloads concurrentes
- `pageshow` con `event.persisted`: fuerza `location.reload()` (recuperación de bfcache)

### Archivos modificados/creados

| Archivo | Acción |
|---|---|
| `src/components/ui/error-boundary.tsx` | Creado — nuevo ErrorBoundary |
| `src/utils/session-user.ts` | Modificado — safeGetStorageItem, safeRemoveStorageItem, validación reforzada |
| `src/navigation/RequireAuth.tsx` | Modificado — safeGetStorageItem en lectura de token |
| `src/App.tsx` | Modificado — ErrorBoundary wrapper, safeGetStorageItem en RootRedirect, import |
| `src/main.tsx` | Modificado — guardián de montaje, safeClearStorage, flag reloadScheduled, verificación #root |

---

## Resumen de archivos

| Archivo | Tipo | Descripción |
|---|---|---|
| `src/components/ui/error-boundary.tsx` | Nuevo | ErrorBoundary global con recuperación y reporte de errores |
| `src/components/ui/page-pull-to-refresh.tsx` | Nuevo | Wrapper reutilizable para pull-to-refresh en páginas |
| `src/utils/session-user.ts` | Modificado | Funciones seguras de lectura/escritura de storage |
| `src/navigation/RequireAuth.tsx` | Modificado | Lectura segura de token y usuario |
| `src/App.tsx` | Modificado | ErrorBoundary wrapper, lecturas seguras |
| `src/main.tsx` | Modificado | Guardián de montaje, recuperación de cold start |
| `src/index.css` | Modificado | `overscroll-behavior-y: contain` → `auto` (3 líneas) |
