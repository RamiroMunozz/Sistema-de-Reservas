---
name: dominio-reservas
description: Glosario, reglas inmutables y mapa de módulos del sistema de reservas de canchas. Usar antes de escribir o revisar código de backend o frontend, o al redactar specs, para respetar el dominio y las reglas del proyecto.
---

# Dominio de reservas

## Glosario breve

- **Negocio** (objetivo): unidad de aislamiento; aún no existe en el esquema.
- **Complejo** (`Complex`) agrupa **canchas** (`Court`); cada cancha tiene **horarios** (`CourtSchedule`) por día de la semana.
- **Reserva** (`Booking`): ocupa una cancha entre `startTime` y `endTime`; estados `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`. Toda reserva distinta de `CANCELLED` bloquea el turno.
- **Usuario** (`User`): `firstName`, `lastName`, rol `USER` o `ADMIN` hoy; objetivo `SUPER_ADMIN`, dueño y jugador.

Glosario completo: `docs/producto/glosario.md`.

## Estado actual y objetivo

El código es single-tenant. El multi-tenant es un objetivo (ADR 0002); no se asume implementado.

## Reglas inmutables

1. **UTC estricto**: fechas y horas se reciben, procesan y persisten en UTC (`toISOString()`). El frontend extrae horas con `getUTCHours()` y `getUTCMinutes()`.
2. **Aislamiento por negocio** (regla objetivo): todo dato de negocio pertenece a un negocio; los servicios filtran siempre por negocio y nunca confían en IDs del cliente sin verificar pertenencia.
3. **Usuarios**: siempre `firstName` y `lastName`, nunca un campo `name` unificado.
4. **Cero `any`**: todo payload, respuesta, variable y estado tiene tipo explícito.
5. **Controladores delgados**: solo manejan HTTP (`req`, `res`, códigos de estado). Reglas de negocio y acceso a Prisma van en servicios.
6. **Frontend**: sin `setState` síncrono en el cuerpo de un `useEffect`; cumplir `eslint-plugin-react-hooks`.
7. Todo lo nuevo se escribe en español.

## Mapa de módulos

| Ubicación | Contenido |
|---|---|
| `backend/src/app.ts` | Middlewares globales y rutas `/api/v1`. |
| `backend/src/modules/auth/` | Registro e inicio de sesión. |
| `backend/src/modules/courts/` | Canchas y disponibilidad. |
| `backend/src/modules/bookings/` | Reservas; `bloqueoCancha.ts` serializa por cancha. |
| `backend/src/modules/payments/` | Preferencia de Mercado Pago y webhook. |
| `backend/src/modules/admin/` | Alta/edición de canchas y métricas. |
| `backend/src/core/` | Prisma, secretos, middlewares y errores. |
| `backend/prisma/` | Esquema, migraciones y seed. |
| `backend/tests/` | Pruebas con Vitest. |
| `frontend/src/pages/` | `BookingsPage`, `LoginPage`, `MyBookingsPage`, `AdminDashboard`. |
| `frontend/src/api/axios.ts` | Cliente HTTP. |
| `frontend/src/context/` | Sesión de usuario. |

Cada módulo de backend usa `*.routes.ts`, `*.controller.ts`, `*.service.ts` y `*.dto.ts` (validación con Zod).
