# Spec: pagos

## Propósito

Describe el comportamiento actual (single-tenant) del cobro online con Mercado Pago: creación de la preferencia de pago para una reserva existente y procesamiento del webhook que confirma o cancela la reserva según el resultado. La creación, cancelación y estados de las reservas se documentan en `openspec/specs/reservas/spec.md` y no se repiten aquí.

## Requisitos

### PAG-001: Creación de preferencia de pago

El sistema DEBE permitir que un usuario autenticado cree una preferencia de pago con `POST /api/v1/payments/create-preference` y cuerpo `{ bookingId }`, y DEBE responder 200 con `{ initPoint, sandboxInitPoint, preferenceId }` tomados de la respuesta de Mercado Pago.

#### Escenario: Preferencia creada

- Dado el dueño de una reserva en estado `CONFIRMED` o `PENDING` y Mercado Pago configurado
- Cuando envía su `bookingId`
- Entonces responde 200 con `initPoint`, `sandboxInitPoint` y `preferenceId`

#### Escenario: Sin token

- Dado un pedido sin token válido
- Cuando llama a `POST /payments/create-preference`
- Entonces responde 401 y no se genera el cobro

### PAG-002: Validación del cuerpo de la preferencia

El sistema DEBE rechazar con 400 los cuerpos donde `bookingId` falte o no sea un UUID válido, y NO DEBE consultar la reserva en ese caso.

#### Escenario: `bookingId` inválido

- Dado un usuario autenticado
- Cuando envía `bookingId: "no-es-uuid"` o un cuerpo vacío
- Entonces responde 400 y no se consulta la reserva

### PAG-003: Existencia y titularidad de la reserva

El sistema DEBE responder 404 con "Reserva no encontrada" si la reserva no existe, y 403 con "No tienes autorización para pagar esta reserva." si el `userId` de la reserva no coincide con el del token. Esto aplica también al rol `ADMIN`: no hay excepción por rol.

#### Escenario: Reserva inexistente

- Dado un UUID sin reserva
- Cuando el usuario crea la preferencia
- Entonces responde 404 y no se genera el cobro

#### Escenario: Reserva ajena

- Dada una reserva de otro usuario
- Cuando el usuario intenta pagarla
- Entonces responde 403 y no se genera el cobro

### PAG-004: Estados pagables

El sistema DEBE permitir crear la preferencia solo para reservas `PENDING` o `CONFIRMED`, y DEBE responder 409 con "Esta reserva no se puede pagar." si está `CANCELLED` o `COMPLETED`.

#### Escenario: Reserva cancelada o completada

- Dada una reserva `CANCELLED` o `COMPLETED` del usuario
- Cuando crea la preferencia
- Entonces responde 409 y no se genera el cobro

#### Escenario: Reserva ya confirmada

- Dada una reserva `CONFIRMED` del usuario
- Cuando crea la preferencia
- Entonces responde 200 (no se exige que la reserva esté pendiente de pago)

### PAG-005: Contenido de la preferencia

El sistema DEBE crear la preferencia con un único ítem de cantidad 1, `unit_price` igual al `totalPrice` de la reserva (leído de la base, nunca del cliente), `currency_id` `ARS`, título "Reserva - <nombre de la cancha>", `payer.email` igual al correo del usuario de la reserva y `external_reference` igual al `id` de la reserva.

#### Escenario: Referencia y monto

- Dada una reserva con `totalPrice` 1000
- Cuando se crea la preferencia
- Entonces el ítem lleva `unit_price` 1000 en `ARS` y `external_reference` es el `id` de la reserva

### PAG-006: URLs de retorno y de notificación

El sistema DEBE fijar `back_urls.success`, `failure` y `pending` en `<FRONTEND_URL>/mis-reservas` (con `http://localhost:5173` si `FRONTEND_URL` no está definida), NO DEBE enviar `auto_return`, y DEBE fijar `notification_url` en `<BACKEND_URL>/api/v1/payments/webhook?source_news=webhooks`.

#### Escenario: URL de notificación

- Dado `BACKEND_URL` igual a `https://api.ejemplo.test`
- Cuando se crea la preferencia
- Entonces `notification_url` es `https://api.ejemplo.test/api/v1/payments/webhook?source_news=webhooks`

#### Escenario: `FRONTEND_URL` ausente

- Dada `FRONTEND_URL` sin definir
- Cuando se crea la preferencia
- Entonces las URLs de retorno apuntan a `http://localhost:5173/mis-reservas`

### PAG-007: Variables requeridas y error 503

El sistema DEBE exigir `MERCADOPAGO_WEBHOOK_SECRET` y `MERCADOPAGO_ACCESS_TOKEN` para crear la preferencia y DEBE responder 503 con "Los pagos con Mercado Pago no están configurados." (`ServiceUnavailableError`) si falta cualquiera de las dos, sin generar el cobro. DEBE exigir también `BACKEND_URL`; si falta, la respuesta es 500 (error genérico), no 503.

#### Escenario: Falta el secreto del webhook

- Dado `MERCADOPAGO_WEBHOOK_SECRET` vacío
- Cuando el dueño de una reserva pagable crea la preferencia
- Entonces responde 503 con el mensaje de no configurado y no se genera el cobro

#### Escenario: Falta el token de acceso

- Dado `MERCADOPAGO_ACCESS_TOKEN` vacío
- Cuando se crea la preferencia
- Entonces responde 503 y no se genera el cobro

#### Escenario: Falta `BACKEND_URL`

- Dado `BACKEND_URL` vacía
- Cuando se crea la preferencia
- Entonces responde 500 y no se genera el cobro

### PAG-008: Aviso de configuración al arrancar

El servidor DEBE, al iniciar, emitir por consola una advertencia que liste las variables `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` que falten, y NO DEBE impedir el arranque por esa causa.

#### Escenario: Configuración incompleta

- Dada la ausencia de `MERCADOPAGO_WEBHOOK_SECRET`
- Cuando arranca el servidor
- Entonces registra "Mercado Pago no está configurado (faltan: MERCADOPAGO_WEBHOOK_SECRET). Los pagos online responderán 503." y continúa iniciando

No hay prueba automatizada de este aviso.

### PAG-009: Verificación de firma del webhook

El sistema DEBE verificar la firma de toda notificación recibida en `POST /api/v1/payments/webhook` (sin autenticación de usuario) con `WebhookSignatureValidator` de Mercado Pago, usando `MERCADOPAGO_WEBHOOK_SECRET`, la cabecera `x-signature`, la cabecera `x-request-id` y el `data.id` de la URL, y DEBE responder 401 con "Firma de webhook inválida." sin consultar el pago si la firma falta o no es válida, o si el secreto no está definido. NO DEBE usar el identificador de pago del cuerpo.

#### Escenario: Sin firma o secreto distinto

- Dado un pedido sin firma, o firmado con otro secreto
- Cuando llega al webhook
- Entonces responde 401 y no consulta el pago

#### Escenario: Firma de otro pago

- Dada una firma válida calculada para el pago `999` y una URL con `data.id=123456789`
- Cuando llega al webhook
- Entonces responde 401

#### Escenario: Secreto no configurado

- Dado `MERCADOPAGO_WEBHOOK_SECRET` vacío
- Cuando llega una notificación firmada
- Entonces responde 401 y no consulta el pago

#### Escenario: ID del cuerpo ignorado

- Dada una notificación firmada con `data.id=123456789` en la URL y `data.id: "999"` en el cuerpo
- Cuando se procesa
- Entonces se consulta el pago `123456789`

### PAG-010: Notificaciones que no se procesan

El sistema DEBE responder 200 con `{ received: true }` sin consultar el pago cuando la firma es válida pero el tipo de evento no es `payment`, `payment.created` o `payment.updated` (el tipo se toma del cuerpo y, si falta, de la consulta), o el `data.id` no es numérico. DEBE tolerar cuerpo o consulta con formato inesperado (se tratan como vacíos).

#### Escenario: Evento ajeno a pagos

- Dada una notificación firmada con `type=plan`
- Cuando se procesa
- Entonces responde 200 con `{ received: true }` y no consulta el pago

#### Escenario: ID no numérico

- Dado un `data.id` firmado pero no numérico
- Cuando se procesa
- Entonces responde 200 y no consulta el pago

### PAG-011: Pago sin referencia válida o reserva inexistente

El sistema DEBE consultar el pago en Mercado Pago y, si su `external_reference` no es un UUID, NO DEBE modificar ninguna reserva; si el pago está aprobado y la reserva referenciada no existe, tampoco DEBE modificar nada. En ambos casos DEBE responder 200.

#### Escenario: Referencia ajena

- Dado un pago aprobado con `external_reference: "otra-referencia"`
- Cuando se procesa el webhook
- Entonces responde 200 y no consulta ni actualiza reservas

#### Escenario: Reserva inexistente

- Dado un pago aprobado cuya referencia es un UUID sin reserva
- Cuando se procesa
- Entonces responde 200 sin cambios

### PAG-012: Pago aprobado

El sistema DEBE, ante un pago con estado `approved`, pasar la reserva referenciada a `CONFIRMED` y su `paymentMethod` a `TRANSFER` cuando la reserva está en `PENDING`, `CONFIRMED` o `CANCELLED`, y NO DEBE modificar una reserva `COMPLETED`. La actualización DEBE ser condicional al estado leído (`where: { id, status: <estado leído> }`) y ejecutarse bajo el bloqueo de la cancha. Responde 200 en todos los casos no erróneos.

#### Escenario: Reserva pendiente o confirmada

- Dado un pago aprobado con monto coincidente y una reserva `PENDING` o `CONFIRMED`
- Cuando se procesa
- Entonces se actualiza a `CONFIRMED` con `paymentMethod` `TRANSFER` y responde 200

#### Escenario: Reserva cancelada con turno libre

- Dado un pago aprobado y una reserva `CANCELLED` cuyo turno sigue libre
- Cuando se procesa
- Entonces la reserva vuelve a `CONFIRMED`

#### Escenario: Reserva completada

- Dado un pago aprobado y una reserva `COMPLETED`
- Cuando se procesa
- Entonces no se modifica y responde 200

### PAG-013: Idempotencia del webhook

El sistema DEBE tolerar notificaciones repetidas del mismo pago sin efectos adicionales perceptibles: una reserva ya `CONFIRMED` se vuelve a escribir con los mismos valores, una `COMPLETED` no se toca, y la actualización condicional al estado leído no afecta filas si el estado cambió entre la lectura y la escritura. El sistema NO registra el identificador de pago procesado.

#### Escenario: Notificación repetida

- Dado un pago aprobado ya procesado y la reserva `CONFIRMED`
- Cuando Mercado Pago reenvía la notificación
- Entonces responde 200 y la reserva queda `CONFIRMED` con `TRANSFER`

#### Escenario: Reserva completada reenviada

- Dada una reserva `COMPLETED`
- Cuando llega de nuevo la notificación aprobada
- Entonces no se actualiza

### PAG-014: Diferencia de monto

El sistema NO DEBE confirmar la reserva cuando `transaction_amount` del pago es distinto de `totalPrice` de la reserva (comparación estricta numérica, incluida la ausencia de monto); DEBE emitir una advertencia de consola con el pago y la reserva y responder 200.

#### Escenario: Monto distinto

- Dado un pago aprobado por 1 y una reserva de 1000
- Cuando se procesa
- Entonces no se actualiza la reserva, se advierte por consola y responde 200

### PAG-015: Turno ya ocupado al reconfirmar

El sistema DEBE, cuando la reconfirmación de una reserva `CANCELLED` choca con otra reserva activa (conversión a `ConflictError` por `conBloqueoDeCancha`), NO modificar la reserva, registrar una advertencia "requiere revisión manual" y responder 200 (no se reintenta).

#### Escenario: Turno tomado por otra reserva

- Dado un pago aprobado de una reserva `CANCELLED` cuyo turno fue tomado
- Cuando se procesa
- Entonces responde 200, la reserva sigue `CANCELLED` y se advierte "requiere revisión manual"

### PAG-016: Pago rechazado o cancelado

El sistema DEBE, ante un pago `rejected` o `cancelled`, pasar a `CANCELLED` la reserva referenciada solo si está en `PENDING` o `CONFIRMED` (actualización condicional), sin verificar monto y sin el bloqueo de cancha, y responder 200. Los demás estados de pago (por ejemplo `pending` o `in_process`) NO DEBEN modificar reservas.

#### Escenario: Pago rechazado

- Dado un pago `rejected` o `cancelled` con referencia válida
- Cuando se procesa
- Entonces se ejecuta una actualización a `CANCELLED` limitada a reservas `PENDING` o `CONFIRMED` y responde 200

#### Escenario: Pago pendiente

- Dado un pago con estado `pending`
- Cuando se procesa
- Entonces no se modifica la reserva y responde 200

### PAG-017: Errores del webhook y reintento

El sistema DEBE responder 500 genérico (sin detalle interno) ante cualquier error distinto de firma inválida o conflicto de turno (por ejemplo, falla de base de datos o de la consulta a Mercado Pago), de modo que Mercado Pago reintente la notificación. La falta de `MERCADOPAGO_ACCESS_TOKEN` al consultar un pago firmado produce 503 por `ServiceUnavailableError`.

#### Escenario: Falla de base de datos

- Dado un pago aprobado con monto coincidente y una falla inesperada al actualizar
- Cuando se procesa
- Entonces responde 500

#### Escenario: Falta el token de acceso

- Dada una notificación firmada y válida con `MERCADOPAGO_ACCESS_TOKEN` vacío
- Cuando se procesa
- Entonces responde 503 (comportamiento derivado del código; no hay prueba)

### PAG-018: Formato de errores

El sistema DEBE responder los errores de pagos con el formato `type/title/status/detail/instance` (errores de negocio y validación Zod) y 500 genérico para los no controlados, salvo el 401 por falta de usuario en el controlador, que usa `{ message: "Usuario no autenticado." }`.

#### Escenario: Error de negocio

- Dada una reserva ajena
- Cuando se crea la preferencia
- Entonces el cuerpo incluye `detail` con el mensaje de autorización

### PAG-019: Inicio del pago en el frontend

La página `BookingsPage` DEBE, al pulsar "Pagar con Mercado Pago", crear primero la reserva con `POST /bookings` y `paymentMethod: "TRANSFER"` (una hora, en UTC), luego llamar a `POST /payments/create-preference` con el `id` de la reserva y redirigir el navegador a `initPoint`. DEBE mostrar el `detail` o `message` del servidor, o un texto genérico, si alguna llamada falla; y "No se pudo obtener el link de pago de Mercado Pago." si no hay `initPoint`.

#### Escenario: Pago exitoso al iniciar

- Dado un jugador con un horario libre elegido
- Cuando confirma "Pagar con Mercado Pago"
- Entonces se crea la reserva, se crea la preferencia y se redirige a `initPoint`

#### Escenario: Falla de la preferencia

- Dado que `create-preference` responde un error
- Cuando se confirma el pago
- Entonces el modal muestra el mensaje de error del servidor y la reserva ya creada permanece

`MyBookingsPage` no contiene lógica de pago; solo declara el campo `paymentMethod` en su tipo.

## Fuera de alcance

- Creación, cancelación y transiciones de estado de reservas, y el pago en efectivo (dominio `reservas`).
- Autenticación y emisión de tokens (dominio `autenticacion`).
- Seña, política de cobro por negocio, reserva de invitado, reembolsos y aislamiento por negocio (objetivo, no implementado).
- Retorno del usuario desde Mercado Pago: la página `/mis-reservas` no procesa parámetros de retorno.

## Observaciones

1. Las reservas nacen `CONFIRMED` antes del pago (ver `reservas`, RES-006): quien inicia el pago ya ocupa el turno aunque nunca pague. El flujo de `BookingsPage` crea la reserva y luego la preferencia; si el usuario abandona Mercado Pago, la reserva queda `CONFIRMED` sin cobro.
2. El webhook cambia estados (a `CONFIRMED` y a `CANCELLED`) sin pasar por `TRANSICIONES_PERMITIDAS`: reconfirma reservas `CANCELLED`, transición que `reservas` RES-014 prohíbe. La cancelación por pago rechazado no usa el bloqueo de cancha; la confirmación sí.
3. Un pago `rejected` o `cancelled` cancela también una reserva `CONFIRMED` que pudo haberse pagado con otro intento, o una creada con `CASH`, ya que solo se filtra por referencia. No hay prueba de ese caso; no se pudo confirmar si es intencional.
4. El webhook fija `paymentMethod` en `TRANSFER` al aprobarse, aunque se pague con Mercado Pago: `MERCADOPAGO` existe en el enum `PaymentMethod` y en el tipo de `AdminDashboard.tsx`, pero ninguna ruta lo escribe ni acepta.
5. No se registra el identificador de pago procesado: la idempotencia depende solo del estado de la reserva. Un pago aprobado sobre una reserva `CONFIRMED` realiza una escritura redundante y una reserva pagada con `CASH` pasa a `TRANSFER`.
6. El pago aprobado se confirma aunque llegue tras una cancelación del propio usuario si el turno sigue libre (cubierto por prueba), reviviendo una reserva cancelada.
7. Si el turno ya está ocupado al reconfirmar, se responde 200 y solo se emite una advertencia de consola: el pago queda cobrado sin reserva y sin mecanismo de aviso ni reembolso (revisión manual).
8. Una diferencia de monto responde 200 sin reintento y solo con advertencia de consola; el pago cobrado queda sin vincular a una reserva confirmada. Si `transaction_amount` es `undefined` también cuenta como diferencia.
9. Se pueden crear varias preferencias por la misma reserva sin límite, y no se guarda `preferenceId` ni el pago en el modelo (`Booking` no tiene campos de pago aparte de `paymentMethod` y `totalPrice`).
10. `createPaymentPreference` no restringe el medio de pago de la reserva: una reserva `CASH` también puede pagarse online.
11. Los estados de pago intermedios (`pending`, `in_process`, `authorized`, etc.) se ignoran sin cambios; no existe un estado de reserva "pago en curso".
12. La firma se valida antes de comprobar el tipo de evento, por lo que los eventos ajenos sin firma válida reciben 401 y los firmados reciben 200.
13. `BACKEND_URL` ausente produce 500 genérico (`Error` plano), mientras que las otras dos variables producen 503; la validación al arrancar (`server.ts`) solo advierte por las variables de Mercado Pago y no por `BACKEND_URL`.
14. Se desactiva `auto_return` para evitar un error 400 en localhost (según comentario del código); el usuario vuelve a `/mis-reservas` solo si pulsa el enlace, y la página no consulta el resultado del pago.
15. El 401 del controlador de preferencias usa `{ message }`, distinto del formato `detail` del resto de errores.
16. No se ejecutaron las pruebas para esta spec. `preferenciaPago.test.ts` y `webhookPago.test.ts` simulan Prisma y el SDK de Mercado Pago (el webhook usa el validador de firma real). No hay pruebas del aviso de arranque, del 503 por token ausente en el webhook, ni del frontend.
17. En `BookingsPage` el nombre de la función (`handlePayWithMercadoPago`) y el valor enviado (`TRANSFER`) evidencian que `TRANSFER` se usa como sinónimo de Mercado Pago, contradiciendo su significado en el glosario (transferencia).

## Evidencia

- PAG-001: `backend/src/modules/payments/payments.routes.ts:9-13`; `payment.controller.ts:16-38`; `payment.service.ts:66-127`; `backend/tests/preferenciaPago.test.ts:65-74,138-156`.
- PAG-002: `payment.dto.ts:3-5`; `payment.controller.ts:28`; `preferenciaPago.test.ts:119-136`.
- PAG-003: `payment.service.ts:75-83`; `preferenciaPago.test.ts:76-89,107-117`.
- PAG-004: `payment.service.ts:20-23,85-87`; `preferenciaPago.test.ts:91-105,138-156`.
- PAG-005: `payment.service.ts:95-120`.
- PAG-006: `payment.service.ts:93,110-117`; `preferenciaPago.test.ts:158-169`.
- PAG-007: `payment.service.ts:38-63,89-92`; `backend/src/core/errors/AppError.ts:45-49`; `preferenciaPago.test.ts:171-220`.
- PAG-008: `backend/src/server.ts:8-23,28`.
- PAG-009: `payment.service.ts:129-130,144-166`; `payment.controller.ts:40-56`; `payments.routes.ts:16`; `backend/tests/webhookPago.test.ts:86-134`.
- PAG-010: `payment.service.ts:25,27,132-141`; `payment.dto.ts:7-16`; `payment.controller.ts:42-50`; `webhookPago.test.ts:234-254`.
- PAG-011: `payment.service.ts:29,168-177,201-207`; `webhookPago.test.ts:256-277`.
- PAG-012: `payment.service.ts:179-184,196-225`; `webhookPago.test.ts:137-190,203-211`; `backend/src/modules/bookings/bloqueoCancha.ts:12-25`.
- PAG-013: `payment.service.ts:205-207,219-223`; `webhookPago.test.ts:138-152,203-211`.
- PAG-014: `payment.service.ts:209-214`; `webhookPago.test.ts:154-162`.
- PAG-015: `payment.service.ts:226-234`; `webhookPago.test.ts:164-177`.
- PAG-016: `payment.service.ts:185-193`; `webhookPago.test.ts:214-232`.
- PAG-017: `payment.service.ts:60-63,159-165`; `backend/src/core/middlewares/errorHandler.ts:39-47`; `webhookPago.test.ts:192-201`.
- PAG-018: `errorHandler.ts:12-47`; `payment.controller.ts:24-26`; `preferenciaPago.test.ts:85-87`.
- PAG-019: `frontend/src/pages/BookingsPage.tsx` función `handlePayWithMercadoPago` (alrededor de 173-217) y botón "Pagar con Mercado Pago" (alrededor de 377-384); `frontend/src/pages/MyBookingsPage.tsx:12`.
- Observaciones: 1 `payment.service.ts:85`, `booking.service.ts:81`; 2 `payment.service.ts:189-193,216-225`; 3 `payment.service.ts:189-192`; 4 `payment.service.ts:220-223`, `backend/prisma/schema.prisma:41-45`, `AdminDashboard.tsx:41`; 5 `payment.service.ts:205-225`, `schema.prisma:120-122`; 6 `webhookPago.test.ts:179-190`; 7 `payment.service.ts:231-233`; 8 `payment.service.ts:209-214`; 9 `payment.service.ts:122-126`; 10 `payment.service.ts:85-87`; 11 `payment.service.ts:179-193`; 12 `payment.service.ts:129-141`; 13 `payment.service.ts:38-46,91`, `server.ts:8-11`; 14 `payment.service.ts:115`; 15 `payment.controller.ts:24-26`; 16 `webhookPago.test.ts:1-33`, `preferenciaPago.test.ts:6-21`; 17 `BookingsPage.tsx:173,189`, `docs/producto/glosario.md:14`.
