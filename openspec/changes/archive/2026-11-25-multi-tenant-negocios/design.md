# Diseño: multi-tenant-negocios

Copia en Engram: `sdd/multi-tenant-negocios/design`. Entradas: `proposal.md` (decisiones D1 a D10, que no se reabren), `exploration.md`, ADR 0002, ADR 0003 y `AGENTS.md`. Las delta specs se escriben en paralelo: este diseño no depende de sus IDs y cita los requisitos vigentes. Verificado contra el código de `desarrollo` (2026-11-24): Prisma 5.22, Express 5, Zod 4.4, Vitest 4 y PostgreSQL 15.

> **Aclaración de alcance confirmada por el usuario:** en este cambio el `SUPER_ADMIN` solo crea un negocio y su dueño. No lee ni modifica canchas, complejos, reservas, pagos ni métricas de ningún negocio: todas las rutas del dueño exigen `DUENO` y responden 403 al `SUPER_ADMIN`.

## Enfoque técnico

- **Aislamiento por columna (enfoque B, D1):** tabla `negocios`; `complexes.negocio_id` obligatorio (fuente de verdad); `bookings.negocio_id` obligatorio y desnormalizado; `users.negocio_id` opcional, solo para el dueño.
- **Coherencia de `Booking.negocioId`:** se fija en un único punto de la aplicación, `validarTurnoReservable`, y la base la verifica con un trigger (decisión 2).
- **Negocio por solicitud:**
  - dueño: el negocio viaja como claim firmado del JWT (decisión 1);
  - público y jugador en el catálogo: por slug, en `/api/v1/negocios/:slug/...` (decisión 3);
  - rutas por token y webhook: por la reserva, sin cambios.
- **Pertenencia en servicios:** todo servicio del dueño recibe `idNegocio` como primer parámetro. Las búsquedas por id combinan el id con el negocio mediante un módulo compartido (`pertenencia.ts`), de modo que un recurso ajeno es indistinguible de uno inexistente (decisión 4).
- **Roles:** renombre del enum (`USER` → `JUGADOR`, `ADMIN` → `DUENO`) y alta de `SUPER_ADMIN`. El payload del JWT se valida con Zod, lo que rechaza los tokens con roles viejos y elimina el `as unknown as JwtPayload` de `security.ts:47` (decisión 1).
- **Migraciones en dos pasos con SQL revisado a mano**, sin tocar `bookings_sin_solapamiento` (decisión 6).
- **Capas según `AGENTS.md` y `openspec/config.yaml`:**
  - los controladores solo leen `req`, validan con Zod y eligen el código de estado;
  - la resolución del slug y toda consulta a Prisma van en servicios;
  - los middlewares solo adaptan HTTP y llaman al servicio;
  - sin `any`; UTC sin cambios.

## Decisiones de arquitectura

### Decisión 1: el negocio del dueño viaja en el JWT y el payload se valida con Zod

**Elección:**

- El token de un `DUENO` lleva el claim `negocioId`; los de `JUGADOR` y `SUPER_ADMIN` no lo llevan.
- `JwtPayload` pasa a ser una unión discriminada por `role` (ver "Interfaces").
- `verifyAccessToken` valida el payload decodificado con un esquema Zod (`payloadJwtSchema`) en lugar de `as unknown as JwtPayload`. Un token con `role` `USER` o `ADMIN`, o un `DUENO` sin `negocioId` con formato UUID, no pasa la validación: `authenticate` responde 401 "Token inválido o expirado." (el mismo mensaje de hoy).
- `AuthService.login` y `register` arman el payload con una función `armarPayloadJwt(usuario)` a partir de `User.role` y `User.negocioId`.
- El middleware `asignarNegocioDelDueno` (nuevo, `core/middlewares/negocio.ts`) toma el claim y lo deja en `req.idNegocio`. Las rutas del dueño usan la cadena `soloDueno = [authenticate, requireRole(["DUENO"]), asignarNegocioDelDueno]`.

**Alternativas consideradas:**

- **Consultar la base en cada solicitud del dueño** (`user.findUnique` con su negocio y `activo`). Ventaja: refleja al instante una suspensión o un cambio de dueño. Se descarta para este cambio:
  - En N.º 5 el negocio de un dueño no puede cambiar: no hay edición de negocios, cambio de dueño ni gestión de `activo` (todo es N.º 9).
  - Agrega una consulta por solicitud.
  - Obliga a simular `prisma.user` en cada prueba unitaria de rutas del dueño. Hoy esas pruebas simulan Prisma con una forma mínima (por ejemplo `depositPercent.test.ts:11-13` solo define `complex.findUnique` y `complex.update`) y firman el token con `jwt.sign` sin tocar la base (`rutasAdminReservas.test.ts:11-12`).
- **Mantener el cast `as unknown as JwtPayload`.** Se descarta: con roles renombrados, un token viejo con `ADMIN` pasaría el cast y fallaría recién en `requireRole` con un 403 confuso. La validación con Zod da un 401 limpio y cierra una deuda previa que este cambio sí exige tocar.
- **`AsyncLocalStorage` con el negocio implícito.** Se descarta: oculta la dependencia y hace fácil olvidar el filtro en un servicio nuevo. El parámetro explícito obliga a pasarlo.

**Justificación:**

- La firma HS256 impide falsificar el claim.
- Los tokens duran 15 minutos: cualquier cambio futuro de dueño o de `activo` (N.º 9) tendría como máximo 15 minutos de desfase.
- `asignarNegocioDelDueno` es la costura única: si N.º 9 necesita suspensión inmediata del panel, agrega ahí una consulta a la base sin tocar los servicios.

**Efecto sobre los tokens vigentes:**

- Al desplegar la entrega 2, todo token emitido antes deja de ser válido: tiene `USER` o `ADMIN`, o un `ADMIN` sin `negocioId`. El usuario recibe 401 y vuelve a iniciar sesión.
- El frontend descarta en la misma entrega una sesión guardada con un rol desconocido (`AuthContext.tsx`).
- Se acepta el nuevo inicio de sesión (riesgo ya aceptado en la propuesta).

### Decisión 2: coherencia de `Booking.negocioId`, en la aplicación y verificada por un trigger

**Elección:**

- **Aplicación:** `validarTurnoReservable` es el único punto que obtiene el negocio de la cancha (`court → complex → negocioId`) y lo devuelve. Los tres caminos de creación (`createBooking`, `createAdminBooking` y `ReservaInvitadoService.crear`) escriben `negocioId` con ese valor, nunca con un dato del cliente.
- **Base:** trigger `bookings_negocio_coherente` (`BEFORE INSERT OR UPDATE OF court_id, negocio_id ON bookings`). Rechaza con `check_violation` toda fila cuyo `negocio_id` no coincida con el negocio del complejo de su cancha. El SQL va en "Migración / despliegue".
- `updateCourt` solo acepta un `complexId` nuevo si es del negocio del dueño (decisión 4). Así una cancha nunca cambia de negocio, y las reservas existentes siguen coherentes.

**Alternativas consideradas:**

- **Solo aplicación, con pruebas.** Es suficiente hoy, porque hay tres caminos de creación y todos pasan por `validarTurnoReservable`. Se descarta como única garantía porque N.º 6 y N.º 7 agregan caminos de escritura sobre reservas, y una incoherencia es una fuga entre negocios (impacto alto).
- **Claves foráneas compuestas** (`bookings(court_id, negocio_id) → courts(id, negocio_id)`). Exigen `negocio_id` también en `courts`, con su propia coherencia con `complexes`. Es el enfoque C, que la propuesta deja fuera del alcance.
- **`CHECK` con subconsulta.** PostgreSQL no lo permite.

**Justificación:**

- El trigger cuesta una búsqueda por clave primaria en cada alta, dentro de la transacción que ya tiene el bloqueo de la cancha: costo despreciable.
- No toca `bookings_sin_solapamiento`.
- Prisma 5 no representa ni compara funciones ni triggers en `migrate diff`, a diferencia de los índices que no modela. Por eso no propone borrarlo. **Supuesto a validar** en la base descartable (tarea de la entrega 1): después de aplicar la migración, `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <descartable> --script` no debe proponer `DROP` alguno. Si lo propusiera, se cae a "solo aplicación" y se registra.
- **Límite conocido:** mover un complejo de negocio (N.º 9) rompería la coherencia de sus reservas. Ese cambio deberá actualizar `bookings.negocio_id` en la misma transacción, o prohibir la operación.

### Decisión 3: mapa de rutas

**Elección:** las rutas públicas del catálogo pasan a colgar del slug. Las rutas del dueño, del jugador, por token y el webhook conservan su ruta y toman el negocio de la sesión o de la reserva.

| Ruta actual | Ruta nueva o destino | Negocio de la solicitud | Entrega |
|---|---|---|---|
| (no existe) | `GET /api/v1/negocios/:slug` → `{ nombre, slug }` | Slug | 5 |
| `GET /api/v1/courts` | `GET /api/v1/negocios/:slug/courts` | Slug | 5 |
| `GET /api/v1/courts/:id` | `GET /api/v1/negocios/:slug/courts/:id` | Slug | 5 |
| `GET /api/v1/courts/:id/availability` | `GET /api/v1/negocios/:slug/courts/:id/availability` | Slug | 5 |
| `GET /api/v1/bookings/availability` | `GET /api/v1/negocios/:slug/bookings/availability` | Slug | 5 |
| `POST /api/v1/public/bookings` | `POST /api/v1/negocios/:slug/bookings` (el limitador va antes del resolutor, RES-030) | Slug | 5 |
| (no existe) | `POST /api/v1/plataforma/negocios` (solo `SUPER_ADMIN`) | No aplica | 4 |
| (no existe) | `GET /api/v1/admin/complexes` (solo `DUENO`): complejos propios con `depositPercent` y canchas activas | JWT | 3a |
| `/api/v1/admin/*` | Sin cambio de ruta; `DUENO` | JWT | 2 y 3a |
| `/api/v1/bookings/admin/*` | Sin cambio de ruta; `DUENO` | JWT | 2 y 3a/3b |
| `POST /api/v1/payments/admin/payments/:paymentId/refund` | Sin cambio de ruta; `DUENO` | JWT | 2 y 3b |
| `POST /api/v1/bookings` (jugador) | Sin cambio de ruta | El de la cancha; debe estar activo | 3b |
| `GET /api/v1/bookings/my-bookings`, `PATCH /api/v1/bookings/:id/cancel` | Sin cambio; la lista incluye `negocio: { nombre, slug }` | Cuenta global (D8) | 3b |
| `POST /api/v1/payments/create-preference` | Sin cambio | El de la reserva | No aplica |
| `/api/v1/public/bookings/:token`, `/cancel`, `/payment` | Sin cambio | El de la reserva (token único global) | No aplica |
| `POST /api/v1/payments/webhook` | Sin cambio | El de la reserva | No aplica |

- **Reserva del jugador sin slug:** `POST /bookings` conserva su ruta. El negocio sale de la cancha en el servidor y se exige que esté activo, así que el cliente no puede imponer un negocio. Mover la ruta bajo el slug no agrega aislamiento, porque la reserva del jugador es de su cuenta global, y obligaría a cambiar `BookingsPage` y `preferenciaPago` sin beneficio.
- **Compatibilidad durante las entregas:**
  - En la entrega 5, las rutas públicas viejas (`/courts/*`, `/bookings/availability` y `POST /public/bookings`) quedan montadas con `resolverNegocioFijo("principal")`. Usan los mismos controladores que las rutas por slug y se comportan exactamente como hoy, porque todos los datos existentes son de `principal`. Ya no mezclan catálogos aunque la entrega 4 haya creado otro negocio.
  - La entrega 6 cambia el frontend a las rutas por slug y retira esos montajes.
  - Las rutas del dueño no cambian de ruta: el panel sigue funcionando en todas las entregas.
  - Los roles del frontend se actualizan en la entrega 2 junto con el backend (decisión 8).
- **Slugs:**
  - Formato `^[a-z0-9]+(?:-[a-z0-9]+)*$`, de 3 a 40 caracteres (NEG-002).
  - Reservados (`backend/src/modules/negocios/slug.ts`, constante `SLUGS_RESERVADOS`): `admin`, `login`, `reserva`, `mis-reservas`, `registro`, `api`, `assets`, `plataforma`, `negocios`, `public`, `health`, `super-admin`.
  - El resolutor responde 404 sin consultar la base si el slug no cumple el formato (mismo patrón que `TOKEN_VALIDO` en `reservaInvitado.service.ts:231`).
  - El alta rechaza los slugs reservados (400) y los repetidos (409).
- **Frontend:**
  - Ruta `/:slug` → `BookingsPage` con el slug de `useParams`.
  - React Router da prioridad a los segmentos estáticos (`/login`, `/admin`, `/mis-reservas` y `/reserva/:codigo`) sobre `/:slug`. Por eso el frontend no necesita repetir la lista de reservados: la garantía está en el alta del backend.
  - La raíz `/` redirige a `/principal` (decisión del usuario del 2026-11-24).

**Alternativas consideradas:**

- **Encabezado `X-Negocio`.** Se descarta: no da una URL compartible por negocio (ADR 0002 pide `/<slug>`) y es fácil de omitir en el cliente.
- **Retirar las rutas viejas en la entrega 5.** Se descarta: dejaría el frontend roto en `desarrollo` hasta la entrega 6.
- **Mantener las rutas viejas globales hasta la entrega 6.** Se descarta: después de la entrega 4 mezclarían canchas de dos negocios.

**Justificación:** el slug en la ruta es la forma pedida por D2 y ADR 0002. Con `resolverNegocioFijo`, el traspaso entre entregas cuesta pocas líneas y no duplica controladores.

### Decisión 4: resolución del negocio y pertenencia compartida

**Elección:**

- **`req.idNegocio`** (nuevo en `core/types/express.d.ts`) lo fija uno de dos middlewares; nunca ambos en la misma ruta:
  - `resolverNegocio` (slug de `req.params.slug`) y `resolverNegocioFijo(slug)`, creados con una misma fábrica `crearResolverNegocio(obtenerSlug)`. Validan el formato, llaman a `NegocioService.resolverPorSlug(slug)` (`findFirst({ where: { slug, activo: true } })`) y fijan `req.idNegocio` y `req.negocio` (`{ id, nombre, slug }`). Si no hay negocio, responden con `NotFoundError("Negocio no encontrado.")`, el mismo mensaje para un slug inexistente o un negocio inactivo (D9).
  - `asignarNegocioDelDueno` (claim del JWT, decisión 1).
- **`obtenerIdNegocio(req)`:** los controladores leen el negocio con este ayudante. Si falta, lanza un `Error` de programación (500), nunca un 404, para que un montaje olvidado se vea en las pruebas.
- **Pertenencia** (`backend/src/modules/negocios/pertenencia.ts`): funciones que reciben `idNegocio`, el id y un cliente opcional (`prisma` o la transacción). Buscan con `findFirst` y el filtro de negocio en el mismo `where` y lanzan el `NotFoundError` que la operación ya usa para un recurso inexistente. Así un recurso ajeno es indistinguible de uno inexistente.

| Función | Consulta | Error |
|---|---|---|
| `buscarComplejoPropio` | `complex.findFirst({ where: { id, negocioId } })` | El mensaje de 404 de cada operación |
| `buscarCanchaPropia` | `court.findFirst({ where: { id, complex: { negocioId } } })` | 404 "Cancha no encontrada" |
| `buscarReservaPropia` | `booking.findFirst({ where: { id, negocioId } })` | 404 "Reserva no encontrada." |
| `buscarPagoPropio` | `bookingPayment.findFirst({ where: { id, booking: { negocioId } } })` | 404 "Pago no encontrado." |

- **Listados:** filtran con `where: { negocioId: idNegocio, ... }` directo sobre `Booking`, gracias a la desnormalización.

**Dónde va cada verificación** (operaciones de la sección 3 de la exploración):

| Operación (archivo actual) | Verificación | Respuesta ante un recurso ajeno |
|---|---|---|
| `AdminService.createCourt` (`admin.service.ts:13`) | `buscarComplejoPropio(dto.complexId)` | 404 "El complejo especificado no existe" (igual que inexistente) |
| `AdminService.updateCourt` (`:35`) | `buscarCanchaPropia(id)` y, si llega `complexId`, `buscarComplejoPropio` | 404 "Cancha no encontrada" o el 404 del complejo |
| `getDepositPercent` y `updateDepositPercent` (`:50`, `:63`) | `buscarComplejoPropio(id)` | 404 "Complejo no encontrado" |
| `getMetrics` (`:74`) | `where.negocioId` | Solo datos propios |
| `getAllBookingsForAdmin` (`booking.service.ts:210`) y `getDailyBookingsForAdmin` (`:222`) | `where.negocioId` | Solo datos propios |
| `updateBookingStatus` (`:244`) | `buscarReservaPropia` fuera del bloqueo (para obtener `courtId`) y relectura con `negocioId` dentro de él | 404 "Reserva no encontrada." |
| `createAdminBooking` (`:303`) | `validarTurnoReservable(..., idNegocio)` | 400 "La cancha no existe." (igual que inexistente, RES vigente línea 71) |
| `validarTurnoReservable` (`:48`) | `court.findFirst` con `complex: { negocioId?, negocio: { activo: true } }`; devuelve `idNegocio` y `depositPercent` | 400 "La cancha no existe." |
| `createBooking` del jugador (`:78`) | `validarTurnoReservable(..., null)`: cualquier negocio activo | 400 "La cancha no existe." |
| `getUserBookings` (`:106`) | Sin filtro de negocio (cuenta global, D8); incluye `negocio: { select: { nombre, slug } }` | No aplica |
| `cancelBooking` del jugador (`:118`) | Sin cambios: verifica `userId` | No aplica |
| `getOccupiedSlots` (`:184`) | `where: { courtId, negocioId }` | `[]`, igual que una cancha inexistente hoy |
| `CourtService.getAllCourts`, `getCourtById` y `getCourtAvailability` (`court.service.ts:11`, `:40`, `:60`) | `complex: { negocioId }` | Lista propia; 404 con el mensaje actual |
| `PaymentService.reembolsarPago` (`payment.service.ts:108`) | `buscarPagoPropio` | 404 "Pago no encontrado." |
| `createPaymentPreference` (`:50`) | Sin cambios: verifica `userId` | No aplica |
| Webhook (`:201`) | Sin cambios: la reserva sale de `external_reference` | No aplica |
| `ReservaInvitadoService.crear` (`reservaInvitado.service.ts:52`) | `validarTurnoReservable(..., idNegocio)`; usa el `depositPercent` devuelto y quita la consulta extra al complejo (`:61-64`) | 400 "La cancha no existe." |
| `bloquearTelefono` (`bloqueoCancha.ts:37`) | Clave `pg_advisory_xact_lock(2, hashtext(idNegocio \|\| ':' \|\| telefono))` y conteo con `negocioId` (D5) | No aplica |
| Rutas por token (`reservaInvitado.service.ts:230`) | Sin cambios: el token es único global | No aplica |
| `barridoVencidas.ts` | Sin cambios: operación de plataforma | No aplica |

**Principio para las especificaciones:** "ajeno ≡ inexistente".

- Un id del camino (`:id` o `:paymentId`) de otro negocio responde 404.
- Un id del cuerpo (`complexId` o `courtId`) de otro negocio responde exactamente lo mismo que un id inexistente en esa operación: 404 en `createCourt` y 400 "La cancha no existe." al reservar.
- Si la fase de specs decide unificar el caso del cuerpo en 404, también cambia la respuesta para el id inexistente (RES vigente, línea 71), para no distinguirlos.

**Alternativas consideradas:**

- **Extensión de Prisma (`$extends`) que inyecte el filtro.** Se descarta: es implícita, no cubre `$executeRaw` y complica las simulaciones de las pruebas unitarias.
- **Middleware que cargue el recurso y verifique la pertenencia.** Se descarta: lleva la consulta a Prisma fuera de los servicios, contra `AGENTS.md`.
- **Responder 403 ante un recurso ajeno.** Se descarta: revela que el id existe.

**Justificación:** un único módulo pequeño, parámetros explícitos y el filtro dentro del mismo `where` (sin leer primero y comparar después) cierran la fuga por id sin cambiar la forma de los servicios.

### Decisión 5: selección del complejo en el panel del dueño

**Elección:**

- **Backend:** `GET /api/v1/admin/complexes` (entrega 3a) devuelve los complejos del negocio del dueño, ordenados por `createdAt`, con `id`, `name`, `address`, `depositPercent` y sus canchas activas (los mismos campos que hoy muestra el panel desde `/courts`).
- **Frontend** (entrega 6):
  - `AdminDashboard` carga ese recurso en lugar de `/courts` (`AdminDashboard.tsx:326`).
  - Guarda `idComplejoSeleccionado` (por defecto, el primero) y muestra un selector solo si hay más de un complejo.
  - La seña (`PATCH /admin/complexes/:id/deposit-percent`) y el alta de cancha (`complexId`) usan el complejo seleccionado.
  - El selector de cancha de la reserva manual lista las canchas de todos los complejos propios, agrupadas por complejo.
- El negocio `principal` tiene un solo complejo, así que el panel se ve igual que hoy.

**Alternativas consideradas:**

- **Seguir tomando `courts[0].complexId`.** Se descarta: con varios complejos edita siempre el primero y, sin canchas, no hay complejo.
- **Usar el catálogo público `/negocios/:slug/courts`.** Se descarta: el dueño no necesita conocer su slug para operar, y el catálogo público no es la fuente del panel.

**Justificación:** la seña es por complejo (`Complex.depositPercent`, ADM-015). El dueño necesita elegir el complejo de forma explícita, y el backend verifica que sea propio.

### Decisión 6: secuencia de migraciones

**Elección:** dos migraciones, generadas con `prisma migrate diff` (`migrate dev --create-only` no corre en una terminal no interactiva, según la bitácora del 2026-11-18) y editadas a mano.

- **M1 `20261125120000_negocios`** (entrega 1), en una transacción:
  1. `CREATE TABLE "negocios"` (id, nombre, slug único, activo con valor por defecto `true`, created_at).
  2. `INSERT` de "Negocio principal" (`principal`) con `gen_random_uuid()`.
  3. `ADD COLUMN "negocio_id" UUID` nulable en `complexes`, `bookings` y `users`.
  4. `UPDATE complexes` al negocio `principal`. `UPDATE bookings` desde el complejo de su cancha. `UPDATE users` solo donde `role = 'ADMIN'`.
  5. `SET NOT NULL` en `complexes.negocio_id` y `bookings.negocio_id`.
  6. Claves foráneas `ON DELETE RESTRICT` hacia `negocios`. Índices `complexes(negocio_id)` y `bookings(negocio_id, start_time)`. Reemplazo de `bookings_guest_phone_status_idx` por `bookings(negocio_id, guest_phone, status)`. Todos modelados en Prisma.
  7. Restricción manual `users_un_dueno_por_negocio`: `EXCLUDE USING btree ("negocio_id" WITH =) WHERE ("negocio_id" IS NOT NULL)`. Cumple D10 (unicidad parcial garantizada por la base, en SQL manual). Es una restricción y no un `CREATE UNIQUE INDEX` suelto: Prisma 5 borra los índices que no modela pero no las restricciones, el mismo patrón de `booking_payments_un_pago_valido`. El predicado no usa literales del enum, así que no depende del renombre de M2.
  8. Función y trigger `bookings_negocio_coherente` (decisión 2).
- **M2 `20261125120100_roles_negocio`** (entrega 2):
  1. `ALTER TYPE "Role" RENAME VALUE 'USER' TO 'JUGADOR'` y `RENAME VALUE 'ADMIN' TO 'DUENO'`. El renombre conserva el OID: las filas y el valor por defecto de `users.role` pasan solos al nombre nuevo.
  2. `ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN'`, sin usar el literal en esta migración.
  3. `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'JUGADOR'` (lo emite Prisma; es inocuo).
  4. Restricción manual `users_negocio_segun_rol`: `CHECK (("role" = 'DUENO') = ("negocio_id" IS NOT NULL))`. Usa un valor renombrado, no uno agregado con `ADD VALUE`, así que PostgreSQL lo permite en la misma transacción. **Supuesto a validar** en la base descartable; si fallara, la restricción pasa a una tercera migración `20261125120200_roles_negocio_check`.
- La primera cuenta `SUPER_ADMIN` la crea la semilla, que corre después de confirmadas las migraciones.

**Alternativas consideradas:**

- **Una sola migración con el renombre.** Se descarta: mezcla el cambio de datos (entrega 1, sin cambios de comportamiento) con el de roles, que rompe los tokens y los fixtures. Las entregas pierden independencia.
- **Recrear el enum `Role`.** Se descarta: reescribe `users` y no aporta nada frente a `RENAME VALUE`, disponible desde PostgreSQL 10.
- **`negocioId @unique` en Prisma.** Es equivalente porque solo el dueño tiene negocio, pero se descarta porque D10 fija el índice parcial en SQL manual.

**Justificación:**

- Las columnas nacen nulables y se completan antes de `NOT NULL`: no hay ventana con datos inválidos dentro de la transacción.
- Si la base de desarrollo tuviera más de una cuenta `ADMIN`, M1 falla al crear `users_un_dueno_por_negocio` y se revierte entera. Es el comportamiento buscado: el dato real se revisa a mano, sin elegir un dueño en silencio.
- La revisión manual rechaza cualquier `DROP` que proponga Prisma de `bookings_sin_solapamiento`, `bookings_horario_valido`, `bookings_titular_valido`, `complexes_porcentaje_sena_valido`, las restricciones de `booking_payments` y las nuevas (skill `prisma-migraciones`).

### Decisión 7: pruebas de aislamiento con dos negocios en el proyecto `db`

**Elección:**

- **Ayudante** `backend/tests/ayudantes/negociosDePrueba.ts` (no termina en `.test.ts`, así que Vitest no lo toma como prueba):
  - `crearNegocioDePrueba(sufijo)` crea con Prisma un negocio con slug único, un complejo, una cancha con horario, un dueño y, opcionalmente, una reserva con un pago. Devuelve los ids.
  - `firmarToken(rol, negocioId?)` firma con el secreto de prueba.
  - `borrarNegocioDePrueba(ids)` limpia en orden: pagos, reservas, horarios, canchas, complejos, usuarios y negocio.
- **Una prueba "ajeno → 404" por operación de la tabla de la decisión 4:** el dueño A opera sobre un id de B, y las listas de A no contienen datos de B. Cada prueba verifica además que el recurso de B no cambió.
- Las pruebas con base usan `describe.skipIf(!DATABASE_URL_PRUEBA)` y se registran en `ARCHIVOS_CON_BASE`. La prueba de control lo exige.
- Las pruebas unitarias (simulando Prisma) cubren lo que no necesita la base:
  - la validación del payload JWT;
  - la matriz de roles por ruta;
  - el formato y la reserva de slugs;
  - que `bloquearTelefono` cuente con `negocioId`.

| Archivo de prueba | Proyecto | Entrega | Cubre |
|---|---|---|---|
| `tests/migracionNegocios.test.ts` | `db` | 1 y 2 | Columnas `NOT NULL`; trigger que rechaza una reserva incoherente; `users_un_dueno_por_negocio` que rechaza un segundo dueño; `users_negocio_segun_rol` (entrega 2) |
| `tests/payloadJwt.test.ts` | `unit` | 2 | Tokens con `USER` o `ADMIN` → 401; `DUENO` sin `negocioId` → 401; `JUGADOR` en ruta de dueño → 403; `SUPER_ADMIN` en rutas de dueño → 403 |
| `tests/aislamientoAdmin.test.ts` | `db` | 3a | Canchas, seña, métricas, listado, agenda y `GET /admin/complexes` |
| `tests/aislamientoReservasPagos.test.ts` | `db` | 3b | Cambio de estado, creación por el dueño, reembolso, jugador en negocio inactivo y "Mis reservas" con negocio |
| `tests/slugNegocio.test.ts` | `unit` | 4 | Formato, longitud y reservados |
| `tests/altaNegocio.test.ts` | `db` | 4 | Alta atómica; 400, 409 de slug y 409 de email; 403 para `DUENO` y `JUGADOR`; contraseña sin exponer |
| `tests/negociosPorSlug.test.ts` | `db` | 5 | 404 por slug inexistente, inactivo o mal formado; catálogo, disponibilidad y alta de invitado solo con canchas del slug; tope por teléfono por negocio |

**Pruebas existentes que cambian:**

| Entrega | Archivos | Cambio |
|---|---|---|
| 1 | `concurrenciaReservas`, `liberarAlCrearReservaBase`, `migracionReservaInvitado` (SQL directo), `integration` y `rutasAdminReservas` | Fixtures con `negocioId` coherente |
| 1 | `validacionReservas`, `liberarAlCrearReserva`, `reservaInvitadoCrear` y `cancelacionBajoBloqueo` | Simulaciones que devuelven la cancha con su `complex` |
| 2 | Los 13 archivos con roles de la exploración | `"USER"` → `"JUGADOR"`, `"ADMIN"` → `"DUENO"` con `negocioId` |
| 3a | `depositPercent`, `metricasAdmin` y `validacionCanchas` | `findUnique` → `findFirst` en las simulaciones |
| 3b | `reembolsoPago`, `validacionReservas` y `respuestasListaBlanca` | Simulaciones con negocio |
| 5 | `disponibilidad`, `reservaInvitadoCrear`, `limitadorCreacionRuta` y `datosInvitado` | Rutas por slug y simulación de `negocio.findFirst` |

**Alternativas consideradas:**

- **Verificar el `where` en pruebas unitarias con Prisma simulado.** Se descarta como prueba principal: comprueba la forma de la consulta, no el aislamiento real. Se usa solo para `bloquearTelefono`, cuya clave de bloqueo no es observable de otro modo.

**Justificación:** el riesgo principal (fuga entre negocios) solo se prueba de verdad contra la base, con dos negocios reales.

### Decisión 8: roles en el frontend en la misma entrega que el backend

**Elección:** la entrega 2 incluye el cambio mínimo de roles en el frontend:

- `types/index.ts:119`: `role: "SUPER_ADMIN" | "DUENO" | "JUGADOR"`.
- `ProtectedRoute.tsx:7` y `App.tsx:34`: `requiredRole="DUENO"`.
- `Navbar.tsx:15`: `isDueno`.
- `AuthContext.tsx`: descarta la sesión guardada si su rol no está en la lista.

El resto del frontend (slug, panel con complejos y negocio en "Mis reservas") queda en la entrega 6.

**Alternativa considerada:** todo el frontend en la entrega 6. Se descarta: entre la entrega 2 y la 6 el dueño no podría entrar a `/admin`, porque el backend devolvería `DUENO` y el frontend esperaría `ADMIN`.

**Justificación:** cada entrega deja `desarrollo` usable.

## Flujo de datos

```
Público / jugador (catálogo)
  GET /api/v1/negocios/:slug/courts
     │
     ▼
  resolverNegocio ──► NegocioService.resolverPorSlug ──► negocios (slug, activo)
     │  404 genérico si no hay negocio activo
     ▼  req.idNegocio, req.negocio
  CourtController ──► CourtService.getAllCourts(idNegocio, filtros)
                           where: { isActive, complex: { negocioId } }

Dueño
  PATCH /api/v1/bookings/admin/:id/status   (Bearer JWT { userId, role: DUENO, negocioId })
     │
     ▼
  authenticate (Zod) ─► requireRole(["DUENO"]) ─► asignarNegocioDelDueno ─► req.idNegocio
     │
     ▼
  BookingController ──► BookingService.updateBookingStatus(idNegocio, id, status)
                           buscarReservaPropia(idNegocio, id)  ──► 404 si es ajena
                           conBloqueoDeCancha(courtId) ─► relectura con negocioId ─► update

Alta de reserva (los tres caminos)
  validarTurnoReservable(courtId, inicio, fin, idNegocio | null)
     court.findFirst({ id, complex: { negocioId?, negocio: { activo: true } } })
     └─► { court, start, end, idNegocio, depositPercent }
  conBloqueoDeCancha(courtId)
     [invitado] bloquearTelefono(tx, idNegocio, telefono)   tope por negocio (D5)
     booking.create({ ..., negocioId: idNegocio })
        └─► trigger bookings_negocio_coherente (verifica cancha → complejo → negocio)

Plataforma
  POST /api/v1/plataforma/negocios  (SUPER_ADMIN)
     └─► NegocioService.crearConDueno: $transaction { negocio.create ; user.create(DUENO, negocioId) }
```

## Cambios de archivos

| Archivo | Acción | Descripción | Entrega |
|---|---|---|---|
| `backend/prisma/schema.prisma` | Modificar | Modelo `Negocio`; `negocioId` y relación en `Complex`, `Booking` y `User`; índices; comentarios de las restricciones manuales nuevas; enum `Role` (entrega 2) | 1, 2 |
| `backend/prisma/migrations/20261125120000_negocios/migration.sql` | Crear | M1 | 1 |
| `backend/prisma/migrations/20261125120100_roles_negocio/migration.sql` | Crear | M2 | 2 |
| `backend/prisma/seed.ts` | Modificar | Negocio `principal`, complejo asignado y dueño (entrega 1); roles nuevos y `SUPER_ADMIN` (entrega 2); borra `negocios` al limpiar | 1, 2 |
| `backend/src/modules/bookings/booking.service.ts` | Modificar | `validarTurnoReservable` con `idNegocio` y negocio activo; `negocioId` al crear (entrega 1); filtros y pertenencia (entregas 3a y 3b); negocio en `getUserBookings` y `getOccupiedSlots` (entregas 3b y 5) | 1, 3a, 3b, 5 |
| `backend/src/modules/public/reservaInvitado.service.ts` | Modificar | `negocioId` al crear (entrega 1); `crear(idNegocio, datos)` y `depositPercent` de `validarTurnoReservable` (entrega 5) | 1, 5 |
| `backend/src/modules/bookings/vistaAdmin.ts` | Modificar | Agregar `"negocioId"` al `Omit` de `VistaReservaAdmin`: la lista blanca no lo expone | 1 |
| `backend/src/core/config/security.ts` | Modificar | `JwtPayload` como unión, `payloadJwtSchema` y `armarPayloadJwt`; sin cast | 2 |
| `backend/src/core/types/express.d.ts` | Modificar | `idNegocio?: string` (entrega 2) y `negocio?: NegocioPublico` (entrega 5) | 2, 5 |
| `backend/src/core/middlewares/role.middleware.ts` | Modificar | `requireRole(roles: readonly Rol[])` tipado | 2 |
| `backend/src/core/middlewares/negocio.ts` | Crear | `asignarNegocioDelDueno` y `obtenerIdNegocio` (entrega 2); `crearResolverNegocio`, `resolverNegocio` y `resolverNegocioFijo` (entrega 5) | 2, 5 |
| `backend/src/modules/auth/auth.service.ts` | Modificar | Payload con `armarPayloadJwt`; `negocioId` en la selección | 2 |
| `backend/src/modules/admin/admin.routes.ts`, `bookings/booking.routes.ts` y `payments/payments.routes.ts` | Modificar | `soloDueno` en lugar de `requireRole(["ADMIN"])`; `GET /admin/complexes` (entrega 3a) | 2, 3a |
| `backend/src/modules/negocios/pertenencia.ts` | Crear | `buscarComplejoPropio`, `buscarCanchaPropia`, `buscarReservaPropia` y `buscarPagoPropio` | 3a, 3b |
| `backend/src/modules/admin/admin.service.ts` y `admin.controller.ts` | Modificar | `idNegocio` en todas las operaciones; `listarComplejos` | 3a |
| `backend/src/modules/bookings/booking.controller.ts` | Modificar | Pasa `obtenerIdNegocio(req)` | 3a, 3b, 5 |
| `backend/src/modules/payments/payment.service.ts` y `payment.controller.ts` | Modificar | `reembolsarPago(idNegocio, idPago)` | 3b |
| `backend/src/modules/negocios/slug.ts` | Crear | `FORMATO_SLUG`, `SLUGS_RESERVADOS` y `esSlugValido` | 4 |
| `backend/src/modules/negocios/negocio.dto.ts` | Crear | `slugSchema` y `altaNegocioSchema` (reutiliza las reglas de contraseña de `auth.dto.ts`) | 4 |
| `backend/src/modules/negocios/negocio.service.ts` | Crear | `crearConDueno` (entrega 4) y `resolverPorSlug` (entrega 5) | 4, 5 |
| `backend/src/modules/negocios/negocio.controller.ts` | Crear | `crear` (entrega 4) y `obtener` (entrega 5) | 4, 5 |
| `backend/src/modules/negocios/plataforma.routes.ts` | Crear | `POST /negocios` con `authenticate` y `requireRole(["SUPER_ADMIN"])` | 4 |
| `backend/src/modules/negocios/negocio.routes.ts` | Crear | Rutas por slug de la decisión 3 | 5 |
| `backend/src/app.ts` | Modificar | Montaje de `/api/v1/plataforma` (entrega 4) y `/api/v1/negocios` (entrega 5) | 4, 5 |
| `backend/src/modules/courts/court.service.ts` y `court.controller.ts` | Modificar | `idNegocio` en las tres operaciones | 5 |
| `backend/src/modules/courts/court.routes.ts`, `booking.routes.ts` y `public.routes.ts` | Modificar | `resolverNegocioFijo("principal")` en las rutas viejas (entrega 5) y su retiro (entrega 6) | 5, 6 |
| `backend/src/modules/bookings/bloqueoCancha.ts` | Modificar | `bloquearTelefono(tx, idNegocio, telefono)` | 5 |
| `backend/tests/ayudantes/negociosDePrueba.ts` | Crear | Fixtures de dos negocios | 1 |
| `backend/tests/clasificacion/archivosConBase.ts` | Modificar | Registro de las pruebas nuevas con base | 1, 3a, 3b, 4, 5 |
| `backend/tests/*` (pruebas nuevas y existentes) | Crear y modificar | Ver la decisión 7 | 1 a 6 |
| `frontend/src/types/index.ts`, `components/ProtectedRoute.tsx`, `components/Navbar.tsx`, `App.tsx` y `context/AuthContext.tsx` | Modificar | Roles nuevos y descarte de una sesión con rol desconocido | 2 |
| `frontend/src/App.tsx` | Modificar | Ruta `/:slug`; `/` redirige a `/principal` | 6 |
| `frontend/src/pages/BookingsPage.tsx` | Modificar | Slug de `useParams`; `/negocios/:slug/...`; mensaje de negocio no encontrado ante un 404 | 6 |
| `frontend/src/pages/AdminDashboard.tsx` | Modificar | `GET /admin/complexes` y selector de complejo (decisión 5) | 6 |
| `frontend/src/pages/MyBookingsPage.tsx` y `types/index.ts` | Modificar | Negocio de cada reserva | 6 |
| `docs/arquitectura/adr/0002-multi-tenant.md`, `docs/producto/glosario.md`, `.claude/skills/dominio-reservas/SKILL.md` y `.claude/skills/prisma-migraciones/SKILL.md` | Modificar | Detalle de implementación, roles, negocio y restricciones nuevas | 6 o al archivar |

## Interfaces y contratos

```ts
// backend/src/core/config/security.ts
export type Rol = "JUGADOR" | "DUENO" | "SUPER_ADMIN";

export type JwtPayload =
  | { userId: string; role: "JUGADOR" }
  | { userId: string; role: "SUPER_ADMIN" }
  | { userId: string; role: "DUENO"; negocioId: string };

const payloadJwtSchema = z.discriminatedUnion("role", [
  z.object({ userId: z.string().uuid(), role: z.literal("JUGADOR") }),
  z.object({ userId: z.string().uuid(), role: z.literal("SUPER_ADMIN") }),
  z.object({
    userId: z.string().uuid(),
    role: z.literal("DUENO"),
    negocioId: z.string().uuid(),
  }),
]);

export const verifyAccessToken = (token: string): JwtPayload =>
  payloadJwtSchema.parse(
    jwt.verify(token, obtenerSecretoJwt(), { algorithms: [ALGORITMO_JWT] }),
  );

// Lanza si un DUENO no tiene negocio (la restricción users_negocio_segun_rol lo impide).
export const armarPayloadJwt = (usuario: {
  id: string;
  role: Rol;
  negocioId: string | null;
}): JwtPayload => { /* ... */ };
```

```ts
// backend/src/core/types/express.d.ts
export interface NegocioPublico { id: string; nombre: string; slug: string }
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      idNegocio?: string;          // dueño (JWT) o slug
      negocio?: NegocioPublico;    // solo en rutas por slug
    }
  }
}
```

```ts
// backend/src/modules/bookings/booking.service.ts
// idNegocio null: reserva del jugador, en cualquier negocio activo.
export const validarTurnoReservable = async (
  courtId: string,
  startTime: string | Date,
  endTime: string | Date,
  idNegocio: string | null,
): Promise<{
  court: Court;
  start: Date;
  end: Date;
  idNegocio: string;
  depositPercent: number;
}> => { /* ... */ };
```

El parámetro `idNegocio` es obligatorio (aunque admite `null`) para que cada llamada decida su alcance de forma explícita.

**Contrato HTTP del alta (`POST /api/v1/plataforma/negocios`, solo `SUPER_ADMIN`):**

```json
// Solicitud
{ "negocio": { "nombre": "Pádel Norte", "slug": "padel-norte" },
  "dueno": { "email": "dueno@padelnorte.com", "password": "...", "firstName": "Ana", "lastName": "Pérez", "phone": "..." } }
// 201
{ "negocio": { "id": "uuid", "nombre": "Pádel Norte", "slug": "padel-norte", "activo": true },
  "dueno": { "id": "uuid", "email": "dueno@padelnorte.com", "firstName": "Ana", "lastName": "Pérez", "role": "DUENO" } }
```

| Caso | Respuesta |
|---|---|
| Slug mal formado o reservado | 400 (Zod) |
| Slug repetido | 409 "El slug ya está en uso." (también ante un `P2002` en carrera) |
| Email en uso | 409 "El correo electrónico ya se encuentra en uso" (mismo mensaje que el registro) |
| Rol distinto de `SUPER_ADMIN` | 403 |
| Sin token | 401 |

- El negocio y el dueño se crean en una sola `$transaction`: si una parte falla, no queda nada.
- La respuesta nunca incluye `passwordHash`.

**Otros contratos:**

- `GET /api/v1/negocios/:slug` → 200 `{ "nombre": "...", "slug": "..." }`. Si no hay negocio activo con ese slug: 404 `{ detail: "Negocio no encontrado." }`, con la forma de error actual de `errorHandler`.
- `GET /api/v1/admin/complexes` → 200 `[{ id, name, address, depositPercent, courts: [{ id, name, sport, surface, pricePerSlot, isIndoor, isActive, complexId }] }]`.
- `GET /api/v1/bookings/my-bookings`: cada reserva agrega `negocio: { nombre, slug }`.

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unitaria | Payload JWT, matriz de roles, slugs, `armarPayloadJwt` y clave y conteo de `bloquearTelefono` por negocio | Vitest, proyecto `unit`, Prisma simulado y `supertest` contra `app` |
| Integración con base | Migración (trigger y restricciones), aislamiento "ajeno → 404" por operación, alta atómica, rutas por slug y tope por negocio | Proyecto `db` contra la base descartable `reservas_prueba` (puerto 5434), dos negocios con el ayudante de fixtures; registro en `ARCHIVOS_CON_BASE` |
| Concurrencia | `bookings_sin_solapamiento` y el bloqueo por cancha siguen funcionando | `concurrenciaReservas.test.ts` existente, con fixtures con negocio |
| Manual (frontend) | `/principal`, panel con selector, "Mis reservas" con negocio, sesión vieja descartada | Navegador (chrome-devtools); el frontend no tiene pruebas hasta N.º 10 |

- Se aplica TDD estricto en el backend: cada entrega registra el RED observado antes del GREEN.
- Al cerrar cada entrega se ejecutan `npx tsc --noEmit`, `npm run test:unit` con una `DATABASE_URL` inalcanzable y `npm test` contra la base descartable con la semilla recargada.
- Las entregas que tocan el frontend (2 y 6) ejecutan además `npm run lint` y `npm run build` del frontend.

## Matriz de amenazas

La matriz de amenazas de la fase de diseño cubre enrutamiento de agentes, comandos de shell, subprocesos y automatización de control de versiones y PR. No aplica:

| Frontera | Aplicabilidad |
|---|---|
| Rutas con apariencia de documentación | N/A: el cambio no clasifica ni ejecuta archivos. |
| Selección del repositorio git | N/A: sin automatización de git. |
| Estado del commit | N/A: los commits los hace el usuario a mano. |
| Estado del push | N/A: sin automatización de push. |
| Comandos de PR | N/A: el proyecto no usa PR. |

**Amenazas propias de este cambio** (aislamiento entre negocios); cada fila tiene su prueba RED en la decisión 7:

| Amenaza | Respuesta del diseño | Prueba |
|---|---|---|
| Id de otro negocio en el camino | `findFirst` con `negocioId` → 404 | `aislamientoAdmin` y `aislamientoReservasPagos` |
| Id de otro negocio en el cuerpo (`complexId` o `courtId`) | Pertenencia o `validarTurnoReservable` con `idNegocio` → misma respuesta que inexistente | Ídem |
| Token viejo o claim de negocio ausente | Zod en `verifyAccessToken` → 401 | `payloadJwt` |
| `SUPER_ADMIN` leyendo datos de un negocio | `soloDueno` → 403 | `payloadJwt` |
| Slug de un negocio inactivo | Resolutor con `activo: true` → 404 genérico | `negociosPorSlug` |
| Reserva con negocio distinto del de la cancha | Trigger `bookings_negocio_coherente` | `migracionNegocios` |
| Tope por teléfono consumido por otro negocio | Clave y conteo con `negocioId` | `negociosPorSlug` y la prueba unitaria de `bloquearTelefono` |
| Slug que choca con una ruta del frontend | `SLUGS_RESERVADOS` en el alta | `slugNegocio` |

## Migración y despliegue

**Antes de la entrega 1:**

1. Respaldo de la base de desarrollo: `pg_dump` de `sports_booking_postgres` (puerto 5433).
2. Ensayo de M1 en la base descartable con datos de semilla.
3. Comprobación de que `prisma migrate diff` no propone `DROP` (supuesto de la decisión 2).

**SQL de M1 (parte manual, después de las sentencias generadas y editadas):**

```sql
-- D10: una sola cuenta de dueño por negocio. Restricción (no índice suelto) para que Prisma no la borre.
ALTER TABLE "users"
  ADD CONSTRAINT "users_un_dueno_por_negocio"
  EXCLUDE USING btree ("negocio_id" WITH =) WHERE ("negocio_id" IS NOT NULL);

-- La reserva pertenece al negocio del complejo de su cancha.
CREATE FUNCTION "bookings_validar_negocio"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."negocio_id" IS DISTINCT FROM (
    SELECT c."negocio_id" FROM "courts" ct
    JOIN "complexes" c ON c."id" = ct."complex_id"
    WHERE ct."id" = NEW."court_id"
  ) THEN
    RAISE EXCEPTION 'bookings_negocio_coherente: la reserva no pertenece al negocio de su cancha'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "bookings_negocio_coherente"
  BEFORE INSERT OR UPDATE OF "court_id", "negocio_id" ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION "bookings_validar_negocio"();
```

**Reversa de M1** (probada en la base descartable):

```sql
-- Antes: exportar los negocios distintos de 'principal' y sus datos; la reversa los mezcla.
DROP TRIGGER IF EXISTS "bookings_negocio_coherente" ON "bookings";
DROP FUNCTION IF EXISTS "bookings_validar_negocio"();
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_un_dueno_por_negocio";
ALTER TABLE "users" DROP COLUMN "negocio_id";
ALTER TABLE "bookings" DROP COLUMN "negocio_id";
CREATE INDEX "bookings_guest_phone_status_idx" ON "bookings"("guest_phone", "status");
ALTER TABLE "complexes" DROP COLUMN "negocio_id";
DROP TABLE "negocios";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125120000_negocios';
```

**Reversa de M2:**

```sql
-- Antes: exportar y eliminar las cuentas SUPER_ADMIN (no tienen reservas).
DELETE FROM "users" WHERE "role" = 'SUPER_ADMIN';
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_negocio_segun_rol";
ALTER TYPE "Role" RENAME VALUE 'JUGADOR' TO 'USER';
ALTER TYPE "Role" RENAME VALUE 'DUENO' TO 'ADMIN';
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';
-- 'SUPER_ADMIN' queda en el tipo sin uso: PostgreSQL no permite quitar un valor del enum.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125120100_roles_negocio';
```

- En ningún sentido se toca `bookings_sin_solapamiento`.
- Si una reversa falla, se restaura el respaldo.
- **Semilla:**
  - limpia también `negocios`, al final;
  - crea "Negocio principal" (`principal`), el complejo con su `negocioId` y el dueño `admin@sportsbooking.com` con `negocioId` (entrega 1, con rol `ADMIN`; en la entrega 2 pasa a `DUENO`);
  - crea el jugador `jugador@example.com` (`JUGADOR`);
  - en la entrega 2 crea el `SUPER_ADMIN` `plataforma@sportsbooking.com`, con una contraseña fija de desarrollo, igual que las cuentas actuales.
- **Despliegue:** no hay producción todavía. En desarrollo, cada entrega aplica su migración con `prisma migrate deploy`, después del respaldo. La CI aplica las migraciones y la semilla en su propia base.

## Plan de entregas

Estrategia `ask-on-risk` con un presupuesto de unas 400 líneas por entrega. El pronóstico definitivo y la división en tareas los hace `sdd-tasks`. Las líneas son de código más pruebas, sin specs.

| N.º | Entrega | Archivos principales | Estimación |
|---|---|---|---|
| 1 | Modelo, M1, semilla, `negocioId` al crear reservas, ayudante de fixtures y `migracionNegocios` | `schema.prisma`, M1, `seed.ts`, `booking.service.ts`, `reservaInvitado.service.ts`, `vistaAdmin.ts`, 9 pruebas existentes y 2 nuevas | ~320 |
| 2 | M2, payload con Zod, `requireRole` tipado, `soloDueno`, `armarPayloadJwt`, semilla con `SUPER_ADMIN`, fixtures de roles y roles en el frontend | `security.ts`, `express.d.ts`, `role.middleware.ts`, `negocio.ts`, `auth.service.ts`, 3 archivos de rutas, 13 pruebas, `payloadJwt.test.ts` y 5 archivos del frontend | ~300 |
| 3a | Pertenencia en administración y canchas, y `GET /admin/complexes` | `pertenencia.ts`, `admin.*`, listados de `booking.service.ts`, `aislamientoAdmin.test.ts` y 3 simulaciones | ~380 |
| 3b | Pertenencia en reservas y pagos; negocio activo en `validarTurnoReservable`; negocio en "Mis reservas" | `booking.service.ts`, `booking.controller.ts`, `payment.*`, `aislamientoReservasPagos.test.ts` y 3 simulaciones | ~340 |
| 4 | Alta de negocio y dueño por `SUPER_ADMIN` | `slug.ts`, `negocio.dto.ts`, `negocio.service.ts`, `negocio.controller.ts`, `plataforma.routes.ts`, `app.ts`, `slugNegocio.test.ts` y `altaNegocio.test.ts` | ~280 |
| 5 | Rutas por slug, resolutor, compatibilidad con `principal` y tope por teléfono por negocio | `negocio.ts`, `negocio.routes.ts`, `court.*`, `bloqueoCancha.ts`, `reservaInvitado.service.ts`, `negociosPorSlug.test.ts` y 4 pruebas migradas | ~380 |
| 6 | Frontend (`/:slug`, panel con selector y negocio en "Mis reservas") y retiro de las rutas viejas | `App.tsx`, `BookingsPage.tsx`, `AdminDashboard.tsx`, `MyBookingsPage.tsx`, `types/index.ts`, 3 archivos de rutas del backend y sus pruebas | ~300 |
| Docs | ADR 0002 (detalle de implementación), glosario y skills | `docs/` y `.claude/skills/` | ~80 (fuera del presupuesto de código) |

- Total aproximado: 2.300 líneas de código y pruebas.
- Las entregas 3a y 5 rozan las 400 líneas. Corte limpio de reserva:
  - 3a se parte en "canchas y seña" y "métricas, listado y agenda";
  - 5 se parte en "resolutor y catálogo" y "alta de invitado y tope por teléfono".
- Dependencias:
  - 1 → 2 → (3a, 3b, 4, en cualquier orden) → 5 → 6;
  - 5 necesita `validarTurnoReservable` con `idNegocio` (3b);
  - 6 necesita 3a (`GET /admin/complexes`), 3b ("Mis reservas") y 5 (rutas por slug).

## Preguntas abiertas

- [x] **Producto: qué muestra la raíz `/` del frontend** (entrega 6). Resuelta por el usuario el 2026-11-24: redirige a `/principal`. Una portada propia de la plataforma puede llegar con N.º 8.

**Notas para N.º 9** (no bloquean este cambio):

- Con `activo = false`, el panel del dueño sigue operativo, porque el claim no consulta la base. Las rutas por token de las reservas existentes siguen respondiendo.
- Mover un complejo de negocio exige reasignar `bookings.negocio_id` en la misma transacción.
- Si se necesita suspender el panel al instante, la costura es `asignarNegocioDelDueno`.
