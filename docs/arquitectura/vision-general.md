# Visión general de la arquitectura

Describe el **estado actual** (single-tenant). El objetivo multi-tenant está en el [ADR 0002](adr/0002-multi-tenant.md).

## Componentes

- Base de datos PostgreSQL, accedida con Prisma 5 (`backend/prisma/schema.prisma`).
- Backend Express 5 con TypeScript ESM (`backend/src`).
- Frontend React 19 con Vite (`frontend/src`).
- Integración con Mercado Pago mediante su SDK oficial (`backend/src/modules/payments`).

## Backend

`backend/src/app.ts` monta los middlewares de seguridad (`helmet`, CORS restringido a `FRONTEND_URL`) y las rutas bajo `/api/v1`:

| Prefijo | Módulo | Contenido |
|---|---|---|
| `/auth` | `modules/auth` | Registro e inicio de sesión (con limitador de intentos). |
| `/courts` | `modules/courts` | Listado, detalle y disponibilidad de canchas. |
| `/bookings` | `modules/bookings` | Reservas del jugador y operaciones de administrador (`/admin/*`). |
| `/admin` | `modules/admin` | Alta y edición de canchas, métricas. |
| `/payments` | `modules/payments` | Creación de preferencia de pago y webhook. |

Además existe `GET /health`.

### Capas

Cada módulo sigue la separación `routes` → `controller` → `service`, más un `dto` con la validación de entrada (Zod):

- Los controladores gestionan solo la petición HTTP.
- Los servicios contienen las reglas de negocio y todo el acceso a Prisma.

`backend/src/core` agrupa lo transversal:

- `config/`: cliente de Prisma (`prisma.ts`) y secretos JWT (`security.ts`).
- `middlewares/`: autenticación (`auth.ts`), restricción por rol (`role.middleware.ts`), limitador de autenticación y manejador global de errores.
- `errors/`: `AppError` y la conversión de la violación de solapamiento en un conflicto 409 (`reservaSolapada.ts`).

## Frontend

`frontend/src/App.tsx` define las rutas `/` (reserva), `/login`, `/mis-reservas` y `/admin`. Las páginas están en `frontend/src/pages`, el cliente HTTP con Axios en `frontend/src/api/axios.ts` y la sesión en `frontend/src/context`. Los horarios se muestran con métodos UTC.

## Flujo de reserva y pago

1. El jugador consulta la disponibilidad (`GET /api/v1/bookings/availability` o `/courts/:id/availability`).
2. Crea la reserva (`POST /api/v1/bookings`). El servicio la inserta dentro de `conBloqueoDeCancha` (`backend/src/modules/bookings/booking.service.ts`).
3. Si elige Mercado Pago, solicita la preferencia (`POST /api/v1/payments/create-preference`) y se lo redirige al checkout.
4. Mercado Pago notifica el resultado a `POST /api/v1/payments/webhook`. El servicio valida la firma, el monto y confirma o cancela la reserva (`backend/src/modules/payments/payment.service.ts`).

Observación: la reserva se crea `CONFIRMED` antes del pago (punto A3 de `docs/historial/auditoria-seguridad.md`); está planificado resolverlo en el cambio `deuda-auditoria`.

## Prevención de solapamientos

Dos mecanismos combinados, detallados en el [ADR 0003](adr/0003-prevencion-solapamiento-reservas.md):

- Restricción `EXCLUDE` `bookings_sin_solapamiento` en la base de datos (migración `20261104120000_reservas_sin_solapamiento`).
- Bloqueo asesor por cancha (`pg_advisory_xact_lock`) en `backend/src/modules/bookings/bloqueoCancha.ts`, usado por reservas y por el webhook.

## Pruebas

Vitest en `backend/tests` (integración con supertest). El frontend no tiene pruebas automatizadas.
