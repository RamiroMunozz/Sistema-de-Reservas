---
name: dominio-reservas
description: Glosario, reglas inmutables y mapa de módulos del sistema de reservas de canchas. Usar antes de escribir o revisar código de backend o frontend, o al redactar specs, para respetar el dominio y las reglas del proyecto.
---

# Dominio de reservas

## Glosario breve

- **Negocio** (objetivo): unidad de aislamiento; aún no existe en el esquema.
- **Complejo** (`Complex`) agrupa **canchas** (`Court`); cada cancha tiene **horarios** (`CourtSchedule`) por día de la semana.
- **Reserva** (`Booking`): ocupa una cancha entre `startTime` y `endTime`; estados `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED` y `EXPIRED`. Toda reserva distinta de `CANCELLED` y `EXPIRED` bloquea el turno.
- **Pago de reserva** (`BookingPayment`): una fila por cada pago aprobado de Mercado Pago (`mpPaymentId` único, `amount`, `isValid`, `refundReason`, `refundedAt`). Se clasifica al recibir el webhook, bajo el bloqueo de cancha. A lo sumo un pago válido sin reembolsar por reserva.
- **Motivos de reembolso** (`RefundReason`): `AMOUNT_MISMATCH`, `SLOT_TAKEN`, `PAID_AFTER_CANCEL`, `DUPLICATE_PAYMENT` (obligatorios) y `OWNER_DISCRETION` (pago válido de una reserva cancelada, a criterio del canchero). Se guardan, no se derivan.
- **Usuario** (`User`): `firstName`, `lastName`, rol `USER` o `ADMIN` hoy; objetivo `SUPER_ADMIN`, dueño y jugador.

Glosario completo: `docs/producto/glosario.md`.

## Estados de reserva y pagos

Estado en `desarrollo` (cambio `reserva-invitado`, entregas 1 y 2 ya hechas; el resto de los pagos está pendiente).

| Estado | Ocupa el turno | Notas |
|---|---|---|
| `PENDING` | Sí, mientras no venza | La de invitado nace así con `expiresAt` a 15 minutos. |
| `CONFIRMED` | Sí | Pago aprobado o confirmación manual. |
| `COMPLETED` | Sí | Terminal. |
| `CANCELLED` | No | Terminal. Nunca se reactiva, ni siquiera con un pago aprobado posterior. |
| `EXPIRED` | No | Terminal. Solo lo produce el vencimiento de una `PENDING` impaga (barrido o `liberarReservasVencidas` bajo el bloqueo). No se puede fijar a mano (la API responde 400) y no es una cancelación. |

- Las lecturas usan los filtros compartidos `filtroOcupaTurno` y `filtroNoVencida`, que ignoran también la `PENDING` vencida que el barrido aún no pasó a `EXPIRED`.
- Un pago aprobado nunca cambia una reserva `CANCELLED`: queda como `BookingPayment` con `PAID_AFTER_CANCEL`. Si la reserva está `EXPIRED` y el turno sigue libre, se confirma; si no, queda con `SLOT_TAKEN`.
- Un pago rechazado nunca cancela una reserva.

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
