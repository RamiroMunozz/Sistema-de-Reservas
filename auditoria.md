# Auditoría de seguridad y arquitectura

**El sistema no está listo para producción.** De los 7 problemas críticos encontrados, 1 está corregido y 6 siguen abiertos. Los más graves son las reservas duplicadas, el webhook de Mercado Pago sin firma y los secretos JWT por defecto.

- **Fecha:** 2026-11-04
- **Rama:** `fix/security-audit` (`main` no se modificó)
- **Alcance:** backend, frontend, base de datos, Docker y dependencias

## Resultado por objetivo

| Objetivo | Resultado |
|---|---|
| Inyección SQL | Sin hallazgos. `src` no usa SQL crudo; todo pasa por Prisma |
| Gestión de JWT | **Crítico, abierto** (C4) |
| Firma de webhooks de Mercado Pago | **Crítico, abierto** (C3). La firma no se valida |
| Reservas duplicadas con Redis | **Crítico, abierto** (C1, C2). Redis no existe en el repositorio |
| Docker | Build del compose corregido; quedan malas prácticas (A7) |
| Kubernetes | No aplica: no hay manifiestos |
| Frontend | Es React, no Vue. Sin hallazgos críticos (A3, A4, sección Medios) |
| Backend Express | Sin rate limit, CORS abierto y validación incompleta (A1, A2) |

## Cómo leer los hallazgos

- **Verificado:** comprobado con un test o una ejecución.
- **Por lectura:** surge del código, pero el efecto no se ejecutó.

Todo hallazgo es "por lectura", salvo que diga lo contrario.

## Críticos abiertos

Ninguno se corrigió porque cambian la lógica central y requieren confirmación.

### C1. Reservas duplicadas por condición de carrera

- **Dónde:** `backend/src/modules/bookings/booking.service.ts:30-52` y `:195-213`.
- **Problema:** se consulta si hay solapamiento y después se inserta, sin transacción ni restricción en la base. Dos pedidos simultáneos pueden pasar ambos el control. `backend/docker/init.sql:2` instala `btree_gist`, pero ninguna migración crea una restricción `EXCLUDE`.
- **Estado de la prueba:** la carrera no se reprodujo.
- **Propuesta:** restricción `EXCLUDE` en PostgreSQL y responder 409 ante la violación.
- **Por qué no Redis:** un lock puede expirar o perderse en una caída, mientras que la restricción la garantiza la base. Además, Redis no figura en el stack de `AGENTS.md`.
- **Riesgo de la migración:** falla si ya existen solapamientos. Hay que detectarlos y resolverlos antes.

### C2. Reconfirmación sin control de solapamiento

- **Dónde:** `booking.service.ts:165` y `backend/src/modules/payments/payment.service.ts:75`.
- **Problema:** una reserva cancelada puede volver a `CONFIRMED` aunque el turno ya sea de otra persona.
- **Propuesta:** la restricción de C1 lo bloquea; hay que traducir ese error a una respuesta clara.

### C3. Webhook de Mercado Pago sin firma

- **Dónde:** `backend/src/modules/payments/payment.controller.ts:31-51`.
- **Problema:** no se valida la firma. No se puede inventar un pago, porque el estado se consulta a Mercado Pago, pero sí reenviar IDs reales para confirmar o cancelar reservas. Tampoco valida el monto ni evita procesar dos veces el mismo evento.
- **Propuesta:** validar `x-signature` con un secreto configurado, comparar el monto y hacer el procesamiento idempotente.

### C4. Secretos JWT por defecto

- **Dónde:** `backend/src/core/middlewares/auth.ts:23`, `backend/src/core/config/security.ts:6` y `docker-compose.yml:27`.
- **Problema:** si falta `JWT_SECRET`, cualquiera puede firmar un token ADMIN con `default_secret`. El compose además versiona un secreto fijo.
- **Propuesta:** un solo punto de verificación, sin valores por defecto, con arranque fallido si falta el secreto y algoritmo fijo en HS256.
- **Efecto:** habrá que definir `JWT_SECRET` antes de levantar el compose.

### C5. `create-preference` sin autenticación

- **Dónde:** `backend/src/modules/payments/payments.routes.ts:8`.
- **Problema:** cualquiera con un `bookingId` genera un cobro con el email de ese usuario. No hay control de dueño ni de estado de la reserva.
- **Propuesta:** exigir autenticación y que el usuario sea el dueño de una reserva pagable.

### C6. `notification_url` fija a un túnel público

- **Dónde:** `payment.service.ts:26`.
- **Problema:** las notificaciones van a un subdominio de `loca.lt`. En producción los pagos no actualizarían las reservas, y quien tome ese subdominio las recibiría.
- **Propuesta:** leer la URL de una variable de entorno y fallar si falta.

## Crítico corregido

**Rutas `/bookings/admin/*` sin control de rol.** Cualquier usuario logueado podía ver datos personales ajenos y cambiar el estado de cualquier reserva.

- **Commits:** `b02075e` y `24a9868`.
- **Verificado:** antes, un USER recibía 200, 500 y 400 en las tres rutas; ahora recibe 403. Sin token recibe 401.
- **Pruebas:** 10/10 en `backend/tests/rutasAdminReservas.test.ts`.
- **Revisiones:** aprobado por un verificador independiente, por el hook de GGA y por la revisión nativa de Gentle (lentes de riesgo y fiabilidad).

## Altos

| # | Problema | Dónde | Impacto |
|---|---|---|---|
| A1 | Sin rate limit en login y registro | `backend/src/modules/auth/auth.routes.ts:7-8` | Fuerza bruta de contraseñas y consumo de CPU por bcrypt |
| A2 | `booking.dto.ts` existe, pero el controller no lo usa | `booking.controller.ts:37-43` | Se aceptan fechas pasadas, cualquier duración y canchas inactivas |
| A3 | La reserva se crea `CONFIRMED` antes de pagar | `booking.service.ts:60`, `frontend/src/pages/BookingsPage.tsx:185-197` | Abandonar el checkout bloquea el turno, y el usuario lo ve "Confirmada" sin pagar |
| A4 | El panel llama a `GET /bookings`, que no existe | `frontend/src/pages/AdminDashboard.tsx:201` | "Todas las Reservas" muestra una lista vacía en lugar del error. Comprobado que la ruta no está definida |
| A5 | Métricas financieras incorrectas | `backend/src/modules/admin/admin.service.ts:70`, `:82-92` | Un turno `COMPLETED` deja de contar como ingreso, se filtra por fecha de creación y se suma dinero no cobrado |
| A6 | Seed destructivo con admin de contraseña versionada | `backend/prisma/seed.ts:10-18` | Ejecutarlo en producción borra todos los datos y deja un admin con contraseña pública |
| A7 | Docker con malas prácticas | Ver detalle abajo | Imagen de desarrollo en producción y errores de build ocultos |
| A8 | Dependencias vulnerables | Ver detalle abajo | 7 paquetes con avisos de `npm audit` |
| A9 | El README documenta mal una variable | `README.md:110` | Pide `MP_ACCESS_TOKEN`, pero el código lee `MERCADOPAGO_ACCESS_TOKEN`; el error aparece recién al pagar |

### Detalle de A7: Docker

- `backend/DockerFile:8`: `npm run build || true` oculta los errores de compilación.
- `backend/DockerFile:18`: la imagen final corre `npm run dev`. El frontend también usa el servidor de desarrollo.
- Los contenedores corren como root y usan `npm install` en lugar de `npm ci`.
- `docker-compose.yml`: sin healthchecks, `depends_on` no espera a que Postgres esté listo, Postgres queda expuesto con contraseña fija y las migraciones no se ejecutan al iniciar.
- Hay dos compose con versiones y credenciales distintas de Postgres (15 y 16).

### Detalle de A8: `npm audit --omit=dev`

| Proyecto | Paquete | Severidad | Directo |
|---|---|---|---|
| backend | `proxy-addr` | Crítica | No |
| backend | `zod` | Alta | Sí |
| backend | `body-parser` | Alta | No |
| backend | `qs` | Moderada | No |
| frontend | `vite` | Alta | Sí |
| frontend | `follow-redirects` | Alta | No |
| frontend | `source-map-js` | Alta | No |

`npm audit` indica que todos tienen corrección disponible. `app.ts` no configura `trust proxy`, por lo que `proxy-addr` probablemente no sea explotable hoy, pero conviene actualizarlo. No se aplicó ninguna actualización porque `package-lock.json` tiene cambios locales sin commitear.

## Medios

| Área | Problema | Dónde |
|---|---|---|
| Frontend | `ProtectedRoute` no se usa; `/admin` se renderiza vacío para cualquiera. No es escalada: el backend valida | `frontend/src/App.tsx:20-21` |
| Frontend | Un error de carga se muestra como datos: turnos "Libre" o $0 | `AdminDashboard.tsx:178-181`, `BookingsPage.tsx:69-71` |
| Frontend | Sin manejo de 401; la sesión muere sin aviso a los 15 minutos | `frontend/src/api/axios.ts:7` |
| Frontend | JWT en `localStorage`, expuesto si aparece un XSS. No se encontraron puntos de inyección HTML | `frontend/src/context/AuthContext.tsx:34` |
| Frontend | Fechas sin UTC, contra la regla de `AGENTS.md`; "hoy" salta de día desde las 21:00 en Argentina | `AdminDashboard.tsx:77`, `:812`, `BookingsPage.tsx:26`, `MyBookingsPage.tsx:119` |
| Frontend | Componente de unas 940 líneas con 24 `useState` | `AdminDashboard.tsx:57-996` |
| Frontend | Cancelar sin confirmación; un cliente puede cancelar un turno ya jugado | `AdminDashboard.tsx:636-642`, `booking.service.ts:96` |
| Frontend | Sin canchas no se puede crear la primera desde la UI | `AdminDashboard.tsx:144-146` |
| Backend | `CORS` abierto a cualquier origen | `backend/src/app.ts:14` |
| Backend | IDs sin validar y UUID inexistentes que terminan en 500 | `backend/src/core/middlewares/errorHandler.ts:12-28`, `backend/src/modules/courts/court.controller.ts:31` |
| Backend | `status` sin validar en el PATCH admin | `booking.controller.ts:130` |
| Backend | Los errores de Prisma pueden llegar al cliente en un 400 | `booking.controller.ts:46-51` |
| Backend | `.partial()` con `.default()` puede reactivar canchas al editarlas. Sale de leer la fuente de Zod, sin ejecutar | `backend/src/modules/admin/admin.dto.ts:9-13` |
| Backend | Sin cierre ordenado; un error de puerto igual registra "Servidor corriendo" | `backend/src/server.ts:13-16` |
| Backend | 3 instancias de `PrismaClient`, cada una con su pool | `booking.service.ts:3`, `payment.service.ts:4`, `backend/src/core/config/prisma.ts:3` |
| Backend | Consultas sin paginar; las métricas traen todas las reservas | `admin.service.ts:68-77` |
| Backend | Usos de `any` prohibidos por `AGENTS.md` | `backend/src/modules/courts/court.service.ts:10`, `admin.service.ts:15` |
| Pruebas | El test de 409 falla: el controller responde 400 ante cualquier error. Verificado con `npm test` | `backend/tests/integration.test.ts:103` |
| Pruebas | Los tests de creación escriben en la base real con un turno fijo y no limpian | `backend/tests/integration.test.ts:76-90` |

## Bajos

- `frontend/src/components/Navbar.tsx:62` muestra `user?.name`, pero el login devuelve `firstName` y `lastName`, así que el nombre queda vacío.
- `backend/src/modules/bookings/booking.service.ts:90` loguea IDs de usuario.
- `frontend/src/types/index.ts:3` no incluye `PENDING` ni `COMPLETED`.
- No hay `.env.example` en backend ni en frontend.
- El README está desactualizado: `bcryptjs`, React 18 y React Router v6 no coinciden con `package.json`. `AGENTS.md` también dice React 18, y la versión instalada es la 19.

## Plan de corrección recomendado

| Orden | Corrección | Hallazgos | Requiere |
|---|---|---|---|
| 1 | Eliminar secretos JWT por defecto | C4 | Confirmación; definir `JWT_SECRET` |
| 2 | Autenticar `create-preference` | C5 | Confirmación |
| 3 | Firmar el webhook y configurar `notification_url` | C3, C6 | Confirmación; secreto de Mercado Pago |
| 4 | Restricción `EXCLUDE` y respuesta 409 | C1, C2, test de 409 | Confirmación; revisar datos existentes |
| 5 | Validar con DTOs y agregar rate limit | A1, A2 | Confirmación; dependencia nueva |
| 6 | Reservas `PENDING` hasta el pago | A3 | Decisión de producto |
| 7 | Actualizar dependencias y endurecer Docker | A7, A8 | Commitear o descartar los lockfiles locales |

## Límites de esta auditoría

- **No se ejecutó ningún ataque.** Solo la falla de rutas admin se comprobó con pruebas.
- **Docker no se construyó:** `docker compose` no está disponible en este entorno. Los cambios del compose solo se validaron parseando el YAML.
- **`backend/.env` no se leyó.** Git no registra ningún `.env` agregado ni tokens con formato de Mercado Pago en su historial, pero eso no descarta otros secretos.
- **Tests de creación de reservas:** no se volvieron a correr, porque escriben en la base. `npm test` completo se ejecutó una vez, antes de las correcciones.
- **Dato de prueba en la base:** esa corrida dejó una reserva el 2026-11-20 a las 19:00 UTC para `jugador@example.com`. Sigue ahí y hará fallar el test de creación hasta que se borre.
- **Hallazgos del frontend y módulos restantes:** salen de una lectura delegada, con una verificación puntual de tres de ellos (`GET /bookings`, `ProtectedRoute` y el seed).
- **`specs/` no contiene archivos,** así que no se pudo contrastar el código con criterios de aceptación.

## Configuración de Gentle AI

| Componente | Estado |
|---|---|
| Gentle AI 4.3.1 | Activo. `gentle-ai doctor`: 10 correctos, 0 fallidos, 2 advertencias |
| ODD | Activo. Seguimiento en `odd/tasks/security-audit.md` |
| Claude Code | Activo y configurado en este repositorio |
| GGA | Activo como hook de pre-commit, con `AGENTS.md` como reglas |
| Revisión nativa | Activa. Con archivos sin trackear hay que usar `--untracked-scope exclude` |
| Pi | **Instalado, pero no funciona:** `pi -p` responde 401, "API key not valid" |

Las dos advertencias de `doctor` son binarios duplicados de `claude` y `gemini` en el `PATH`, uno de Linux y otro de Windows.
