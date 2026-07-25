<div align="center">

# 🎓 UNG Asistencias — Sistema de Gestión de Asistencia Universitaria

**Plataforma full-stack para el control de asistencia, gestión académica y auditoría institucional en entornos universitarios.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)]()
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=flat-square)]()
[![Status](https://img.shields.io/badge/Status-En%20producción-success?style=flat-square)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)]()

</div>

---

## 🚀 Demo en Vivo

<div align="center">

> 🧪 **Entorno Sandbox aislado — no es el sistema productivo real**
> La demo pública corre sobre un **backend y una base de datos completamente independientes y aislados** del entorno de desarrollo/producción de la universidad, poblados exclusivamente con **datos ficticios (seed data)** generados para fines de evaluación técnica. Ningún dato real de alumnos, docentes, facultades o instituciones es accesible ni se ve afectado desde este entorno — es 100% seguro de explorar y "romper".

| Entorno | Enlace |
|---|---|
| 🖥️ **Frontend (SPA)** | 🔧 *Nuevo despliegue en preparación — enlace disponible próximamente* |
| ⚙️ **API Backend** | 🔧 *Nuevo despliegue en preparación — enlace disponible próximamente* |

### 🔑 Credenciales de acceso de prueba (entorno Sandbox)

Cualquier persona puede iniciar sesión de inmediato en la demo con los siguientes usuarios de ejemplo, sin necesidad de solicitar acceso. Además, la pantalla de Login de la demo incluye un **panel de acceso rápido** (`DemoCredentials.tsx`, visible solo si `VITE_IS_DEMO=true`) con un botón por rol que autocompleta el formulario con un clic:

| Rol | Usuario | Contraseña |
|---|---|---|
| 👑 Administrador General | `admin.demo@ung.edu.py` | `Demo123456!` |
| 🗂️ Secretaría Académica | `secretaria.demo@ung.edu.py` | `Demo123456!` |
| 🧑‍🏫 Docente | `docente.demo@ung.edu.py` | `Demo123456!` |

> ⚠️ Estas credenciales son públicas y pertenecen **exclusivamente** al entorno Sandbox/Demo con datos ficticios. No otorgan ni tienen relación con ningún acceso al sistema real en producción.

La base de datos de este entorno se puebla con [`database/seed_demo.sql`](./database/seed_demo.sql): un script idempotente que crea los 3 usuarios de arriba, una facultad/carrera/plan de estudio ficticios, 2 cursos activos, 14 alumnos con nombres y cédulas inventados, y varias semanas de historial de asistencia (presentes, ausentes y justificaciones en distintos estados) para que el Dashboard, los Reportes y la Auditoría muestren datos realistas desde el primer inicio de sesión.

</div>

---

## 📋 Descripción Ejecutiva

**UNG Asistencias** es un sistema de gestión académica full-stack diseñado para resolver un problema real y crítico en instituciones de educación superior: **el control confiable, auditable y trazable de la asistencia estudiantil**, hoy gestionado en muchas universidades mediante planillas de papel o Excel dispersos sin ningún control de integridad.

La plataforma está dirigida a **universidades e institutos terciarios** que necesitan digitalizar el proceso de toma de asistencia, gestionar la estructura académica (facultades, carreras, planes de estudio, cursos y cronogramas), habilitar automáticamente a los alumnos para rendir exámenes según su porcentaje de asistencia, y generar documentación oficial (actas, informes, cronogramas firmados) en PDF con validez administrativa.

Actualmente en **producción activa**, resolviendo estos flujos para múltiples facultades y carreras con distintos niveles de acceso jerárquico (RBAC + scopes institucionales).

---

## ✨ Características Clave (Feature Highlights)

### 📚 Módulos funcionales

| Módulo | Descripción |
|---|---|
| 🗓️ **Control de Asistencia** | Planillas de asistencia por curso y sesión, registro individual/masivo ("marcar todos presentes"), gestión de justificaciones con adjuntos PDF y flujo de aprobación/rechazo. |
| 🏛️ **Gestión Académica Jerárquica** | CRUD completo de Facultades → Carreras → Planes de Estudio → Materias → Módulos → Cursos → Matrículas, con promoción automática de semestre. |
| 👥 **Gestión de Usuarios y Roles (RBAC)** | 5 roles jerárquicos (Administrador General, Secretaría Académica, Jefe de Carrera, Coordinador de Facultad, Docente) con **scopes** dinámicos por facultad/carrera. |
| 📊 **Panel Analítico (Dashboard)** | Visualización de métricas de ausentismo y estadísticas institucionales en tiempo real con gráficos interactivos (Recharts). |
| 📄 **Generación de Reportes PDF** | Actas de examen, informes de ausentismo, historial de alumno, consolidado de riesgo académico y cierres mensuales, generados server-side con PDFKit. |
| 📥 **Importación Masiva vía Excel** | Carga de nóminas de alumnos con validación previa, procesamiento por lotes y confirmación de registros (SheetJS/`xlsx`). |
| ✍️ **Cronograma de Cátedra con Firma Digital** | Firma operativa (usuario + timestamp) de semanas y evaluaciones del cronograma por parte del docente, embebida en el PDF final. |
| 🔍 **Auditoría de Eventos** | Registro estructurado de acciones sensibles del sistema, consultable y exportable a PDF para trazabilidad administrativa. |
| 🎓 **Habilitación Automática a Exámenes** | Cálculo automático de habilitación según umbrales de asistencia por curso. |
| 📱 **UX Docente Mobile-First** | Vista de planilla optimizada para tablets/celulares en el aula, con soporte de `visualViewport` para teclados nativos. |

### 🛠️ Decisiones técnicas y buenas prácticas

- **Arquitectura modular por dominio** en el backend (`modules/{auth, asistencias, academico, usuarios, reportes, auditoria, importaciones}`), cada uno con sus propias rutas y capa de servicio, evitando el acoplamiento típico del MVC monolítico.
- **Tipado estricto de extremo a extremo con TypeScript** tanto en API como en SPA, sin `any` implícitos.
- **Validación de esquemas con Zod** para variables de entorno (falla rápido si falta configuración crítica) y payloads de dominio complejos (cronogramas).
- **RBAC + Scopes multinivel**: los permisos no solo dependen del rol, sino de un alcance institucional/facultad/carrera calculado dinámicamente y reforzado por middleware (`aplicarPoliticaAlcanceHttp`), replicado en el frontend para UX consistente.
- **Middleware de seguridad en capas**: Helmet, CORS configurable por entorno (con soporte automático de IPs LAN en desarrollo para pruebas en dispositivos móviles), JWT de acceso + refresco con rotación y limpieza automática vía cron.
- **Hooks personalizados en React** para lógica de negocio reutilizable (`useMisAlcances`, `useAlcanceVisual`, `useScopeForm`, `useVisualViewportBottomInset`), separando la lógica de datos de la presentación.
- **Componentes UI accesibles** basados en primitivas de **Radix UI** + `class-variance-authority`, siguiendo el patrón de diseño *shadcn*.
- **Jobs programados (`node-cron`)** para recálculo periódico de estadísticas de ausentismo y limpieza de tokens expirados.
- **Logging estructurado** con Pino (JSON en producción, *pretty print* en desarrollo) y trazabilidad de requests con Morgan.
- **Tests automatizados con Vitest** cubriendo reglas de negocio críticas (normalización de roles, políticas de navegación, RBAC de justificaciones, días lectivos).

---

## 🏗️ Arquitectura del Proyecto

```
gestion-asistencias-ung/
├── src/                        # API REST (Express + TypeScript)
│   ├── config/                 # Configuración: env (Zod), pool de PostgreSQL, cliente Supabase
│   ├── middlewares/             # Autenticación JWT, políticas de scope/alcance, contexto de request
│   ├── modules/                 # Dominios de negocio (rutas + servicios)
│   │   ├── auth/                 # Login, refresh, roles
│   │   ├── usuarios/              # CRUD usuarios, scopes, export PDF
│   │   ├── academico/              # Facultades, carreras, planes, cursos, promoción
│   │   ├── asistencias/             # Planillas, sesiones, justificaciones, cronograma+firma
│   │   ├── importaciones/            # Carga masiva de alumnos vía Excel
│   │   ├── reportes/                  # Generación de PDFs institucionales
│   │   └── auditoria/                  # Registro y consulta de eventos
│   ├── jobs/                    # Tareas programadas (node-cron)
│   ├── services/                # Storage de actas/justificativos (Supabase Storage)
│   └── utils/                   # RBAC, scopes, helpers de PDF, logger
│
├── frontend/                   # SPA (React 19 + Vite 7 + TypeScript)
│   └── src/
│       ├── pages/                # Vistas por módulo (Panel, Asistencias, Académico, Reportes...)
│       ├── components/            # Componentes de dominio + ui/ (Radix)
│       ├── hooks/                   # Hooks personalizados (scopes, viewport)
│       ├── contexts/                 # ThemeContext (modo claro/oscuro)
│       ├── navigation/                 # Guard de rutas protegidas (RequireAuth)
│       └── utils/                       # Cliente API, RBAC espejado, sesión, toasts
│
├── database/                   # Schema SQL base + ~35 migraciones incrementales versionadas
├── docs/                        # Documentación de API por módulo y guías de despliegue
├── tests/                       # Suite de tests Vitest (reglas de negocio y RBAC)
└── scripts/                     # Smoke tests y utilidades de desarrollo mobile
```

**Patrón arquitectónico:** *Feature-based / Modular Monolith* en el backend (cada módulo encapsula sus propias rutas y lógica), y arquitectura de **componentes + hooks** en el frontend, sin frameworks de estado global (Redux/Zustand) — decisión deliberada dado que el estado de sesión y scopes se resuelve eficientemente con Context API + hooks dedicados.

---

## 🧰 Stack Tecnológico Detallado

### 🎨 Frontend

| Tecnología | Uso |
|---|---|
| **React 19** | Librería principal de UI |
| **TypeScript** | Tipado estático end-to-end |
| **Vite 7** | Build tool y dev server ultrarrápido |
| **React Router DOM v7** | Enrutamiento SPA |
| **Tailwind CSS 3** | Utility-first CSS |
| **Radix UI** (`checkbox`, `dialog`, `select`, `tabs`, `toast`...) | Primitivas de UI accesibles y sin estilos |
| **class-variance-authority + clsx + tailwind-merge** | Composición de variantes de componentes (patrón *shadcn*) |
| **Lucide React** | Iconografía |
| **Recharts** | Gráficos y visualización de datos analíticos |
| **Sonner** | Sistema de notificaciones *toast* |
| **SheetJS (`xlsx`)** | Lectura/procesamiento de archivos Excel en cliente |
| **ESLint 9 + typescript-eslint** | Linting y calidad de código |

### ⚙️ Backend

| Tecnología | Uso |
|---|---|
| **Node.js 22.x** | Runtime |
| **Express 5** | Framework HTTP / API REST |
| **TypeScript** | Tipado estático |
| **Zod** | Validación de esquemas (env vars y payloads) |
| **JSON Web Token (jsonwebtoken)** | Autenticación con access + refresh tokens |
| **bcryptjs** | Hashing seguro de contraseñas |
| **Helmet** | Cabeceras HTTP de seguridad |
| **CORS** | Control de orígenes permitidos por entorno |
| **Multer** | Manejo de subida de archivos (justificativos, adjuntos) |
| **PDFKit** | Generación de documentos PDF institucionales |
| **node-cron** | Tareas programadas (recálculo de métricas, limpieza de tokens) |
| **Pino + Pino-pretty** | Logging estructurado |
| **Morgan** | Logging de requests HTTP |
| **Vitest + Supertest** | Testing unitario y de integración |

### 🗄️ Base de Datos

| Tecnología | Uso |
|---|---|
| **PostgreSQL** | Motor de base de datos relacional |
| **Supabase** | Hosting de PostgreSQL + Auth Storage (buckets de actas y justificativos) |
| **`pg` (node-postgres)** | Driver nativo con *connection pooling*, sin ORM — SQL explícito y controlado |
| **Migraciones SQL versionadas** | ~35 migraciones incrementales en `database/` |

### 🚀 Herramientas y Despliegue

| Herramienta | Uso |
|---|---|
| **Heroku** | Hosting de la API backend (`Procfile` + `heroku-postbuild`) |
| **Vercel** | Hosting del frontend SPA con *rewrites* configurados |
| **Git / GitHub** | Control de versiones |
| **ts-node-dev** | Hot-reload del backend en desarrollo |
| **Vitest** | Runner de tests para backend |

---

## ⚡ Guía de Instalación y Configuración Local

### Prerrequisitos

- **Node.js `22.x`** (versión especificada en `engines` del `package.json`)
- **npm** (incluido con Node.js)
- Una instancia de **PostgreSQL** (recomendado: proyecto gratuito en [Supabase](https://supabase.com/))
- **Git**

### 1️⃣ Clonar el repositorio

```bash
git clone https://github.com/GustavoAdolfoBritez/sistema-gestion-asistencia.git
cd sistema-gestion-asistencia
```

### 2️⃣ Configurar e instalar el Backend (raíz del proyecto)

```bash
# Instalar dependencias
npm install

# Crear el archivo de variables de entorno
# (crea manualmente un archivo .env en la raíz siguiendo el detalle de la sección de abajo)
```

Ejecutar el schema base y las migraciones del directorio `database/` contra tu instancia de PostgreSQL (por ejemplo, mediante el editor SQL de Supabase o `psql`).

### 3️⃣ Configurar e instalar el Frontend

```bash
cd frontend
npm install

# Copiar la plantilla de variables de entorno para desarrollo local
cp env.local.example .env.local
```

### 4️⃣ Variables de entorno

> ⚠️ Por seguridad, **no se versionan credenciales reales**. Usa los archivos de ejemplo como referencia (`frontend/env.example`, `frontend/env.local.example`) y crea tus propios `.env` / `.env.local`.

**Backend (`.env` en la raíz):**

```bash
PORT=4000
NODE_ENV=development

# Conexión a PostgreSQL (Supabase)
SUPABASE_DB_URL=postgresql://usuario:password@host:puerto/basededatos
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# Autenticación (usar cadenas aleatorias de al menos 16 caracteres)
JWT_SECRET=tu_secreto_de_acceso
JWT_EXP_MIN=30
JWT_REFRESH_SECRET=tu_secreto_de_refresco
JWT_REFRESH_EXP_DAYS=7

# Opcionales
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173
EXPOSE_ERROR_DETAILS=true
DB_STATEMENT_TIMEOUT_MS=15000
```

**Frontend (`frontend/.env.local`):**

```bash
# En desarrollo no es obligatorio: Vite hace proxy de /api hacia localhost:4000
VITE_API_URL=http://localhost:4000/api
```

### 5️⃣ Ejecutar en modo desarrollo

En dos terminales separadas:

```bash
# Terminal 1 — Backend (http://localhost:4000)
npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend
npm run dev
```

> 📱 **Modo mobile/LAN:** `npm run dev:mobile` (backend) y `npm run dev:mobile` dentro de `frontend/` permiten probar la app desde un celular en la misma red Wi-Fi.

### 6️⃣ Ejecutar pruebas y build

```bash
# Backend: tests
npm test

# Backend: build de producción
npm run build

# Frontend: lint
cd frontend && npm run lint

# Frontend: build de producción
cd frontend && npm run build
```

---

## 🧪 Cómo reproducir el entorno de Demo

El entorno de demostración corre sobre una **instancia de base de datos y un despliegue totalmente separados** del proyecto real. Para levantar tu propia copia:

1. **Crear un proyecto secundario en Supabase** (mismo proceso que el original, por ejemplo `ung-asistencia-demo`).
2. **Ejecutar el schema y las migraciones** de [`database/`](./database) contra esa base de datos nueva, en orden cronológico, y por último correr [`database/seed_demo.sql`](./database/seed_demo.sql) desde el editor SQL de Supabase (o `psql`). Este script:
   - Es **idempotente**: puede reejecutarse las veces que quieras, siempre deja los datos de demo limpios y consistentes.
   - Genera fechas de sesiones/asistencias **relativas a `CURRENT_DATE`**, por lo que el Dashboard y los reportes siempre muestran actividad "reciente", sin importar cuándo lo ejecutes.
   - Crea los 3 usuarios de demo, la estructura académica ficticia, los cursos, los 14 alumnos y el historial de asistencia descritos en la sección [Demo en Vivo](#-demo-en-vivo).
3. **Desplegar un nuevo entorno** en tu plataforma de hosting (proyecto/branch separado en Heroku/Render para la API, y en Vercel para el frontend):
   - Backend: apuntar `SUPABASE_DB_URL`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al proyecto de demo, y usar `JWT_SECRET`/`JWT_REFRESH_SECRET` propios (distintos a los de producción).
   - Frontend: definir `VITE_API_URL` apuntando a la API de demo y **`VITE_IS_DEMO=true`** para que se muestre el panel de acceso rápido (`DemoCredentials.tsx`) en el Login.

Con esto, la base de datos de desarrollo/producción real nunca se ve involucrada y cualquier visitante puede interactuar con el sistema al instante desde este README.

---

## 🔐 Seguridad y Control de Acceso

- Autenticación basada en **JWT** (access + refresh token) con rotación y expiración configurable.
- Contraseñas *hasheadas* con **bcrypt**.
- **RBAC de 5 roles** con **scopes** por facultad/carrera aplicados tanto en middleware de backend como en la UI del frontend.
- Cabeceras de seguridad HTTP vía **Helmet** y política de **CORS** explícita por entorno.
- Límites de tamaño de archivo en cargas (PDF de justificativos, planillas Excel) mediante **Multer**.
- **Auditoría** de acciones administrativas sensibles, consultable y exportable.

---

## 📖 Documentación adicional

El proyecto incluye documentación técnica detallada por módulo en la carpeta [`docs/`](./docs):

- [`docs/asistencias-api.md`](./docs/asistencias-api.md) — API de asistencias, sesiones y justificaciones
- [`docs/academico-api.md`](./docs/academico-api.md) — API de estructura académica
- [`docs/reportes-api.md`](./docs/reportes-api.md) — API de reportes y generación de PDFs
- [`docs/tablet-qa.md`](./docs/tablet-qa.md) — Guía de QA para uso en tablets
- [`docs/deploy-asistencias-planilla.md`](./docs/deploy-asistencias-planilla.md) — Guía de despliegue

---

## 🗺️ Roadmap

- [ ] Suite de tests E2E (Playwright/Cypress)
- [ ] Contenerización con Docker / Docker Compose
- [ ] Notificaciones push/email de alertas de ausentismo
- [ ] Migración a ORM tipado (Drizzle/Prisma) para mayor seguridad en queries

---

## 👨‍💻 Autor y Contacto

**Gustavo Adolfo Britez**
Frontend / Full-Stack Developer

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/GustavoAdolfoBritez)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/gustavo-britez)

> 💬 ¿Interesado en colaborar, reportar un bug o simplemente charlar sobre el proyecto? No dudes en abrir un [issue](https://github.com/GustavoAdolfoBritez/sistema-gestion-asistencia/issues) o contactarme directamente.

---

<div align="center">

⭐ Si este proyecto te resultó interesante, considera darle una estrella en GitHub ⭐

</div>
