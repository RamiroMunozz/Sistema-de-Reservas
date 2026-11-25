# Delta spec: pagos (cambio `multi-tenant-negocios`)

Solo cambia el reembolso manual (PAG-024): queda limitado a los pagos de reservas del negocio del dueño. La preferencia de pago y el webhook no cambian su comportamiento observable: el negocio sale de la reserva referenciada y las credenciales de Mercado Pago siguen siendo globales (N.º 6). Al archivar el cambio, esta delta se fusiona en `openspec/specs/pagos/spec.md`.

Regla de nomenclatura: en los requisitos y escenarios de `pagos` no modificados abajo, `ADMIN` se lee `DUENO` y `USER` se lee `JUGADOR` (AUT-015). La regla general de aislamiento es NEG-010.

## MODIFICADO

### PAG-024: Reembolso manual de un pago

El sistema DEBE permitir a un `DUENO` reembolsar un pago registrado de una reserva de su negocio con `POST /api/v1/payments/admin/payments/:paymentId/refund` (`:paymentId` es el `id` del `BookingPayment`, NO el id de Mercado Pago; 401 sin token, 403 para `JUGADOR` y `SUPER_ADMIN`, 400 si no es un UUID). La operación DEBE reembolsar en Mercado Pago el pago cuyo `mpPaymentId` es el del `BookingPayment`, por su `amount`, y solo si Mercado Pago lo acepta registrar `refundedAt` con el instante actual, y responder 200 con el pago actualizado. DEBE responder 404 si el pago no existe o si su reserva pertenece a otro negocio (misma respuesta en ambos casos, NEG-010), sin llamar a Mercado Pago ni modificar el pago, y 409, sin llamar a Mercado Pago, si el pago no tiene motivo de reembolso (un pago válido aceptado de una reserva activa no se reembolsa por esta vía) o si ya fue reembolsado (`refundedAt` no nulo): repetir el reembolso de un pago ya reembolsado responde 409 y no genera un segundo reembolso. Si Mercado Pago falla, DEBE responder un error de servidor (5xx) sin detalle interno y dejar `refundedAt` nulo, de modo que pueda reintentarse. Aplica a los cinco motivos (`AMOUNT_MISMATCH`, `SLOT_TAKEN`, `PAID_AFTER_CANCEL`, `DUPLICATE_PAYMENT`, `OWNER_DISCRETION`) y a cualquier estado de la reserva. El reembolso NO se ejecuta de forma automática en ningún caso (DP-11).

Motivo: la operación por id de pago no verificaba a quién pertenece (S5); la pertenencia se determina por el negocio de la reserva del pago.
(Previously: reembolsaba cualquier pago registrado por id y exigía el rol `ADMIN`.)

#### Escenario: Reembolso exitoso
- Dado un pago con motivo `OWNER_DISCRETION` y sin `refundedAt`, de una reserva del negocio del dueño
- Cuando el `DUENO` solicita el reembolso y Mercado Pago lo acepta
- Entonces responde 200, se reembolsa el pago en Mercado Pago por su `amount` y `refundedAt` queda definido

#### Escenario: Pago de monto incorrecto en una reserva activa
- Dado un pago con motivo `AMOUNT_MISMATCH` de una reserva `PENDING` o `CONFIRMED` del negocio del dueño
- Cuando el `DUENO` solicita el reembolso y Mercado Pago lo acepta
- Entonces responde 200, `refundedAt` queda definido y la reserva conserva su estado

#### Escenario: Pago de una reserva vencida
- Dado un pago con motivo `SLOT_TAKEN` de una reserva `EXPIRED` del negocio del dueño
- Cuando el `DUENO` solicita el reembolso y Mercado Pago lo acepta
- Entonces responde 200 y `refundedAt` queda definido

#### Escenario: Pago aceptado de una reserva activa
- Dado el pago válido aceptado (sin motivo) de una reserva `CONFIRMED` del negocio del dueño
- Cuando el `DUENO` solicita el reembolso
- Entonces responde 409 y no se llama a Mercado Pago

#### Escenario: Pago ya reembolsado
- Dado un pago ya reembolsado
- Cuando el `DUENO` solicita otra vez el reembolso
- Entonces responde 409, no se llama a Mercado Pago y `refundedAt` no cambia

#### Escenario: Identificador del pago
- Dado un pago con `mpPaymentId` "111" y `id` de `BookingPayment` igual a un UUID
- Cuando el `DUENO` llama a la operación con "111" como `:paymentId`
- Entonces responde 400 (no es un UUID) y no se llama a Mercado Pago

#### Escenario: Falla de Mercado Pago
- Dado que Mercado Pago rechaza el reembolso
- Cuando el `DUENO` lo solicita
- Entonces responde 5xx y `refundedAt` sigue nulo

#### Escenario: Sin permisos
- Dado un token con rol `JUGADOR` o `SUPER_ADMIN`
- Cuando solicita el reembolso
- Entonces responde 403 y no se llama a Mercado Pago

#### Escenario: Pago inexistente
- Dado un UUID sin pago registrado
- Cuando el `DUENO` solicita el reembolso
- Entonces responde 404

#### Escenario: Pago de otro negocio
- Dados los negocios A y B y un pago con motivo de reembolso y sin `refundedAt` de una reserva de B
- Cuando el dueño de A solicita su reembolso
- Entonces responde 404, igual que para un pago inexistente, no se llama a Mercado Pago y `refundedAt` sigue nulo

## ELIMINADO

(Sin requisitos eliminados.)
