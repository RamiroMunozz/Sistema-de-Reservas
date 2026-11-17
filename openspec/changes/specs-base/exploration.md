# Exploración: specs-base

Copia en Engram: `sdd/specs-base/explore`.

## Estado actual

- `openspec/specs/` está vacío (solo `.gitkeep`). No hay nada con qué fusionar.
- `app.ts` monta `/api/v1/{auth,courts,bookings,admin,payments}` y `/health`.
- Rutas del frontend: `/`, `/login`, `/mis-reservas` y `/admin`. No hay página de registro ni pruebas del frontend.
- Backend: 7 archivos de prueba con unos 113 casos. Las pruebas de concurrencia se omiten si no hay una base descartable.

## Mapa por dominio

| Dominio | Backend | Frontend | Pruebas | Tamaño estimado |
|---|---|---|---|---|
| autenticacion | `modules/auth/*`, `core/config/security.ts`, middlewares de auth, rol, limitador y errores | `LoginPage`, `context/*`, `ProtectedRoute`, `Navbar`, `api/axios.ts` | `secretosJwt`, `validacionReservas` (rate-limit, CORS), `integration` (RBAC) | 110-140 líneas |
| canchas | `modules/courts/*`, `schema.prisma` (Court, Complex, CourtSchedule) | `BookingsPage`, `types/index.ts` | `integration` | 100-130 líneas |
| reservas | `modules/bookings/*`, `bloqueoCancha.ts`, `reservaSolapada.ts`, migración EXCLUDE gist | `BookingsPage`, `MyBookingsPage`, `AdminDashboard` (reservas) | `validacionReservas`, `concurrenciaReservas`, `rutasAdminReservas`, `integration` | 180-230 líneas |
| pagos | `modules/payments/*` | `BookingsPage`, `MyBookingsPage` | `preferenciaPago`, `webhookPago` | 130-160 líneas |
| administracion | `modules/admin/*`; las rutas `/bookings/admin/*` se documentan en reservas | `AdminDashboard` | `rutasAdminReservas`, `integration` | 100-130 líneas |

En total, unas 620 a 790 líneas: supera el presupuesto de 400 líneas por entrega.

## Divergencias a registrar como comportamiento actual (sin corregir)

1. `createBooking` y `createAdminBooking` crean la reserva como `CONFIRMED` antes del pago (`booking.service.ts:56,222`).
2. `cancelBooking` no usa `conBloqueoDeCancha` (`booking.service.ts:100`).
3. `updateBookingStatus` acepta cualquier estado destino sin validar la transición.
4. `AdminDashboard.tsx:340` cancela con `PATCH /bookings/:id/cancel`, que exige ser el dueño de la reserva. Falta verificar si un ADMIN puede cancelar reservas ajenas por esa vía.
5. `createAdminBooking` reserva a nombre del propio admin, permite horarios pasados y no verifica `isActive` de la cancha.
6. La disponibilidad está duplicada: `GET /bookings/availability` (la usa el frontend) y `GET /courts/:id/availability` (horario por defecto de 08:00 a 23:00, en turnos de 60 minutos).
7. `getMetrics` filtra por `createdAt` y no por `startTime`. Además usa `any` y `as unknown as`.
8. `updateCourt` pasa el DTO parcial completo a Prisma.
9. Webhook de Mercado Pago:
   - Un pago rechazado o cancelado pasa la reserva a `CANCELLED` sin bloqueo de cancha.
   - Una diferencia de monto solo genera una advertencia.
   - Un turno ya ocupado se registra en el log para revisión manual.
   - Cualquier otro error responde 500 para que Mercado Pago reintente.
10. Autenticación:
    - JWT HS256 que vence a los 15 minutos, sin refresh ni logout.
    - El rol se toma del token y no se vuelve a consultar en la base.
    - El registro siempre crea usuarios con rol USER.
    - Login y registro admiten 10 intentos fallidos cada 15 minutos.
    - CORS acepta un único origen.
11. Falta verificar si `/mis-reservas` y `/admin` están protegidas con `ProtectedRoute` en `App.tsx`.
12. `.env.example` no se pudo leer, así que las variables de entorno quedan sin confirmar.

## Uso de `/spec-base` y `documentador-specs`

- Se corre `/spec-base <dominio>` una vez por dominio. El comando delega en el agente y no hace commit.
- La persona revisa las Observaciones de cada spec antes del commit.
- El agente no tiene Bash: hay que verificar a mano las referencias `archivo:línea`.
- El agente debe leer también `docs/producto/glosario.md` y `schema.prisma`.

## Enfoque recomendado

Un commit por dominio, en este orden: autenticacion, canchas, reservas, pagos y administracion. Si `reservas` pasa de unas 250 líneas, se divide en dos commits.

## Riesgos

- `reservas` está cerca del límite del presupuesto.
- Las pruebas que necesitan PostgreSQL no corren localmente; la concurrencia se documenta a partir del código y de las pruebas.
- Las referencias `archivo:línea` pueden quedar desactualizadas.
- Se puede filtrar comportamiento objetivo (multi-tenant, seña, roles nuevos) en specs que deben describir el estado actual.
