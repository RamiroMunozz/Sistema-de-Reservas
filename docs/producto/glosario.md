# Glosario

Los términos en español son el lenguaje del dominio. Entre paréntesis figura el identificador actual en el código (`backend/prisma/schema.prisma`), que se conserva hasta que se decida renombrarlo.

| Término | Estado | Definición |
|---|---|---|
| Negocio | Objetivo | Cliente de la plataforma: una organización que alquila canchas. Es la unidad de aislamiento de datos. Aún no existe en el esquema. |
| Complejo (`Complex`) | Actual | Sede física con nombre, dirección y teléfono; agrupa canchas. En el objetivo pertenecerá a un negocio. |
| Cancha (`Court`) | Actual | Espacio reservable con deporte (`Sport`), superficie (`Surface`), precio por turno (`pricePerSlot`), indicador de techado (`isIndoor`) y de actividad (`isActive`). |
| Horario de cancha (`CourtSchedule`) | Actual | Franja de atención de una cancha para un día de la semana: apertura, cierre y duración del turno (60 minutos por defecto). Hay uno por cancha y día. |
| Turno (slot) | Actual | Intervalo reservable de una cancha, derivado del horario de cancha. |
| Reserva (`Booking`) | Actual | Ocupación de una cancha entre `startTime` y `endTime` (UTC) por un usuario, con precio total, estado (`BookingStatus`) y método de pago (`PaymentMethod`). |
| Estado de reserva | Actual | `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`. Las reservas distintas de `CANCELLED` bloquean el turno. |
| Método de pago | Actual | `CASH` (efectivo), `TRANSFER` (transferencia), `MERCADOPAGO`. |
| Seña | Objetivo | Porcentaje del precio que se cobra online para confirmar la reserva; el resto se paga en el lugar. |
| Política de cobro | Objetivo | Configuración por negocio: total online, seña o pago en el lugar. |
| Usuario (`User`) | Actual | Cuenta con `firstName`, `lastName`, `email`, `phone` y rol (`Role`: `USER` o `ADMIN`). |
| Jugador | Objetivo | Persona que reserva. Cuenta global, única para toda la plataforma. Equivale hoy al rol `USER`. |
| Dueño | Objetivo | Cuenta que administra un único negocio. Equivale hoy, de forma aproximada, al rol `ADMIN`. |
| Super admin | Objetivo | Operador de la plataforma; da de alta y supervisa negocios. |
| Slug | Objetivo | Identificador legible del negocio en la URL pública (`tuapp.com/<slug>`). Debe ser único. |
| Webhook | Actual | Notificación que Mercado Pago envía al backend para informar el resultado de un pago (`POST /api/v1/payments/webhook`). |
| Restricción de no solapamiento | Actual | Restricción `EXCLUDE` de PostgreSQL (`bookings_sin_solapamiento`) que impide dos reservas activas solapadas en una cancha. |
