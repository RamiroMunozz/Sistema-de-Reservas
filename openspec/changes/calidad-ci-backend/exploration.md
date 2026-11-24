# Exploración: `calidad-ci-backend` (hoja de ruta N.º 4)

Objetivo: red de seguridad antes de `multi-tenant-negocios`. Separar las pruebas del backend en un grupo sin base y otro con base descartable, y crear una integración continua básica en GitHub Actions (push a `desarrollo`): `tsc --noEmit` y pruebas del backend con PostgreSQL de servicio, y `lint` y `build` del frontend. Las pruebas del frontend quedan fuera (van a `calidad-ci`, N.º 10).

## 1. Pruebas del backend y clasificación de los 32 archivos

### Configuración actual

- `backend/package.json:13`: un solo script de prueba, `"test": "vitest run"`. `build` es `tsc` (línea 8). No hay `test:unit`, `lint` ni `engines`. `postinstall` es `prisma skills sync || exit 0` (línea 12).
- `backend/vitest.config.ts:4-11`: `globals: true`, entorno `node`, `include: ["tests/**/*.test.ts"]`, `testTimeout: 10000` y `fileParallelism: false`. No hay `setupFiles`, `projects` ni `globalSetup`.
- `backend/tsconfig.json:13` incluye `src`, `tests` y `prisma`: `tsc --noEmit` tipa también las pruebas y la semilla.

### Cómo se elige la base

- No hay selección. `backend/src/core/config/prisma.ts:3` crea `new PrismaClient(...)`, que lee `DATABASE_URL` del entorno (o de `backend/.env` por el mecanismo de Prisma).
- `DATABASE_URL_PRUEBA` solo actúa como interruptor de `skipIf`; nunca se usa como URL de conexión. Por eso `docs/operacion/variables-entorno.md:42-49` exige definir ambas variables con el mismo valor.
- `dotenv/config` solo se carga en `backend/src/server.ts:1`, no en las pruebas.

### Clasificación (32 archivos en `backend/tests/`)

**A. Puras, sin base ni mock de Prisma (9):** `datosInvitado`, `tokenAcceso`, `trustProxy`, `filtrosReserva`, `sena`, `estadoSena`, `vencimiento` (reloj falso), `cancelacionReserva` (solo tipos de Prisma) y `adaptadorMercadoPago` (mock de `mercadopago`, `vi.stubEnv` y reloj falso; `adaptadorMercadoPago.test.ts:19,57-59,86`). `datosInvitado` y `tokenAcceso` se asumen puras; conviene confirmarlo ejecutándolas sin base.

**B. Prisma mockeado con `vi.mock("../src/core/config/prisma.js")`, sin base (17):** `barridoVencidas`, `cancelacionBajoBloqueo`, `depositPercent`, `disponibilidad`, `liberarAlCrearReserva`, `limitadorCreacionRuta`, `limitadorPublico`, `linkDePago`, `metricasAdmin`, `preferenciaPago`, `reembolsoPago`, `reservaInvitadoCrear`, `respuestasListaBlanca`, `rutasPublicasToken`, `validacionCanchas`, `validacionReservas` y `webhookPago`. Todas importan `app` o módulos que importan `@prisma/client`, así que necesitan `prisma generate` aunque no usen la base.

**C. Base real (6):**

| Archivo | Condición |
|---|---|
| `concurrenciaReservas` | `describe.skipIf(!DATABASE_URL_PRUEBA)` (`:26`) |
| `liberarAlCrearReservaBase` | `describe.skipIf` (`:12`) |
| `migracionReservaInvitado` | `describe.skipIf` (`:41`) |
| `rutasAdminReservas` | Mixto: el `describe` 1 (`:18`) no tiene gate y usa la base real; el `describe` 2 (`:186`) tiene `skipIf`. |
| `integration` | Sin gate. Hace login con la semilla (`integration.test.ts:12-22`) y llama a `prisma.$disconnect()`. |
| `secretosJwt` | Sin gate ni mock. El test "acepta un token emitido por la aplicación" (`:90-99`) espera 200 en `/bookings/my-bookings` y consulta la base. Los demás tests del archivo no la tocan. |

### Hallazgo central

Hoy `npm test` sin base disponible falla, porque `integration`, un test de `secretosJwt` y el `describe` 1 de `rutasAdminReservas` no tienen gate. La nota del skill `testing-backend` ("sin esa variable, `npm test` omite esas pruebas") es incompleta. Un `test:unit` libre de base debe cubrir los grupos A y B (26 archivos); los archivos del grupo C se excluyen o se refactorizan.

## 2. Preparación de la base descartable y réplica en la CI

Según `docs/operacion/variables-entorno.md:36-51` y `backend/prisma/seed.ts`:

- Base nueva en el contenedor `reservas_prueba` (puerto 5434, usuario `prueba`).
- `npx prisma migrate deploy` aplica 5 migraciones: `20260826202621_init_schema`, `20261031231330_nueva_migracion`, `20261104120000_reservas_sin_solapamiento`, `20261119120000_reserva_invitado` y `20261119120100_sin_solapamiento_excluye_vencidas`.
- `npx prisma db seed` (`tsx prisma/seed.ts`) borra todo y crea un administrador (`admin@sportsbooking.com`), un jugador (`jugador@example.com`), 1 complejo, 3 canchas y 7 horarios por cancha. `integration.test.ts` depende de esos datos.
- La extensión `btree_gist` la crea la migración `reservas_sin_solapamiento` para la restricción `EXCLUDE USING gist`. En PostgreSQL 13 o superior es "trusted", y el usuario del servicio de GitHub Actions es superusuario.

Pasos que debe replicar la CI:

1. Servicio `postgres` (por ejemplo `postgres:15`, igual que `docker-compose.yml:3`) con `pg_isready` como healthcheck.
2. `npm ci` en `backend/` (existe `backend/package-lock.json`).
3. `npx prisma generate` explícito.
4. `npx prisma migrate deploy` (nunca `migrate dev`: base vacía y sin terminal interactiva).
5. `npx prisma db seed`.
6. `DATABASE_URL` y `DATABASE_URL_PRUEBA` con el mismo valor, apuntando al servicio.
7. `JWT_SECRET` definido.
8. `tsc --noEmit` y luego las pruebas.

## 3. Variables de entorno y Mercado Pago

- `JWT_SECRET`: muchos tests la inyectan con `vi.stubEnv` (por ejemplo `metricasAdmin.test.ts:32`, `validacionReservas.test.ts:82`). `integration.test.ts` no la define y la necesita para el login real (`backend/src/core/config/security.ts:12-20` lanza error si falta). En la CI debe definirse explícitamente.
- Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `BACKEND_URL`): los tests las inyectan con `stubEnv` (`preferenciaPago.test.ts:60-62`, `webhookPago.test.ts:96-97`). La CI no necesita secretos de Mercado Pago.
- El SDK está mockeado con `vi.mock("mercadopago")` y el adaptador interno `core/integraciones/mercadoPago.js` está mockeado en los tests que lo usan. Ningún test llama a la red de Mercado Pago.
- `FRONTEND_URL`, `LIMITE_*` y `TOPE_PENDIENTES_POR_TELEFONO` se inyectan donde hacen falta; los tests de límite dependen de los valores por defecto, así que la CI no debe definirlas.
- `.env.example` no se leyó (el entorno bloquea los archivos `.env`).

## 4. Node, lockfiles y scripts del frontend

- No hay `.nvmrc`, `.node-version` ni `engines`. `docs/operacion/desarrollo-local.md:11` deja la versión de Node como pendiente. El único dato es `backend/DockerFile:1,10` (`node:20-alpine`). Dependencias recientes (`vite ^8.2.2`, `eslint ^10.9.0`, `@types/node ^26`) probablemente exigen Node 20.19 o 22; es una inferencia sin verificar.
- Existen `backend/package-lock.json` y `frontend/package-lock.json`: `npm ci` es viable. No hay `package.json` en la raíz.
- Backend: `typescript ^7.0.2`; tipado con `npx tsc --noEmit` y `npm run build`.
- Frontend (`frontend/package.json:6-10`): `lint` es `eslint .` y `build` es `tsc -b && vite build`. Existe `frontend/eslint.config.js`. No se ejecutaron.
- `.github/` no existe.

## 5. Riesgos en un runner Ubuntu limpio

1. Pruebas sin gate que necesitan base (sección 1).
2. Dependencia de la semilla: sin `db seed`, `integration.test.ts` falla en el `beforeAll`.
3. Orden de ejecución: con `fileParallelism: false` no hay choques entre archivos, pero en un runner sin caché el orden de Vitest puede diferir del local. Hay que comprobar que ningún archivo dependa del orden ni de datos que dejó otro.
4. Reloj y fechas: varios tests usan `Date.now()` con desfase (el runner usa UTC, sin problema real). `concurrenciaReservas.test.ts:230` exige menos de 8000 ms, umbral que puede ser inestable. Fechas fijas como `2031-04-10` quedarán en el pasado dentro de unos años. `migracionReservaInvitado:271` usa `Math.random` y una espera de 10 ms (`:395`).
5. `bcrypt ^6` trae binarios para Linux x64; riesgo bajo. Las 12 rondas de hash hacen la semilla y el login algo lentos.
6. Mayúsculas y minúsculas: se desarrolla en Windows y Linux distingue. `forceConsistentCasingInFileNames: true` (`tsconfig.json:10`) ayuda a detectarlo en el `tsc` de la CI.
7. Prisma 5 y los índices manuales: `migrate deploy` en una base nueva no los borra.
8. `tsc --noEmit` tipa también la semilla y las pruebas; la última pasada local no tuvo errores.
9. `any` en `integration.test.ts:44` (`(c: any)`), contrario a la regla "cero any" de AGENTS.md. No rompe `tsc`.
10. Si hubiera varios jobs, cada uno necesita su propio servicio PostgreSQL.

## 6. Enfoques

### 6.1 Separación de pruebas

| Enfoque | Ventajas | Desventajas | Esfuerzo |
|---|---|---|---|
| A. Proyectos de Vitest (`unit` y `db` en `vitest.config.ts`) | Una sola configuración; cada proyecto fija su `include`; `npm test` puede correr ambos. | Hay que listar o nombrar qué archivos van a cada proyecto. | Medio |
| B. Dos archivos de configuración | Muy explícito. | Duplica configuración. | Medio |
| C. Patrones de nombre (`*.db.test.ts`) | Simple. | Obliga a renombrar 6 archivos y dividir los mixtos; choca con la convención actual. | Medio |
| D. Variable de entorno con `skipIf` en cada archivo | No toca la estructura. | Muchos archivos editados; fácil de olvidar. | Alto |

Cualquier enfoque exige resolver los 3 archivos sin gate: moverlos al grupo con base tal cual, o dividir `secretosJwt` y `rutasAdminReservas` y mockear Prisma en su parte sin base.

Recomendación: enfoque A, con `test:unit` (sin base), `test:db` (base descartable) y `test` (ambos).

### 6.2 CI

| Enfoque | Ventajas | Desventajas | Esfuerzo |
|---|---|---|---|
| A. Un solo job | Simple; un solo servicio PostgreSQL. | Fallos mezclados; sin paralelismo. | Bajo |
| B. Un job por proyecto (`backend` con PostgreSQL, `frontend` sin base) | Paralelo, aislado y con fallos separados; el job del frontend crecerá en `calidad-ci`. | Más YAML. | Bajo a medio |

Recomendación: dos jobs. En el de backend: `npm ci`, `prisma generate`, `tsc --noEmit`, `test:unit`, `migrate deploy`, `db seed` y `test:db`, para fallar rápido antes de usar la base. `actions/setup-node` con caché de npm para ambos lockfiles.

## 7. Decisiones pendientes del usuario

1. Versión de Node para la CI y si se fija en `.nvmrc` o `engines`.
2. Los 3 archivos sin gate: moverlos al grupo con base o dividirlos y mockear Prisma.
3. Enfoque de separación y nombres de los scripts (`test:unit` y `test:db`).
4. Semántica de `npm test`: correr ambos grupos o mantenerlo como hoy.
5. Disparador: solo `push` a `desarrollo`, o también `main` y `workflow_dispatch`.
6. Estructura de la CI (uno o dos jobs) y si se agrega `npm run build` del backend.
7. Versión de PostgreSQL del servicio y semilla en cada corrida.
8. Umbral de 8 s de `concurrenciaReservas.test.ts:230`.
9. Documentación a actualizar: skill `testing-backend`, `docs/operacion/desarrollo-local.md`, `openspec/config.yaml` y la regla de `/cerrar-sesion`.
10. `JWT_SECRET` ficticio en el YAML o secreto de repositorio.

## 8. Decisiones tomadas (2026-11-24)

- Los 3 archivos sin gate (`integration`, `secretosJwt` y `rutasAdminReservas`) pasan completos al grupo con base, sin modificar su contenido.
- Valores por defecto aceptados: proyectos de Vitest con `test:unit`, `test:db` y `test` (ambos grupos); dos jobs (`backend` con PostgreSQL 15 de servicio, migraciones y semilla, y `frontend` con `lint` y `build`); disparadores `push` a `desarrollo` y `workflow_dispatch`; versión de Node fijada en `.nvmrc` y elegida con una ejecución real; `JWT_SECRET` ficticio en el YAML; actualizar el skill `testing-backend`, `docs/operacion/desarrollo-local.md`, `openspec/config.yaml` y la regla de `/cerrar-sesion`.
