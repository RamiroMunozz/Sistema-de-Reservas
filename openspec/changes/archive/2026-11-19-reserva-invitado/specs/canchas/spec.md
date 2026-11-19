# Delta spec: canchas (cambio `reserva-invitado`)

Consecuencia del vencimiento de las reservas `PENDING` de invitado (RES-026): la disponibilidad por cancha deja de marcar como ocupado un turno cuya reserva `PENDING` ya venció. La propuesta lista este cambio en las áreas afectadas (`court.service.ts`) pero no en las capacidades; se incluye aquí para mantener la coherencia con RES-012. Al archivar el cambio, esta delta se fusiona en `openspec/specs/canchas/spec.md`.

## MODIFICADO

### CAN-006: Ocupación de los turnos de la disponibilidad

El sistema DEBE marcar `isAvailable = false` en un slot cuando se solapa con alguna reserva de la cancha con estado distinto de `CANCELLED` y `EXPIRED` cuyo `startTime` cae dentro del día UTC consultado, y `isAvailable = true` en caso contrario. NO DEBE considerar las reservas `PENDING` vencidas (`expiresAt` menor o igual al instante actual), aunque el barrido aún no las haya pasado a `EXPIRED`. Un slot contiguo a una reserva (sin solapamiento) DEBE quedar disponible.

Motivo: el turno de una reserva de invitado sin pagar se libera a los 15 minutos y la reserva pasa a `EXPIRED` (RES-035).
(Previously: toda reserva distinta de `CANCELLED` ocupaba el slot.)

#### Escenario: Slot ocupado
- Dada una reserva `CONFIRMED` de 10:00 a 11:00 UTC en esa cancha y fecha
- Cuando se consulta la disponibilidad
- Entonces el slot 10:00 a 11:00 tiene `isAvailable = false` y los slots 09:00 a 10:00 y 11:00 a 12:00 tienen `isAvailable = true`

#### Escenario: Reserva cancelada
- Dada una reserva `CANCELLED` de 10:00 a 11:00 UTC
- Cuando se consulta la disponibilidad
- Entonces el slot 10:00 a 11:00 tiene `isAvailable = true`

#### Escenario: Reserva pendiente vigente
- Dada una reserva de invitado `PENDING` de 10:00 a 11:00 UTC con `expiresAt` en el futuro
- Cuando se consulta la disponibilidad
- Entonces el slot 10:00 a 11:00 tiene `isAvailable = false`

#### Escenario: Reserva pendiente vencida
- Dada una reserva de invitado `PENDING` de 10:00 a 11:00 UTC con `expiresAt` en el pasado
- Cuando se consulta la disponibilidad
- Entonces el slot 10:00 a 11:00 tiene `isAvailable = true`

#### Escenario: Reserva EXPIRED
- Dada una reserva `EXPIRED` de 10:00 a 11:00 UTC
- Cuando se consulta la disponibilidad
- Entonces el slot 10:00 a 11:00 tiene `isAvailable = true`

## ELIMINADO

Ninguno.
