# Diseño: calidad-ci-backend

Copia en Engram: `sdd/calidad-ci-backend/design`. Entradas: `proposal.md` (decisiones D1 a D7) y `exploration.md` (sección 8, decisiones del usuario del 2026-11-24, que este diseño no reabre). Sin delta specs: el cambio no modifica requisitos del producto. Verificado contra el código de `desarrollo` (2026-11-24): Vitest 4.1.11 (tipos y CLI leídos en `backend/node_modules/vitest/dist`), Prisma 5.22.0, TypeScript 7.0.2 (backend) y 6.0.3 (frontend), Vite 8.2.2 y ESLint 10.

## Enfoque técnico

- **Separación por configuración:** `backend/vitest.config.ts` declara dos proyectos de Vitest en línea, `unit` y `db`, que heredan las opciones comunes de la raíz con `extends: true`. La lista de los 6 archivos que usan la base vive en una sola constante: `db` la usa como `include` y `unit` como `exclude` (decisión 1).
- **Scripts:** `test:unit` y `test:db` seleccionan un proyecto con `--project`; `test` sigue siendo `vitest run` y corre ambos (decisión 2).
- **Ningún archivo de `backend/tests/` cambia.** Los archivos sin gate (`integration`, `secretosJwt` y `rutasAdminReservas`) quedan en `db` tal cual (D2).
- **Sin base garantizada para `unit`:** la verificación local y la CI corren `test:unit` con `DATABASE_URL` apuntando a un puerto cerrado. Cualquier acceso accidental a la base falla de inmediato con `PrismaClientInitializationError` (decisión 3).
- **CI en dos jobs paralelos** (`backend` y `frontend`) en `.github/workflows/ci.yml`, con PostgreSQL 15 como servicio solo en `backend`. El job `backend` falla rápido: `tsc` y `test:unit` corren antes de migrar y sembrar la base (decisión 4).
- **Node fijado en `.nvmrc`** (candidato `24`), elegido por la intersección de `engines` instalados y confirmado con una ejecución real (decisión 5).
- **Sin código de producción:** no se toca `backend/src`, `schema.prisma` ni la base. La evidencia es de ejecución, no de RED/GREEN.
- **Reglas de `AGENTS.md`:** no aplican cambios de capas, UTC ni `any` porque no hay código de producción. `vitest.config.ts` queda sin `any`.

## Decisiones de arquitectura

### Decisión 1: proyectos en línea con `extends: true` y una lista única de archivos con base

**Elección:** contenido final de `backend/vitest.config.ts`:

```ts
import { configDefaults, defineConfig } from "vitest/config";

// Pruebas que usan la base de datos real (proyecto "db"). Toda prueba nueva va al
// proyecto "unit" salvo que use la base; en ese caso se agrega a esta lista.
const ARCHIVOS_CON_BASE = [
  "tests/concurrenciaReservas.test.ts",
  "tests/integration.test.ts",
  "tests/liberarAlCrearReservaBase.test.ts",
  "tests/migracionReservaInvitado.test.ts",
  "tests/rutasAdminReservas.test.ts",
  "tests/secretosJwt.test.ts",
];

export default defineConfig({
  test: {
    // Opciones comunes: los proyectos las heredan con `extends: true`.
    // No declarar `include` ni `exclude` aquí: al heredar, los arreglos se concatenan.
    globals: true,
    environment: "node",
    testTimeout: 10000,
    // Los archivos que usan la base descartable comparten datos: correrlos en serie evita interferencias.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...ARCHIVOS_CON_BASE],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ARCHIVOS_CON_BASE,
        },
      },
    ],
  },
});
```

**Verificación contra la versión instalada (Vitest 4.1.11):**

- `InlineConfig.projects?: TestProjectConfiguration[]` existe (`reporters.d.DtoKVV2s.d.ts:2859`).
- `TestProjectInlineConfiguration` acepta `extends?: string | true`; con `true` hereda todas las opciones del archivo de configuración raíz (`:3608-3615`). En `cli-api.CnMVyzaz.js:11180`, `extends === true` resuelve al mismo archivo de configuración.
- `fileParallelism` no está en `NonProjectOptions` (`:3572`), así que es válido por proyecto. Con `maxWorkers` 1 y sin `sequence.groupOrder`, Vitest pone los archivos de todos los proyectos en un único grupo secuencial (`cli-api.CnMVyzaz.js:3851-3884`): `npm test` corre los 32 archivos de a uno, igual que hoy.
- `configDefaults` se exporta desde `vitest/config` (`config.d.ts:104`).
- CLI: `--project <name>` es repetible y acepta comodines y negación (`cac.uFydS1Z4.js:1114-1117`). `vitest list --filesOnly` existe (`:1315`) y permite verificar la clasificación sin ejecutar pruebas.

**Alternativas consideradas:**

- `include` en la raíz y en cada proyecto. Se descarta: con `extends: true`, Vite fusiona la configuración con `mergeConfig`, que concatena arreglos. `db` terminaría incluyendo `tests/**/*.test.ts` y correría los 32 archivos.
- Proyectos sin `extends`, repitiendo `globals`, `environment`, `testTimeout` y `fileParallelism` en cada uno. Se descarta: duplica opciones y es fácil que diverjan.
- Dos archivos de configuración o sufijo `*.db.test.ts`. Ya descartados en la exploración (sección 6.1, decisión del usuario).
- Proyectos por archivo externo (`vitest.unit.config.ts`). Se descarta: más archivos sin beneficio para 2 proyectos.

**Justificación:** una sola lista evita que un archivo quede en ambos proyectos o en ninguno: `unit` es el complemento exacto de `db` dentro de `tests/**/*.test.ts`. Una prueba nueva cae en `unit` por defecto, y si usa la base, falla en la verificación sin base (decisión 3), lo que obliga a moverla.

### Decisión 2: scripts de `backend/package.json`

**Elección:** en `scripts`, se reemplaza la línea `test` y se agregan dos:

```json
"test": "vitest run",
"test:unit": "vitest run --project unit",
"test:db": "vitest run --project db"
```

`test` conserva su texto: con `projects`, `vitest run` sin filtro corre ambos proyectos. El diff real es de 2 líneas agregadas.

**Alternativas consideradas:** `"test": "npm run test:unit && npm run test:db"`. Se descarta: dos procesos de Vitest, dos resúmenes que hay que sumar a mano para comparar con la línea base, y `test:db` no corre si `test:unit` falla, lo que oculta información.

**Justificación:** un solo `vitest run` da un único total (32 archivos y 470 pruebas) comparable con la línea base, y `tdd_scope.command` de `openspec/config.yaml` (`cd backend && npm test`) sigue siendo válido.

### Decisión 3: garantía de "sin base" para `test:unit`

**Elección:** `test:unit` se verifica con `DATABASE_URL` apuntando a un puerto cerrado de la máquina local y sin `DATABASE_URL_PRUEBA`:

- URL inalcanzable: `postgresql://sin_base:sin_base@127.0.0.1:1/sin_base`. El puerto 1 rechaza la conexión al instante, sin esperar un timeout.
- **Por qué hace falta fijarla:** el cliente de Prisma 5 carga `backend/.env` al instanciarse y agrega las variables que **no** están ya definidas en el proceso. Si `DATABASE_URL` no se define, Prisma tomaría la de `backend/.env` (base de desarrollo). Definirla en el proceso tiene prioridad sobre `.env`. No se lee ni se modifica `backend/.env`.
- **Local (PowerShell, desde `backend/`):**

```powershell
$env:DATABASE_URL = "postgresql://sin_base:sin_base@127.0.0.1:1/sin_base"
Remove-Item Env:DATABASE_URL_PRUEBA -ErrorAction SilentlyContinue
npm run test:unit
Remove-Item Env:DATABASE_URL
```

  `DATABASE_URL_PRUEBA` solo actúa como interruptor de `skipIf` en archivos del proyecto `db`, así que no afecta a `unit` aunque `.env` la definiera; se quita igual para que la prueba sea limpia.
- **CI:** el paso `test:unit` redefine `DATABASE_URL` con la misma URL inalcanzable y `DATABASE_URL_PRUEBA` vacía, aunque el servicio PostgreSQL esté levantado.

**Alternativas consideradas:**

- Apagar los contenedores de PostgreSQL. Se descarta como mecanismo principal: si `backend/.env` apunta a otra base que responde, la prueba no demuestra nada.
- Renombrar `backend/.env` temporalmente. Se descarta: toca un archivo con secretos y el entorno bloquea su lectura.
- En la CI, correr `test:unit` con la base del servicio todavía vacía. Se descarta como única garantía: un acceso accidental fallaría por tablas inexistentes, con un mensaje menos claro que el error de conexión.

**Justificación:** el error de conexión es inequívoco y no depende de qué haya en `.env` ni de qué contenedores estén encendidos.

### Decisión 4: workflow de GitHub Actions

**Elección:** contenido final de `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [desarrollo]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    name: Backend (tsc y pruebas)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: backend
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: prueba
          POSTGRES_PASSWORD: prueba
          POSTGRES_DB: reservas_prueba
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U prueba -d reservas_prueba"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      # Base descartable del servicio: credenciales locales del runner, no secretas.
      DATABASE_URL: postgresql://prueba:prueba@localhost:5432/reservas_prueba?schema=public
      DATABASE_URL_PRUEBA: postgresql://prueba:prueba@localhost:5432/reservas_prueba?schema=public
      # Valor ficticio solo para las pruebas de la CI. NO es un secreto ni se usa en ningún despliegue.
      JWT_SECRET: ci-valor-ficticio-no-es-secreto-solo-pruebas
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Instalar dependencias
        run: npm ci

      - name: Generar el cliente de Prisma
        run: npx prisma generate

      - name: Verificar tipos
        run: npx tsc --noEmit

      - name: Pruebas sin base (unit)
        env:
          # Puerto cerrado: si una prueba de "unit" usa la base, falla con error de conexión.
          DATABASE_URL: postgresql://sin_base:sin_base@127.0.0.1:1/sin_base
          DATABASE_URL_PRUEBA: ""
        run: npm run test:unit

      - name: Aplicar migraciones
        run: npx prisma migrate deploy

      - name: Cargar la semilla
        run: npx prisma db seed

      - name: Pruebas con base (db)
        run: npm run test:db

  frontend:
    name: Frontend (lint y build)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Instalar dependencias
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build
```

Notas de diseño:

- **`node-version-file: .nvmrc`** se resuelve desde la raíz del repositorio: `working-directory` solo afecta a los pasos `run`, no a `with` de las acciones.
- **Servicio:** el job corre en el runner, no en un contenedor, así que se conecta por `localhost:5432` con el puerto publicado. El usuario del servicio es superusuario, lo que permite crear `btree_gist` en la migración `reservas_sin_solapamiento` (skill `prisma-migraciones`).
- **`prisma generate` explícito:** `npm ci` ya lo dispara por el `postinstall` de `@prisma/client`, pero el paso explícito deja el error en un paso con nombre propio. `binaryTargets` incluye `debian-openssl-3.0.x`, compatible con el runner Ubuntu. El `postinstall` del proyecto (`prisma skills sync || exit 0`) no falla gracias a `|| exit 0`.
- **`migrate deploy`**, nunca `migrate dev` (sin terminal interactiva y sobre una base vacía).
- **Sin secretos del repositorio ni de Mercado Pago:** las pruebas inyectan esas variables con `vi.stubEnv` y el SDK está simulado (exploración, sección 3). No se definen `LIMITE_*` ni `TOPE_PENDIENTES_POR_TELEFONO`: las pruebas de límites dependen de los valores por defecto.
- **`permissions: contents: read`** y sin `secrets.*`: el workflow no puede escribir en el repositorio.
- **`concurrency`** cancela la corrida anterior de la misma rama si llega otro push; ahorra minutos y no cambia el resultado.
- **Actualización de apply (2026-11-24):** las mayores vigentes resultaron `v7` (`actions/checkout` v7.0.1 y `actions/setup-node` v7.1.0); el `ci.yml` entregado usa `@v7` en lugar del `@v5` de los bloques de arriba. El resto del contenido del workflow coincide.
- **Versiones de acciones fijadas por versión mayor** (`@v5`, reemplazada por `@v7` en apply). Apply confirma, con Context7 o la página de lanzamientos de cada acción, que `v5` sigue vigente o si hay una mayor posterior estable; si la hay, la usa en ambos jobs. No se fijan por SHA: el repositorio no tiene una política que lo exija y la mayor fijada es la convención pedida.

**Alternativas consideradas:**

- Variables de base solo en los pasos que la usan, en lugar de en el job. Se descarta: obliga a repetir la URL en tres pasos (`migrate deploy`, `db seed` y `test:db`). Se prefiere definirlas una vez en el job y sobrescribirlas solo en `test:unit`.
- `npm test` en un solo paso con la base. Se descarta: pierde la garantía de "sin base" para `unit` y el fallo rápido antes de migrar.
- Contenedor de job (`container: node:24`) para alinear el sistema operativo con el `DockerFile`. Se descarta: más lento y el `DockerFile` usa Node 20, que no es la versión elegida.
- Agregar `npm run build` del backend. Se descarta: `tsc --noEmit` ya tipa `src`, `tests` y `prisma` (`tsconfig.json:13`); el build no agrega verificación.

**Justificación:** sigue D3, D4 y D6 al pie de la letra, con jobs aislados que reportan fallos por separado, y deja el job `frontend` listo para sumar pruebas en `calidad-ci` (N.º 10).

### Decisión 5: versión de Node

**Elección:** candidato `24` en `.nvmrc` (solo la versión mayor; `setup-node` resuelve la última `24.x`). El archivo contiene una sola línea: `24`.

**Intersección de `engines` instalados (leída en `node_modules`):**

| Paquete | Versión | `engines.node` |
|---|---|---|
| `eslint` (frontend) | 10 | `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| `vite` (frontend y backend) | 8.2.2 | `^20.19.0 \|\| >=22.12.0` |
| `@vitejs/plugin-react` | 6 | `^20.19.0 \|\| >=22.12.0` |
| `vitest` | 4.1.11 | `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` |
| `typescript` (backend) | 7.0.2 | `>=16.20.0` |
| `typescript` (frontend) | 6.0.3 | `>=14.17` |
| `prisma` | 5.22.0 | `>=16.13` |
| `tsx` | 4 | `>=18.0.0` |
| `bcrypt` | 6 | `>= 18` |

Intersección: `^20.19.0 || ^22.13.0 || >=24`. Node 20 terminó su soporte en abril de 2026: queda descartado. Quedan 22 (LTS en mantenimiento hasta abril de 2027) y 24 (LTS hasta abril de 2028). Se elige 24 por el mayor soporte restante; además `frontend` declara `@types/node ^24`.

**Procedimiento de apply:**

1. Releer los `engines` de la tabla en `backend/node_modules` y `frontend/node_modules` (por si hubo una actualización de dependencias) y confirmar que 24 sigue en la intersección.
2. Registrar `node --version` local.
3. Si la versión local es 24: correr localmente `npm ci`, `tsc`, `test:unit`, `test:db`, `lint` y `build` (sección "Verificación local").
4. Si la versión local es otra mayor: correr igual la verificación local (informativa) y tomar como ejecución real la corrida de la CI con `.nvmrc` en `24`, disparada por el push del usuario o por `workflow_dispatch`.
5. Si 24 falla por una causa atribuible a Node (no a las pruebas), probar `22` con `workflow_dispatch` y fijar la que pase. Registrar el resultado en `tasks.md`.

**Alternativas consideradas:**

- `22`. Válida, pero con un año menos de soporte.
- `26` (Current desde abril de 2026; su pase a LTS según el calendario de Node no está verificado en este diseño). Se descarta para la CI hasta confirmarlo.
- `engines` en los `package.json`. Fuera del alcance (D5).

**Justificación:** la intersección de `engines` es evidencia leída del código instalado; la ejecución real (D5) cierra lo que `engines` no garantiza.

## Flujo de datos

```
push a desarrollo / workflow_dispatch
        │
        ├──→ job backend (ubuntu, servicio postgres:15 con pg_isready)
        │      checkout → setup-node(.nvmrc, caché backend/package-lock.json)
        │      → npm ci → prisma generate → tsc --noEmit
        │      → test:unit   (DATABASE_URL = 127.0.0.1:1, sin base)
        │      → migrate deploy → db seed   (base del servicio)
        │      → test:db     (DATABASE_URL = DATABASE_URL_PRUEBA = servicio)
        │
        └──→ job frontend (ubuntu, sin base)
               checkout → setup-node(.nvmrc, caché frontend/package-lock.json)
               → npm ci → lint → build

vitest.config.ts
   ARCHIVOS_CON_BASE (6) ──→ include de "db"
            │
            └────────────→ exclude de "unit" (tests/**/*.test.ts menos los 6 = 26)
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/vitest.config.ts` | Modificar | Proyectos `unit` y `db` (decisión 1). ~35 líneas. |
| `backend/package.json` | Modificar | Scripts `test:unit` y `test:db` (decisión 2). +2 líneas. |
| `.nvmrc` | Crear | `24` (decisión 5). 1 línea. |
| `.github/workflows/ci.yml` | Crear | Jobs `backend` y `frontend` (decisión 4). ~95 líneas. |
| `.claude/skills/testing-backend/SKILL.md` | Modificar | Ver "Documentación". ~25 líneas. |
| `docs/operacion/desarrollo-local.md` | Modificar | Ver "Documentación". ~25 líneas. |
| `docs/operacion/variables-entorno.md` | Modificar | Ver "Documentación". ~4 líneas. |
| `openspec/config.yaml` | Modificar | Ver "Documentación". ~8 líneas. |
| `.claude/commands/cerrar-sesion.md` | Modificar | Ver "Documentación". ~12 líneas. |
| `docs/producto/hoja-de-ruta.md` | Modificar | Estado de la fila 4. ~2 líneas. |
| `backend/tests/*` | Sin cambios | Ningún archivo de prueba se edita (D2). |

### Documentación (qué cambia en cada archivo)

- **`.claude/skills/testing-backend/SKILL.md`:**
  - Encabezado: los proyectos `unit` y `db` de `vitest.config.ts` y los tres scripts (`test:unit`, `test:db`, `test`).
  - Sección nueva "Clasificar una prueba nueva": va a `unit` por defecto; si usa la base real (sin `vi.mock` de `src/core/config/prisma.js`), se agrega a `ARCHIVOS_CON_BASE`. Criterio de control: `test:unit` debe pasar con `DATABASE_URL` inalcanzable (comando de la decisión 3).
  - El ciclo TDD usa `npm run test:unit` para iterar y `npm test` contra la base descartable cuando la prueba es de `db`.
  - Reemplaza la frase incompleta "Sin esa variable, `npm test` omite esas pruebas" por la descripción correcta: tres archivos de `db` no tienen gate y fallan sin base; por eso `db` solo se corre contra la base descartable.
  - Mención de la CI: qué corre cada job.
- **`docs/operacion/desarrollo-local.md`:**
  - "Versión exacta de Node: Pendiente" pasa a "Node 24 (`.nvmrc`)", con la nota de que la CI usa ese archivo.
  - Sección "Pruebas del backend": los tres scripts; `test:unit` sin base; `test:db` y `npm test` solo contra la base descartable con `migrate deploy` y `db seed`, con los comandos en PowerShell y en bash y un enlace a `variables-entorno.md` ("Base descartable para pruebas").
  - Sección breve "Integración continua": disparadores, jobs y dónde ver las corridas.
- **`docs/operacion/variables-entorno.md`:**
  - Fila de `DATABASE_URL_PRUEBA` y sección "Base descartable para pruebas": reemplazar "sin esa variable las pruebas que usan la base se omiten" por la descripción correcta (tres archivos de `db` no tienen gate; `test:db` y `npm test` exigen la base descartable; `test:unit` no la necesita).
- **`openspec/config.yaml`:**
  - `tdd_scope.command` se mantiene (`cd backend && npm test`).
  - En `projects[backend]`: `test_command` sigue en `npm test`; se agregan `test_unit_command: "npm run test:unit"` y `test_db_command: "npm run test:db"`. La nota pasa a decir que `test:db` requiere la base descartable con migraciones y semilla.
  - `rules.verify`: ejecutar `npm run test:unit` sin base y `npm test` contra la base descartable, más `tsc --noEmit` (backend) y `lint` y `build` (frontend).
- **`.claude/commands/cerrar-sesion.md`**, paso 5 (verificaciones de la integración diaria, desde `backend/`):
  - `npx tsc --noEmit`.
  - `npm run test:unit`: debe pasar completo. No usa la base, así que se puede correr siempre.
  - `npm test` contra la base descartable `reservas_prueba`, con `DATABASE_URL` y `DATABASE_URL_PRUEBA` definidas en línea con su URL y después de `migrate deploy` y `db seed` sobre esa base. Debe pasar completo (los 32 archivos).
  - Si la base descartable no responde, la integración se bloquea; no se acepta ninguna falla.
  - Nunca se corre `npm test` con la `DATABASE_URL` de `backend/.env`.
  - Se eliminan la tolerancia de "exactamente 5 fallas de conexión" y la línea "rige hasta que `calidad-ci` separe…".
  - Requisito adicional: si el usuario puede verlo, la última corrida de la CI en `desarrollo` está en verde (sin `gh`, lo confirma el usuario en GitHub).
- **`docs/producto/hoja-de-ruta.md`:** fila 4 de "pendiente" a "en curso" al empezar apply y a "hecho" al archivar.

## Interfaces y contratos

- **Proyectos de Vitest:** `unit` = `tests/**/*.test.ts` menos `ARCHIVOS_CON_BASE` (26 archivos); `db` = `ARCHIVOS_CON_BASE` (6 archivos).
- **Scripts:** `npm test` (ambos), `npm run test:unit` (sin base), `npm run test:db` (base descartable).
- **Variables de entorno de la CI:** `DATABASE_URL`, `DATABASE_URL_PRUEBA` (iguales, servicio) y `JWT_SECRET` (ficticio). Ningún `secrets.*`.

## Estrategia de verificación

No hay código de producción nuevo ni RED posible: la evidencia es de ejecución. Comandos en PowerShell, desde `backend/`, con la base descartable `reservas_prueba` (puerto 5434) encendida.

**1. Línea base (antes de tocar `vitest.config.ts`):**

```powershell
$env:DATABASE_URL = "postgresql://prueba:prueba@localhost:5434/reservas_prueba"
$env:DATABASE_URL_PRUEBA = $env:DATABASE_URL
npx prisma migrate deploy
npx prisma db seed
npm test        # esperado: 32 archivos y 470 pruebas en verde
Remove-Item Env:DATABASE_URL, Env:DATABASE_URL_PRUEBA
```

**2. Clasificación sin ejecutar pruebas (después del cambio):**

```powershell
npx vitest list --project db --filesOnly     # exactamente los 6 archivos
npx vitest list --project unit --filesOnly   # 26 archivos, ninguno de los 6
```

**3. `unit` sin base:** comando de la decisión 3. Esperado: 26 archivos en verde; registrar la cantidad de pruebas `U`.

**4. `db` y total, contra la base descartable:**

```powershell
$env:DATABASE_URL = "postgresql://prueba:prueba@localhost:5434/reservas_prueba"
$env:DATABASE_URL_PRUEBA = $env:DATABASE_URL
npx prisma db seed
npm run test:db   # 6 archivos; registrar D
npx prisma db seed
npm test          # 32 archivos y 470 pruebas
Remove-Item Env:DATABASE_URL, Env:DATABASE_URL_PRUEBA
```

Criterio: `U + D = 470`, 26 + 6 = 32 archivos, y `npm test` reproduce la línea base. La semilla se recarga antes de cada corrida porque las pruebas de `db` dejan o borran datos.

**5. Resto:** `npx tsc --noEmit` (backend); `npm ci`, `npm run lint` y `npm run build` en `frontend/`; `git status` muestra `backend/tests/` sin cambios.

**6. CI:** después del push del usuario a `desarrollo`, ambos jobs en verde; repetir con `workflow_dispatch`. Si la CI muestra otro total de pruebas que el local, se investiga antes de dar el cambio por terminado.

| Capa | Qué se verifica | Cómo |
|---|---|---|
| Unitaria | 26 archivos sin base | `test:unit` con `DATABASE_URL` inalcanzable, local y en la CI |
| Integración | 6 archivos con base | `test:db` contra la base descartable local y el servicio de la CI |
| Total | 470 pruebas en 32 archivos | `npm test` local contra la base descartable |
| E2E | No aplica | — |

## Matriz de amenazas

No aplica en lo sustancial: el workflow ejecuta comandos fijos del proyecto y no automatiza git ni PR, ni clasifica archivos ejecutables.

| Límite | Aplicabilidad |
|---|---|
| Rutas con apariencia de documentación | N/A: no se clasifican ni ejecutan archivos por nombre. |
| Selección de repositorio git | N/A: solo `actions/checkout` del propio repositorio. |
| Estado del commit | N/A: el workflow no commitea. |
| Estado del push | N/A: el workflow no hace push (`contents: read`). |
| Comandos de PR | N/A: el proyecto no usa PR y el workflow no los crea. |

## Migración y despliegue

No requiere migración de datos. La CI se activa con el primer push a `desarrollo` que incluya `.github/workflows/ci.yml`; se desactiva revirtiendo el archivo o deshabilitando el workflow en GitHub.

### Entregas y commits sugeridos (los hace el usuario)

Total estimado ~205 líneas, dentro del presupuesto de 400: una sola entrega en `desarrollo`, en commits granulares.

| Orden | Mensaje sugerido | Archivos | Líneas |
|---|---|---|---|
| 1 | `test(backend): separar las pruebas en los proyectos unit y db de Vitest` | `backend/vitest.config.ts`, `backend/package.json` | ~40 |
| 2 | `ci: agregar la integración continua de backend y frontend y fijar Node 24` | `.nvmrc`, `.github/workflows/ci.yml` | ~95 |
| 3 | `docs: documentar los grupos de pruebas, la CI y la nueva integración diaria` | skill `testing-backend`, `desarrollo-local.md`, `variables-entorno.md`, `openspec/config.yaml`, `cerrar-sesion.md` | ~75 |
| 4 | `docs(openspec): agregar los artefactos de calidad-ci-backend` | `openspec/changes/calidad-ci-backend/`, hoja de ruta | artefactos |

El 1 va antes que el 2 porque la CI usa los scripts nuevos. El push que dispara la primera corrida lo hace el usuario después del 2 (o del 3).

## Preguntas abiertas

- [x] `docs/operacion/variables-entorno.md`: resuelto el 2026-11-24. El usuario aprobó corregirlo en el commit 3 (~4 líneas); se agregó a D7 y a "Documentación".
- [ ] Confirmar en apply la versión mayor vigente de `actions/checkout` y `actions/setup-node` (candidato `v5`).
