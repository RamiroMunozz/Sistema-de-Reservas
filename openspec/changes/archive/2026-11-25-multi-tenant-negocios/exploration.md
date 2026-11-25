# Exploración: `multi-tenant-negocios` (N.º 5)

Fuente: fase `sdd-explore` (Engram `sdd/multi-tenant-negocios/explore`). Referencias: ADR 0002, `docs/producto/decisiones.md` (DP-02, DP-04 y su enmienda, DP-05, DP-14), S5 de `openspec/changes/archive/2026-11-19-reserva-invitado/verify-report.md`.

## 1. Estado actual

Cadena de pertenencia actual: `Complex` → `Court` → `Booking` → `BookingPayment`. `User` no está vinculado a ningún negocio.

### Esquema (`backend/prisma/schema.prisma`)

| Modelo | Hoy | Necesita |
|---|---|---|
| `User` (:60) | `email` único global; `role` `USER` o `ADMIN` (:15-18). | Dueño con `negocioId`; jugador y `SUPER_ADMIN` sin negocio. El email global sirve para la cuenta global de jugador. |
| `Complex` (:78) | Sin dueño. | `negocioId` obligatorio; raíz natural del aislamiento. |
| `Court` (:91) | Pertenece por `complexId`. | Hereda el negocio por `complexId`. |
| `CourtSchedule` (:110) | `@@unique([courtId, dayOfWeek])`. | Sin cambios (es por cancha). |
| `Booking` (:130) | Pertenece por `courtId`; `guestPhone`; `@@index([guestPhone, status])`; `accessTokenHash` único. | Candidato a `negocioId` desnormalizado. El token sigue único global (alta entropía). |
| `BookingPayment` (:164) | `mpPaymentId` único global. | Sin cambios; hereda por `bookingId`. |

### Restricciones SQL manuales

- `bookings_sin_solapamiento` (`EXCLUDE gist` por `court_id`): sin cambios; cada cancha pertenece a un solo negocio.
- `pg_advisory_xact_lock(hashtext(courtId))` (`bloqueoCancha.ts:23`): sin cambios.
- `bloquearTelefono` (`bloqueoCancha.ts:41-49`): bloqueo y conteo de `PENDING` por `guestPhone` sin negocio (tope global, S5). Debe incluir el negocio en la clave del bloqueo y en el filtro.
- Prisma 5 borra los índices que no modela: todo índice parcial o compuesto nuevo va en SQL manual con comentario en el modelo.

## 2. Autenticación

- `JwtPayload = { userId, role: "USER" | "ADMIN" }` (`core/config/security.ts:7-10`), 15 minutos, HS256. Deuda previa: `as unknown as JwtPayload` (:47).
- `authenticate` (`core/middlewares/auth.ts`) solo decodifica y asigna `req.user`.
- `requireRole(["ADMIN"])` (`core/middlewares/role.middleware.ts`) se usa en `admin.routes.ts:11`, `booking.routes.ts:8` y `payments.routes.ts:20`.
- `AuthService.register` crea siempre `USER`; `login` firma `{ userId, role }`. Solo la semilla crea un `ADMIN`.
- Mapeo propuesto: `ADMIN` → dueño del negocio por defecto; `USER` → jugador; `SUPER_ADMIN` es nuevo.
- Falta un `req.negocioId` derivado del JWT (dueño) o del slug (público).

## 3. Operaciones que necesitan filtro o verificación de pertenencia

| Archivo:línea | Operación | Riesgo actual |
|---|---|---|
| `admin.service.ts:13-33` `createCourt` | Recibe `complexId` del cliente. | Cancha en un complejo ajeno. |
| `admin.service.ts:35-48` `updateCourt` | `court.update` por id. | Edita una cancha ajena. |
| `admin.service.ts:50-72` seña (ADM-015) | Por id de complejo. | Lee o modifica la seña ajena. |
| `admin.service.ts:74-93` `getMetrics` | `booking.findMany` sin filtro. | Métricas de todos los negocios. |
| `booking.service.ts:210-220` `getAllBookingsForAdmin` (ADM-008) | Todas las reservas. | Fuga total. |
| `booking.service.ts:222-242` `getDailyBookingsForAdmin` | Sin filtro. | Fuga. |
| `booking.service.ts:244-301` `updateBookingStatus` | Por `bookingId`. | Cambia el estado de una reserva ajena. |
| `booking.service.ts:303-345` `createAdminBooking` | `courtId` del cliente. | Reserva en una cancha ajena. |
| `booking.service.ts:118-182` `cancelBooking` | Verifica `userId`. | Aceptable para el jugador; revisar el uso por dueños. |
| `booking.service.ts:48-75` `validarTurnoReservable` | `court` por id. | Punto único compartido para validar el negocio de la cancha. |
| `booking.service.ts:184-208` y `court.service.ts:60-103` | Disponibilidad por `courtId`. | Lectura pública; riesgo bajo. |
| `court.service.ts:11-58` `getAllCourts`, `getCourtById` | Todas las canchas activas. | Mezcla catálogos; necesita negocio resuelto. |
| `payment.service.ts:108-139` `reembolsarPago` (PAG-024) | Por `idPago`. | Reembolsa un pago ajeno. |
| `payment.service.ts:50-102` `createPaymentPreference` | Verifica `userId`. | Correcto; credenciales globales (N.º 6). |
| `payment.service.ts:201-290` webhook | Por `external_reference`. | El negocio sale de la reserva. |
| `public/reservaInvitado.service.ts:52-106` `crear` | `courtId` del cliente. | Verificar que la cancha sea del negocio del slug. |
| `bloqueoCancha.ts:37-62` | Tope por teléfono global. | Pasar a tope por negocio. |
| `barridoVencidas.ts:14-33` | Recorre todas las canchas. | Operación de plataforma; sin filtro. |

Rutas sin autenticación: `GET /courts`, `/courts/:id`, `/courts/:id/availability`, `/bookings/availability`, `/public/*`.

## 4. Frontend

- `App.tsx:20-39`: rutas `/`, `/login`, `/reserva/:codigo`, `/mis-reservas` y `/admin` (`ProtectedRoute requiredRole="ADMIN"`).
- Roles fijos en `ProtectedRoute.tsx:7`, `Navbar.tsx:15` y `types/index.ts:119`.
- `AdminDashboard.tsx:326-335` toma el `complexId` de `courts[0].complexId`.
- `BookingsPage.tsx:89` llama a `/courts` sin negocio; `BookingsPage.tsx:49` fija `PREFIJO_TELEFONO_INTERNACIONAL = "549"`. El backend solo valida de 8 a 15 dígitos (`public.dto.ts:23-30`).
- `api/axios.ts` solo agrega `Authorization`.
- Una ruta `/<slug>` choca con `/login`, `/reserva`, `/mis-reservas` y `/admin`: hacen falta slugs reservados.

## 5. Semilla, datos y pruebas

- `seed.ts` crea 1 `ADMIN`, 1 `USER`, 1 complejo, 3 canchas y horarios. Debe crear un negocio por defecto, asignarle el complejo y vincular al dueño.
- Migración de datos (skill `prisma-migraciones`): crear `negocios`, insertar el negocio por defecto, agregar `negocio_id` nulable, completar con `UPDATE` y pasar a `NOT NULL`. El enum `Role` necesita `ADD VALUE`, que no se puede usar en la misma transacción: probablemente dos migraciones. Respaldo previo de la base de desarrollo.
- Pruebas afectadas: 13 archivos con `role`, `prisma.user` o `prisma.complex` y 19 con rutas `/api/v1/`.
  - Con base: `integration`, `rutasAdminReservas`, `concurrenciaReservas`, `secretosJwt`.
  - Sin base: `depositPercent`, `reembolsoPago`, `metricasAdmin`, `validacionCanchas`, `validacionReservas`, `respuestasListaBlanca`.
  - Nuevas pruebas de aislamiento con dos negocios ("ajeno → 404"). Toda prueba nueva con base va a `ARCHIVOS_CON_BASE`. TDD estricto en el backend.
- Specs afectadas: `administracion`, `autenticacion`, `canchas`, `reservas` y `pagos`. Dominio nuevo `negocios` (prefijo `NEG`).

## 6. Enfoques

### Aislamiento

| Opción | Ventajas | Desventajas | Esfuerzo |
|---|---|---|---|
| A. `negocioId` solo en `Complex` | Cambio mínimo; una fuente de verdad. | Filtros de `Booking` con joins hasta `complex`. | Bajo |
| **B. `negocioId` en `Complex` y desnormalizado en `Booking` (recomendada)** | Filtro directo en listados, métricas y tope por teléfono. | Hay que garantizar la coherencia con la cancha (creación vía `validarTurnoReservable` y prueba o restricción). | Medio |
| C. `negocioId` en todas las tablas con claves foráneas compuestas | Coherencia garantizada por la base. | Más columnas y migración. | Medio-alto |
| D. RLS de PostgreSQL | Defensa en profundidad. | `SET LOCAL` por transacción; complica Prisma y las pruebas. | Alto |
| E. Base o esquema por negocio | Aislamiento máximo. | Descartada por el ADR 0002. | Muy alto |

Recomendación: B, con un helper de filtro por negocio y pruebas de aislamiento. RLS queda como endurecimiento futuro.

### Resolución del negocio por solicitud

- Dueño o `SUPER_ADMIN` autenticado: `negocioId` en el JWT; un middleware lo asigna a la solicitud. Alternativa: leerlo de la base en cada solicitud (permite suspender al instante, cuesta una consulta).
- Público y jugador: por slug, con la ruta `/api/v1/negocios/:slug/...` (recomendada) o el header `X-Negocio`.
- Rutas por token (`/public/bookings/:token`) y webhook: el negocio sale de la reserva.
- Frontera con N.º 8: N.º 5 hace la resolución por slug en el backend, la validación del formato, los slugs reservados y `GET /negocios/:slug`, más una ruta `/:slug` mínima en el frontend. N.º 8 agrega marca, página y personalización.

### Roles

Nombres pendientes de decisión: `SUPER_ADMIN`, `DUENO`, `JUGADOR` o `OWNER`, `PLAYER`. Modelo sugerido: `User.negocioId` opcional y único para el dueño (alternativa: `Negocio.ownerId` único).

## 7. Tamaño y entregas

Estimación total: entre 900 y 1300 líneas de código y pruebas, más specs. No entra en una sola entrega.

| Entrega | Contenido | Estimación |
|---|---|---|
| 1 | Modelo `Negocio` (slug, nombre), `Complex.negocioId`, `Booking.negocioId`, migración con datos y semilla, sin cambios de comportamiento. | ~250 |
| 2 | Roles y JWT: enum, `negocioId` en el payload, verificación de roles, mapeo `ADMIN` → dueño. | ~250 |
| 3 | Filtros y pertenencia en administración, reservas, pagos y `validarTurnoReservable`, con pruebas de aislamiento. Candidata a partirse en 3a y 3b. | ~400-500 |
| 4 | Resolución por slug en rutas públicas, tope por teléfono por negocio y prefijo configurable. | ~300 |
| 5 | Frontend: roles, `/:slug` mínimo, panel con su negocio y tipos. | ~250 |

## 8. Preguntas de producto abiertas

1. Frontera N.º 5 y N.º 8 para el slug: ¿resolución por slug en el backend y `/:slug` mínima, o `/` sigue sirviendo todo hasta N.º 8?
2. Nombres de los roles: ¿en español (`DUENO`, `JUGADOR`) o en inglés (`OWNER`, `PLAYER`)?
3. ¿Un negocio tiene uno o varios complejos?
4. Antes del panel de N.º 9, ¿quién crea un negocio y su dueño: script, semilla o endpoint de `SUPER_ADMIN`?
5. Tope de reservas pendientes por teléfono: ¿por negocio o global?
6. Prefijo `549`: ¿fijo para Argentina o configurable por negocio?
7. Datos existentes: ¿se migran a un negocio por defecto?, ¿con qué slug?
8. Cuenta global de jugador: ¿reserva en cualquier negocio y ve el historial de todos?
9. Negocio suspendido o inexistente: ¿404 genérico para el público?
10. ¿Se garantiza con una restricción única en la base que haya una sola cuenta de dueño por negocio?

## Decisiones del usuario (2026-11-24)

Respuestas a las preguntas de la sección 8:

1. Frontera con N.º 8: slug mínimo. El backend resuelve el negocio por slug y el frontend tiene una ruta `/:slug` sin marca propia, con slugs reservados.
2. Roles en español: `SUPER_ADMIN`, `DUENO` y `JUGADOR`. Se renombran `USER` → `JUGADOR` y `ADMIN` → `DUENO`.
3. Un negocio puede tener varios complejos (1:N).
4. El negocio y su dueño se crean con un endpoint de `SUPER_ADMIN`. El primer `SUPER_ADMIN` lo crea la semilla.
5. El tope de reservas pendientes por teléfono es por negocio.
6. El prefijo `549` queda fijo por ahora (deuda conocida).
7. Los datos existentes migran al negocio "Negocio principal", con slug `principal`. Editar o renombrar un negocio queda para N.º 9.
8. La cuenta de jugador es global: "Mis reservas" muestra las de todos los negocios e indica el negocio de cada una.
9. Un slug inexistente o un negocio suspendido responden con un 404 genérico. El campo `activo` entra en el modelo; su gestión, en N.º 9.
10. Una sola cuenta de dueño por negocio, garantizada con un índice único parcial en SQL manual.

## Riesgos

- Fuga entre negocios por operaciones por id sin verificación de pertenencia (ADM-008, ADM-015, PAG-024, `updateBookingStatus`, `createAdminBooking`, rutas públicas de canchas).
- La migración con datos reales exige respaldo previo.
- Muchos fixtures de pruebas cambian.
- La entrega 3 puede superar las 400 líneas.
