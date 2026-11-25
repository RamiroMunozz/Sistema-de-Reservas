# Glosario

Los términos en español son el lenguaje del dominio. Entre paréntesis figura el identificador actual en el código (`backend/prisma/schema.prisma`), que se conserva hasta que se decida renombrarlo.

| Término | Estado | Definición |
|---|---|---|
| Negocio (`Negocio`) | Actual (`multi-tenant-negocios`) | Cliente de la plataforma: una organización que alquila canchas. Es la unidad de aislamiento de datos. Tiene `nombre`, `slug` único y `activo`; sus complejos, reservas y dueño le pertenecen por `negocioId`. |
| Complejo (`Complex`) | Actual | Sede física con nombre, dirección y teléfono; agrupa canchas. Pertenece a un negocio (`negocioId`). |
| Cancha (`Court`) | Actual | Espacio reservable con deporte (`Sport`), superficie (`Surface`), precio por turno (`pricePerSlot`), indicador de techado (`isIndoor`) y de actividad (`isActive`). |
| Horario de cancha (`CourtSchedule`) | Actual | Franja de atención de una cancha para un día de la semana: apertura, cierre y duración del turno (60 minutos por defecto). Hay uno por cancha y día. |
| Turno (slot) | Actual | Intervalo reservable de una cancha, derivado del horario de cancha. |
| Reserva (`Booking`) | Actual | Ocupación de una cancha entre `startTime` y `endTime` (UTC) por un usuario, con precio total, estado (`BookingStatus`) y método de pago (`PaymentMethod`). |
| Estado de reserva | Actual | `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED` y `EXPIRED`. Las reservas distintas de `CANCELLED` y `EXPIRED` bloquean el turno. |
| Vencida (`EXPIRED`) | Objetivo (`reserva-invitado`) | Estado de una reserva `PENDING` impaga que superó su `expiresAt` (15 minutos). Solo lo produce el vencimiento automático (barrido o escritura bajo el bloqueo de cancha): no se asigna a mano. No ocupa el turno, no es una cancelación y es terminal. Una reserva `CANCELLED` nunca se reactiva. |
| Reserva de invitado | Objetivo (`reserva-invitado`) | Reserva sin cuenta (`userId` nulo) con nombre, apellido y teléfono. Nace `PENDING` con vencimiento a 15 minutos y se confirma al aprobarse la seña. |
| Token de acceso | Objetivo (`reserva-invitado`) | Código aleatorio de 43 caracteres con el que el invitado consulta, cancela o reintenta el pago de su reserva (`/reserva/<token>`). Se entrega una sola vez; solo se guarda su SHA-256. |
| Pago de reserva (`BookingPayment`) | Objetivo (`reserva-invitado`) | Una fila por cada pago aprobado que notifica Mercado Pago (`mpPaymentId` único). Guarda `amount`, `isValid`, `refundReason`, `refundedAt` y `createdAt`. Se clasifica al recibir el webhook y se reembolsa pago por pago. Una reserva tiene a lo sumo un pago válido sin reembolsar. |
| Motivo de reembolso (`RefundReason`) | Objetivo (`reserva-invitado`) | Causa por la que un pago debe devolverse: `AMOUNT_MISMATCH` (monto distinto del esperado), `SLOT_TAKEN` (pagó una reserva `EXPIRED` cuyo turno ya está ocupado), `PAID_AFTER_CANCEL` (pagó una reserva `CANCELLED`), `DUPLICATE_PAYMENT` (ya había un pago válido sin reembolsar) y `OWNER_DISCRETION` (el pago válido de una reserva cancelada). Se guarda al clasificar el pago, porque después no puede reconstruirse. |
| Reembolso obligatorio (`REQUIRED`) | Objetivo (`reserva-invitado`) | Derivado de la reserva: hay pagos con motivo distinto de `OWNER_DISCRETION` y sin reembolsar. El dinero cobrado no corresponde a ninguna reserva activa y el canchero debe devolverlo. |
| Reembolso a criterio (`AT_DISCRETION`) | Objetivo (`reserva-invitado`) | Derivado de la reserva: todos los pagos pendientes de devolución tienen motivo `OWNER_DISCRETION`. La reserva se canceló con la seña pagada y el canchero decide si la devuelve. |
| Método de pago | Actual | `CASH` (efectivo), `TRANSFER` (transferencia), `MERCADOPAGO`. |
| Seña | Objetivo | Porcentaje del precio que se cobra online para confirmar la reserva; el resto se paga en el lugar. En `reserva-invitado` es `Complex.depositPercent` (30 por defecto, de 1 a 100) y se guarda en `depositAmount`. |
| Política de cobro | Objetivo | Configuración por negocio: total online, seña o pago en el lugar. |
| Usuario (`User`) | Actual | Cuenta con `firstName`, `lastName`, `email`, `phone` y rol (`Role`: `JUGADOR`, `DUENO` o `SUPER_ADMIN`). |
| Jugador | Actual (`JUGADOR`) | Persona que reserva. Cuenta global, única para toda la plataforma, sin negocio asociado. Antes del cambio `multi-tenant-negocios` era el rol `USER`. |
| Dueño | Actual (`DUENO`) | Cuenta que administra un único negocio: su token lleva el `negocioId` y a lo sumo hay un dueño por negocio. Antes del cambio era el rol `ADMIN`. |
| Super admin (`SUPER_ADMIN`) | Actual (alta) / Objetivo (supervisión) | Operador de la plataforma, sin negocio asociado. Hoy solo da de alta un negocio y su dueño (`POST /api/v1/plataforma/negocios`); la gestión completa llega con `panel-super-admin`. |
| Slug | Actual | Identificador legible del negocio en la URL pública (`tuapp.com/<slug>`) y en las rutas `/api/v1/negocios/:slug/...`. Es único. El negocio de la semilla usa `principal`. |
| Pertenencia ("ajeno ≡ inexistente") | Actual | Regla de aislamiento: un recurso de otro negocio responde igual que uno inexistente (404), porque se busca por id y por negocio a la vez. |
| Webhook | Actual | Notificación que Mercado Pago envía al backend para informar el resultado de un pago (`POST /api/v1/payments/webhook`). |
| Restricción de no solapamiento | Actual | Restricción `EXCLUDE` de PostgreSQL (`bookings_sin_solapamiento`) que impide dos reservas activas solapadas en una cancha. |
