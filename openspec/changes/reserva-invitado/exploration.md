# Exploración: reserva-invitado

Copia en Engram: `sdd/reserva-invitado/explore`. Las decisiones de producto están en `docs/producto/decisiones.md` (DP-04, enmendada, y DP-09 a DP-14). Las specs base son `openspec/specs/reservas/spec.md` y `openspec/specs/pagos/spec.md`.

## Estado actual

- **Modelo:**
  - `Booking.userId` es obligatorio (`schema.prisma:116`).
  - El estado por defecto es `CONFIRMED` (`:121`).
  - No existen campos de invitado, de seña, de vencimiento ni de token.
  - `Complex` no tiene `depositPercent`.
- **Restricción EXCLUDE:** la condición `WHERE (status <> 'CANCELLED')` está en la migración `20261104120000_reservas_sin_solapamiento`, líneas 9-15.
  - Una reserva `PENDING` vencida sigue bloqueando el turno hasta que pase a `CANCELLED`.
  - `now()` no se puede usar en la condición de una restricción. Hay que cancelar las vencidas con un UPDATE explícito.
- **Reservas:**
  - `validarTurnoReservable` (`booking.service.ts:35-62`) se puede reutilizar.
  - `TRANSICIONES_PERMITIDAS` (`:24-29`) no se exporta.
  - `cancelBooking` no usa el bloqueo.
  - `getOccupiedSlots` y `court.service.ts:92-102` filtran solo por `CANCELLED`.
- **Pagos** (`payment.service.ts`):
  - La preferencia exige sesión y `booking.user.email`, y cobra `totalPrice`.
  - El webhook cancela reservas `PENDING` y `CONFIRMED` ante un pago rechazado, sin bloqueo ni validación de transiciones.
  - `confirmarReservaPagada` lee la reserva fuera del bloqueo, compara contra `totalPrice`, fija el medio de pago en `TRANSFER` y no guarda el id del pago.
- **Limitador:** `limitadorAutenticacion` cuenta solo los intentos fallidos. No hay `trust proxy`.
- **Servidor:** no hay tareas periódicas en `server.ts`.
- **Frontend:**
  - `BookingsPage` exige sesión para reservar.
  - No existe la ruta `/reserva/:codigo`.
  - `AdminDashboard` asume que `booking.user` existe.
  - En `types/index.ts`, `Booking.userId` es de tipo `string`.

## Respuestas técnicas

### 1. Esquema
- **`Booking`, campos nuevos:**
  - `userId String?`.
  - `guestFirstName`, `guestLastName`, `guestPhone` y `guestEmail?`.
  - `expiresAt?`, `depositAmount?` y `refundedAt?`.
  - `mpPaymentId?` y `accessTokenHash? @unique`.
- **`Booking`, índice nuevo:** `@@index([status, expiresAt])`.
- **`Complex`:** `depositPercent Int @default(30)`, validado entre 1 y 100.
- **Migración:** usar `migrate dev --create-only` y rechazar cualquier `DROP CONSTRAINT` que proponga Prisma. Agregar a mano un `CHECK` opcional: `user_id IS NOT NULL OR guest_phone IS NOT NULL`.

### 2. Vencimiento
- `liberarReservasVencidas(tx, courtId?)` cancela las `PENDING` vencidas de esa cancha. Se llama dentro de `conBloqueoDeCancha` antes de crear cualquier reserva.
- Un barrido global corre cada 60 segundos en `server.ts`.
- Las lecturas de ocupación, del panel diario y de las métricas excluyen las `PENDING` vencidas.
- Una reserva con `expiresAt` nulo nunca vence.

### 3. Webhook
- La lectura y la validación de la transición se hacen dentro del bloqueo, con `puedeTransicionar` exportado.
- El monto se compara contra `depositAmount`, o contra `totalPrice` si no hay seña.
- Se guarda `mpPaymentId` y se usa también para la idempotencia.
- **Pago tardío:** si el turno sigue libre, se reactiva la reserva. Si está ocupado, se guarda `mpPaymentId`, se marca para reembolso y se muestra en el panel.
- **Pago rechazado:** solo puede afectar reservas `PENDING`.
- **Preferencia de invitado:**
  - Cobra `depositAmount`.
  - `back_urls` apunta a `/reserva/<token>`.
  - Usa `expires` y `expiration_date_to`; hay que verificar esos campos en el SDK.
- **Reembolso:** con `PaymentRefund` del SDK, también a verificar.

### 4. API pública (`/api/v1/public`)
- **`POST /public/bookings`:**
  - Crea una reserva `PENDING` que vence en 15 minutos.
  - La seña se redondea a 2 decimales.
  - El token sale de `randomBytes(32)` en base64url y se guarda solo su SHA-256.
  - Devuelve `{ token, initPoint }`. Si Mercado Pago falla, se compensa cancelando la reserva.
- **`GET /public/bookings/:token`:** devuelve solo campos públicos. Si el token no existe, 404 genérico.
- **`PATCH /public/bookings/:token/cancel`:** usa el bloqueo de cancha y las transiciones permitidas.
- **Límites de abuso:**
  - Un limitador nuevo que cuenta todas las solicitudes, por ejemplo 5 cada 15 minutos por IP.
  - Un tope de reservas `PENDING` activas por teléfono, por ejemplo 2.
  - Configurar `trust proxy` según el despliegue.

### 5. Frontend
- **`BookingsPage`:** formulario de invitado. Si no hay sesión, crea la reserva por la API pública y redirige a `initPoint`.
- **`ReservaInvitadoPage`** en `/reserva/:codigo`: estado de la reserva, cuenta regresiva, botón de pago y botón de cancelación. Las fechas se muestran en UTC.
- **`AdminDashboard`:**
  - Marca de invitado y teléfono.
  - Estado de la seña.
  - Botón de `wa.me`.
  - Botón de reembolso.
  - Ajuste de `depositPercent`.
- **Otros:** el helper `utils/whatsapp.ts` arma los links, y en los tipos `userId` pasa a ser `string | null`.

### 6. Pruebas existentes afectadas
- `validacionReservas`: falta `updateMany` en el mock.
- `webhookPago`: necesita `findUnique` dentro de la transacción, y cambian las aserciones de `updateMany`.
- `preferenciaPago`: falta cubrir la rama de invitado.
- `concurrenciaReservas` e `integration`: hay que limpiar las reservas de invitado por teléfono.

## Entregas (presupuesto de ~400 líneas cada una)

| # | Entrega | Líneas estimadas |
|---|---|---|
| 1 | Esquema, migración, `liberarReservasVencidas`, filtros de ocupación, barrido y tests | ~300 |
| 2 | `POST /public/bookings` (DTO, servicio, limitador, token, `trust proxy`) y tests | ~320 |
| 3 | Preferencia de seña, `depositPercent`, webhook rediseñado y tests | ~420 |
| 4 | `GET` y `PATCH` por token, y tests | ~200 |
| 5 | Frontend público: formulario, página `/reserva/:codigo` y tipos | ~420 |
| 6 | Panel, `wa.me` y reembolso (backend y frontend) | ~420 |

## Enfoque recomendado para el vencimiento

Cancelar físicamente las reservas vencidas (UPDATE a `CANCELLED`) dentro del bloqueo, más un barrido periódico.

Se descartan dos alternativas:
- **Un estado `EXPIRED`:** obliga a recrear la restricción, el enum y las transiciones.
- **Filtrar solo en las lecturas:** no libera el turno para la restricción.

## Riesgos

- **Ocupación abusiva de turnos:** sin un limitador que cuente las reservas exitosas y sin un tope por teléfono, alguien puede bloquear turnos.
- **Cobro sin reserva:** si el turno ya fue tomado cuando llega el pago, solo queda el reembolso manual.
- **Pago rechazado:** cancelar al primer rechazo impide que el invitado reintente con otra tarjeta.
- **Token hasheado:** si el invitado pierde el link, el admin no puede reenviárselo.
- **`trust proxy` mal configurado:** el límite por IP deja de servir.
- **`userId` nulo:** afecta a tipos y consumidores que asumen `booking.user`.
- **Horario de cancha:** las reservas no consultan `CourtSchedule` (observación 7 de reservas), así que un invitado también puede reservar fuera de horario.

## Preguntas abiertas

- Q1. Porcentaje de seña por defecto (se propone 30) y rango válido (1 a 100).
- Q2. Si hace falta distinguir el vencimiento de la cancelación. Se recomienda usar solo `CANCELLED`.
- Q3. Si alcanza con `refundedAt` para saber si se reembolsó. Se recomienda que sí.
- Q4. Qué hacer con un pago rechazado de un invitado. Se recomienda ignorarlo y dejar que la reserva venza.
- Q5. Si el pago confirmado por Mercado Pago pasa a guardarse como `MERCADOPAGO` en lugar de `TRANSFER`.
- Q6. Verificar en el SDK de `mercadopago` los campos `PaymentRefund`, `expires` y `expiration_date_to`.
