# 0003. Prevención de solapamiento de reservas

- Estado: Aceptada (ya implementada)
- Fecha: 2026-11-04

## Contexto

La auditoría pidió verificar que no existieran reservas duplicadas (double-booking). La solicitud mencionaba Redis, pero no existe en el repositorio. Las reservas simultáneas sobre un mismo turno podían confirmarse ambas.

## Decisión

La garantía vive en PostgreSQL, con dos mecanismos:

1. Restricción `EXCLUDE` `bookings_sin_solapamiento` sobre `bookings`: no admite dos reservas con el mismo `court_id` y rangos `tstzrange(start_time, end_time)` solapados, salvo las `CANCELLED`. Se complementa con `bookings_horario_valido` (`end_time > start_time`). Ambas están en `backend/prisma/migrations/20261104120000_reservas_sin_solapamiento/migration.sql` y no se reflejan en `schema.prisma`.
2. Bloqueo asesor por cancha: `conBloqueoDeCancha` (`backend/src/modules/bookings/bloqueoCancha.ts`) abre una transacción, fija `lock_timeout` en 5 s y toma `pg_advisory_xact_lock(hashtext(idCancha))`. Lo usan `createBooking`, `updateBookingStatus` y `createAdminBooking` (`booking.service.ts`) y el webhook de pago (`payment.service.ts`).

La violación de la restricción se convierte en un `ConflictError` (HTTP 409, "El turno seleccionado ya fue reservado.") en `backend/src/core/errors/reservaSolapada.ts`.

## Consecuencias

- La restricción es la garantía final y no puede expirar, a diferencia de un bloqueo en Redis.
- Según la medición de la tarea T6 (ver `docs/historial/decisiones-auditoria.md`), solo con `EXCLUDE` hubo 324 deadlocks en 2700 pedidos y esperas de hasta 9 s, sin duplicados; el bloqueo asesor serializa por cancha y lo evita.
- Requiere la extensión `btree_gist`: el usuario de la base necesita permiso para crearla.
- Prisma no ve la restricción: no debe eliminarse al regenerar migraciones (ver skill `prisma-migraciones`).
- Con multi-tenant, el bloqueo por cancha sigue siendo válido porque la cancha pertenece a un solo negocio.

## Alternativas consideradas

- Redis (bloqueos o contadores): descartado; añade infraestructura y su garantía puede expirar.
- Solo `EXCLUDE`: descartado por los deadlocks medidos.
- Verificación en la aplicación sin restricción: descartada por condiciones de carrera.
