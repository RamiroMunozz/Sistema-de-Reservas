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

El sistema DEBE permitir crear la preferencia solo para reservas `PENDING` o `CONFIRMED`. DEBE responder 409 si la reserva está `CANCELLED`, con el mensaje "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva." (una reserva cancelada nunca se reactiva ni se paga; para pagar hay que reservar de nuevo), y 409 con "Esta reserva no se puede pagar." si está `COMPLETED` o `EXPIRED`. No se genera ningún cobro en ninguno de estos casos.

Motivo: una reserva cancelada sin pago no se puede pagar después y el usuario necesita saber cómo seguir (regla única para cuenta e invitado, ver PAG-021). `EXPIRED` se incorpora como estado no pagable.
(Previously: `CANCELLED` y `COMPLETED` respondían 409 con el mismo mensaje "Esta reserva no se puede pagar.", sin indicar hacer una reserva nueva, y `EXPIRED` no existía.)

#### Escenario: Reserva cancelada
- Dada una reserva `CANCELLED` del usuario
- Cuando crea la preferencia
- Entonces responde 409 con "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva." y no se genera el cobro

#### Escenario: Reserva completada o vencida
- Dada una reserva `COMPLETED` o `EXPIRED` del usuario
- Cuando crea la preferencia
- Entonces responde 409 con "Esta reserva no se puede pagar." y no se genera el cobro

#### Escenario: Reserva ya confirmada
- Dada una reserva `CONFIRMED` del usuario
- Cuando crea la preferencia
- Entonces responde 200 (no se exige que la reserva esté pendiente de pago)

### PAG-005: Contenido de la preferencia

El sistema DEBE crear la preferencia de una reserva con cuenta (`POST /payments/create-preference`) con un único ítem de cantidad 1, `unit_price` igual al `totalPrice` de la reserva (leído de la base, nunca del cliente), `currency_id` `ARS`, título "Reserva - <nombre de la cancha>", `payer.email` igual al correo del usuario de la reserva y `external_reference` igual al `id` de la reserva. La preferencia de una reserva de invitado se rige por PAG-020 y cobra el `depositAmount`. Cada preferencia creada DEBE guardar su id en la reserva y vencer la anterior, si la había (PAG-025).

Motivo: la reserva de invitado no tiene usuario ni correo obligatorio y cobra solo la seña, y una preferencia nueva no debe dejar vivo el link anterior.
(Previously: el requisito describía una única preferencia, siempre por `totalPrice` y con el correo del usuario, que se podía crear varias veces sin guardar ni vencer ninguna.)

#### Escenario: Referencia y monto
- Dada una reserva con `totalPrice` 1000
- Cuando se crea la preferencia
- Entonces el ítem lleva `unit_price` 1000 en `ARS` y `external_reference` es el `id` de la reserva

#### Escenario: Reserva de invitado
- Dada una reserva de invitado con `depositAmount` 300
- Cuando se crea su preferencia
- Entonces el ítem lleva `unit_price` 300 (PAG-020)

#### Escenario: Segunda preferencia de una reserva con cuenta
- Dada una reserva con cuenta que ya tiene una preferencia guardada
- Cuando su dueño crea otra preferencia
- Entonces se guarda el id nuevo y la anterior se vence (PAG-025)

### PAG-006: URLs de retorno y de notificación

El sistema DEBE fijar, para las reservas con cuenta, `back_urls.success`, `failure` y `pending` en `<FRONTEND_URL>/mis-reservas` (con `http://localhost:5173` si `FRONTEND_URL` no está definida), y, para las reservas de invitado, en `<FRONTEND_URL>/reserva/<token>`. DEBE enviar `auto_return: "approved"` solo cuando las URLs de retorno usan `https`; con `http` (por ejemplo `localhost`) NO DEBE enviarlo. DEBE fijar `notification_url` en `<BACKEND_URL>/api/v1/payments/webhook?source_news=webhooks` en ambos casos.

Motivo: el invitado vuelve a su link privado, que muestra el estado de la reserva. Mercado Pago rechaza `auto_return` con URLs de `localhost`, y sin `auto_return` la página de pago aprobado no garantiza el regreso (T-8.4).
(Previously: las tres URLs de retorno apuntaban siempre a `/mis-reservas`, y nunca se enviaba `auto_return`.)

#### Escenario: URL de notificación
- Dado `BACKEND_URL` igual a `https://api.ejemplo.test`
- Cuando se crea la preferencia
- Entonces `notification_url` es `https://api.ejemplo.test/api/v1/payments/webhook?source_news=webhooks`

#### Escenario: `FRONTEND_URL` ausente
- Dada `FRONTEND_URL` sin definir
- Cuando se crea la preferencia de una reserva con cuenta
- Entonces las URLs de retorno apuntan a `http://localhost:5173/mis-reservas`

#### Escenario: Retorno del invitado
- Dada una reserva de invitado con token `abc`
- Cuando se crea su preferencia
- Entonces las URLs de retorno apuntan a `<FRONTEND_URL>/reserva/abc`

#### Escenario: Regreso automático con `https`
- Dada `FRONTEND_URL` igual a `https://app.ejemplo.test`
- Cuando se crea una preferencia
- Entonces se envía `auto_return: "approved"`

#### Escenario: Sin regreso automático en desarrollo
- Dada `FRONTEND_URL` sin definir (`http://localhost:5173`)
- Cuando se crea una preferencia
- Entonces no se envía `auto_return`

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

El sistema DEBE, ante un pago con estado `approved`, leer la reserva referenciada con sus pagos y validar la transición dentro del bloqueo de la cancha, y registrar el pago (PAG-026). Si ya existe un pago con ese `mpPaymentId`, NO DEBE hacer nada (PAG-013). El resultado depende de la reserva y del monto, con esta precedencia:
1. Monto distinto del esperado (PAG-014), en cualquier estado (incluida `COMPLETED`) y aunque ya exista un pago válido: motivo `AMOUNT_MISMATCH`, sin cambio de estado.
2. Monto esperado y la reserva ya tiene un pago válido sin reembolso, en cualquier estado (incluida `COMPLETED`): motivo `DUPLICATE_PAYMENT`, sin cambio de estado. Un pago ya reembolsado (`refundedAt` no nulo) NO cuenta como pago válido sin reembolso.
3. Monto esperado y reserva `COMPLETED` sin pago válido sin reembolso: el pago se registra como válido, sin motivo (cubre la reserva), y el estado no cambia.
4. Monto esperado y reserva `PENDING` (vigente o vencida aún no pasada a `EXPIRED`): pasa a `CONFIRMED`, sin motivo (pago aceptado).
5. Monto esperado y reserva `EXPIRED` (pago tardío): con el turno libre se reactiva a `CONFIRMED` (excepción deliberada a RES-014 y RES-035), sin motivo; con el turno ocupado el estado no cambia y el motivo es `SLOT_TAKEN` (PAG-015).
6. Monto esperado y reserva `CANCELLED`: NO se reactiva; el estado no cambia y el motivo es `PAID_AFTER_CANCEL`. Esta regla es única para reservas con cuenta y de invitado: una reserva `CANCELLED` nunca se reactiva.
7. Monto esperado y reserva `CONFIRMED` sin pago válido sin reembolso (por ejemplo, creada en efectivo, confirmada por el administrador o con un pago anterior ya reembolsado): el pago queda como pago aceptado, sin motivo.
El pago de una reserva `COMPLETED` se registra siempre y NUNCA cambia su estado. Queda fuera de alcance de este requisito un pago aprobado cuya `external_reference` no corresponde a ninguna reserva de este sistema: no es un pago de este sistema, NO se registra y solo emite una advertencia (PAG-011). Al confirmar o aceptar un pago sin motivo, DEBE fijar `paymentMethod` `MERCADOPAGO`. La actualización de estado DEBE ser condicional al estado leído (`where: { id, status: <estado leído> }`). Responde 200 en todos los casos no erróneos.

Motivo: resuelve las observaciones 2, 4 y 5: la lectura y la validación ocurren bajo el bloqueo, el medio de pago refleja Mercado Pago (D5) y todo pago queda registrado con su clasificación, en lugar de perderse en el log.
(Previously: la reserva se leía fuera del bloqueo, el medio de pago se fijaba en `TRANSFER`, no se guardaba el id del pago y una reserva `CANCELLED` con turno libre se reactivaba a `CONFIRMED`. Se quita esa reactivación: la propuesta (D3) la justifica solo para el pago tardío posterior al vencimiento, y reactivar una reserva que el propio usuario o invitado canceló (observación 6) contradice su decisión: quien cancela sin pagar y quiere pagar hace una reserva nueva.)

#### Escenario: Reserva de invitado pendiente
- Dado un pago aprobado con monto igual al `depositAmount` y una reserva de invitado `PENDING` vigente
- Cuando se procesa
- Entonces la reserva queda `CONFIRMED` con `paymentMethod` `MERCADOPAGO`, el pago queda registrado como válido y sin motivo, y responde 200

#### Escenario: Reserva con cuenta pendiente o confirmada
- Dado un pago aprobado con monto igual al `totalPrice` y una reserva con cuenta `PENDING` o `CONFIRMED` sin pago válido
- Cuando se procesa
- Entonces la reserva queda `CONFIRMED` con `paymentMethod` `MERCADOPAGO` y el pago registrado como aceptado

#### Escenario: Pago sobre una pendiente vencida no pasada a EXPIRED
- Dada una reserva de invitado `PENDING` con `expiresAt` en el pasado que sigue `PENDING` y ninguna otra reserva activa en su turno
- Cuando llega el pago aprobado por el monto esperado
- Entonces la reserva queda `CONFIRMED`

#### Escenario: Pago tardío con el turno libre
- Dado un pago aprobado por el monto esperado y una reserva `EXPIRED` cuyo turno sigue libre
- Cuando se procesa
- Entonces la reserva vuelve a `CONFIRMED` con `paymentMethod` `MERCADOPAGO` y el pago queda registrado sin motivo

#### Escenario: Pago tardío con el turno ocupado
- Dado un pago aprobado por el monto esperado y una reserva `EXPIRED` cuyo turno fue tomado por otra reserva activa
- Cuando se procesa
- Entonces la reserva sigue `EXPIRED` y el pago queda registrado con motivo `SLOT_TAKEN`

#### Escenario: Pago sobre una reserva cancelada
- Dado un pago aprobado por el monto esperado que llega después de que se canceló una reserva sin pago, con el turno libre
- Cuando se procesa
- Entonces la reserva sigue `CANCELLED`, responde 200 y el pago queda registrado con motivo `PAID_AFTER_CANCEL`

#### Escenario: Segundo pago válido
- Dada una reserva `CONFIRMED` con un pago válido aceptado "111"
- Cuando llega un pago aprobado "222" por el monto esperado
- Entonces la reserva no cambia y el pago "222" queda registrado con motivo `DUPLICATE_PAYMENT`

#### Escenario: Reserva con pago aceptado cancelada y pago nuevo
- Dada una reserva `CANCELLED` cuyo pago aceptado "111" pasó a `OWNER_DISCRETION`
- Cuando llega un pago aprobado "222" por el monto esperado
- Entonces la reserva sigue `CANCELLED` y el pago "222" queda con motivo `DUPLICATE_PAYMENT`

#### Escenario: Reserva completada, primer pago válido
- Dado un pago aprobado por el monto esperado y una reserva `COMPLETED` sin pago válido
- Cuando se procesa
- Entonces el pago queda registrado como válido y sin motivo, la reserva sigue `COMPLETED` y responde 200

#### Escenario: Reserva completada con pago válido previo
- Dado un pago aprobado por el monto esperado y una reserva `COMPLETED` que ya tenía un pago válido sin reembolso
- Cuando se procesa
- Entonces el pago queda registrado con motivo `DUPLICATE_PAYMENT` y la reserva sigue `COMPLETED`

#### Escenario: Reserva completada con monto incorrecto
- Dado un pago aprobado de monto distinto del esperado y una reserva `COMPLETED`, con o sin pago válido previo
- Cuando se procesa
- Entonces el pago queda registrado con motivo `AMOUNT_MISMATCH` y la reserva sigue `COMPLETED`

#### Escenario: Monto incorrecto con pago válido previo
- Dada una reserva `CONFIRMED` con un pago válido sin reembolso
- Cuando llega un pago aprobado de monto distinto del esperado
- Entonces el pago queda registrado con motivo `AMOUNT_MISMATCH` (no `DUPLICATE_PAYMENT`)

#### Escenario: Pago válido después de un reembolso
- Dada una reserva `CONFIRMED` cuyo único pago válido ya fue reembolsado (`refundedAt` definido)
- Cuando llega un pago aprobado por el monto esperado
- Entonces el pago queda registrado como válido y sin motivo (no es `DUPLICATE_PAYMENT`) y `depositStatus` es `PAID`

#### Escenario: Pago de otro sistema
- Dado un pago aprobado cuya `external_reference` no corresponde a ninguna reserva de este sistema
- Cuando se procesa
- Entonces no se registra ningún pago, se emite una advertencia y responde 200

#### Escenario: Validación bajo el bloqueo
- Dados un pago aprobado y una cancelación simultáneos sobre la misma reserva
- Cuando se procesan
- Entonces ambas operaciones se serializan por el bloqueo de la cancha y el resultado final es coherente con una de las dos secuencias posibles

### PAG-013: Idempotencia del webhook

El sistema DEBE tolerar notificaciones repetidas del mismo pago sin efectos adicionales, usando el `mpPaymentId` único de los pagos registrados: si ya existe un pago con el id notificado, NO DEBE escribir nada (ni cambiar el estado de la reserva ni modificar el pago) y DEBE responder 200. Un pago NUEVO sobre una reserva `COMPLETED` sí se registra (con la precedencia de PAG-012) sin cambiar su estado. Un pago aprobado distinto que llega a una reserva que ya tiene un pago válido NO DEBE perderse en el log ni modificar la reserva: se registra como pago nuevo con motivo `DUPLICATE_PAYMENT` (PAG-012). La actualización condicional al estado leído no afecta filas si el estado cambió entre la lectura y la escritura, y dos notificaciones simultáneas del mismo pago NO DEBEN crear dos registros.

Motivo: resuelve la observación 5: la idempotencia deja de depender solo del estado de la reserva, se evita la escritura redundante y un pago duplicado queda registrado y reembolsable.
(Previously: una reserva ya `CONFIRMED` se reescribía con los mismos valores, no se registraba el id del pago y, en la revisión anterior, un pago distinto solo emitía la advertencia "requiere revisión manual".)

#### Escenario: Notificación repetida
- Dado un pago aprobado ya registrado
- Cuando Mercado Pago reenvía la notificación
- Entonces responde 200 y no se ejecuta ninguna escritura

#### Escenario: Reserva completada reenviada
- Dada una reserva `COMPLETED` y un pago ya registrado
- Cuando llega de nuevo la misma notificación aprobada
- Entonces no se actualiza nada

#### Escenario: Pago nuevo sobre una reserva completada
- Dada una reserva `COMPLETED` y un pago aprobado con un `mpPaymentId` que no estaba registrado
- Cuando se procesa
- Entonces el pago se registra (PAG-012) y la reserva sigue `COMPLETED`

#### Escenario: Segundo pago aprobado distinto
- Dada una reserva `CONFIRMED` con el pago válido "111"
- Cuando llega la notificación de otro pago aprobado "222" por el monto esperado
- Entonces el pago "111" no se modifica, "222" queda registrado con motivo `DUPLICATE_PAYMENT` y responde 200

#### Escenario: Notificaciones simultáneas
- Dadas dos notificaciones simultáneas del mismo pago
- Cuando se procesan
- Entonces queda un único pago registrado

#### Escenario: Reserva con `CASH` ya confirmada
- Dada una reserva con `CASH` `CONFIRMED` sin pagos
- Cuando llega un pago aprobado con monto coincidente
- Entonces el pago queda registrado como aceptado y el `paymentMethod` pasa a `MERCADOPAGO`

### PAG-014: Diferencia de monto

El sistema NO DEBE confirmar ni reactivar la reserva cuando `transaction_amount` del pago aprobado es distinto del monto esperado (comparación estricta numérica; la ausencia de monto sigue la excepción de PAG-026: advertencia en el log, sin fila ni confirmación); el monto esperado es el `depositAmount` si la reserva lo tiene y, si no, el `totalPrice`. En ese caso, en cualquier estado (incluida `COMPLETED`, donde solo se registra) y aunque ya exista un pago válido (PAG-012), DEBE registrar el pago con `isValid` falso y motivo `AMOUNT_MISMATCH` sin cambiar el estado ni el `paymentMethod` de la reserva, y responder 200. El pago NO cuenta como seña pagada (PAG-023). Una reserva `PENDING` con un pago de monto incorrecto sigue `PENDING` y vence normalmente (RES-026); si luego llega un pago por el monto esperado, la confirma (PAG-012), y el pago anterior sigue pendiente de reembolso.

Motivo: la reserva de invitado cobra solo la seña, y un pago cobrado con monto incorrecto debe quedar registrado y poder reembolsarse desde el panel, sin impedir que el invitado pague bien.
(Previously: el monto esperado era siempre el `totalPrice`, la reserva no se modificaba y el pago cobrado quedaba solo como advertencia de consola.)

#### Escenario: Monto distinto
- Dado un pago aprobado por 1 y una reserva `CONFIRMED` con `CASH` de 1000 sin pagos
- Cuando se procesa
- Entonces la reserva sigue `CONFIRMED` con `paymentMethod` `CASH`, el pago queda registrado con `isValid` falso y motivo `AMOUNT_MISMATCH`, y responde 200

#### Escenario: Pendiente con monto incorrecto
- Dada una reserva de invitado `PENDING` vigente con `depositAmount` 300
- Cuando llega un pago aprobado por 250
- Entonces la reserva sigue `PENDING`, el pago queda con motivo `AMOUNT_MISMATCH` y, al vencer la reserva, pasa a `EXPIRED` conservando el pago

#### Escenario: Monto incorrecto en reserva vencida o cancelada
- Dada una reserva `EXPIRED` o `CANCELLED` y un pago aprobado de monto distinto del esperado
- Cuando se procesa
- Entonces la reserva no se reactiva y el pago queda con motivo `AMOUNT_MISMATCH`

#### Escenario: Pago correcto posterior a uno incorrecto
- Dada una reserva de invitado `PENDING` vigente con un pago `AMOUNT_MISMATCH`
- Cuando llega un pago aprobado por el `depositAmount`
- Entonces la reserva queda `CONFIRMED`, el pago correcto queda aceptado y el pago anterior sigue pendiente de reembolso

#### Escenario: Seña de invitado
- Dada una reserva de invitado con `totalPrice` 1000 y `depositAmount` 300
- Cuando llega un pago aprobado por 300
- Entonces se confirma la reserva

#### Escenario: Pago por el precio completo de un invitado
- Dada una reserva de invitado con `totalPrice` 1000 y `depositAmount` 300
- Cuando llega un pago aprobado por 1000
- Entonces no se confirma, el pago queda registrado con motivo `AMOUNT_MISMATCH` y responde 200

### PAG-015: Turno ya ocupado al reactivar

El sistema DEBE, cuando el pago aprobado por el monto esperado corresponde a una reserva `EXPIRED` cuyo turno fue tomado por otra reserva activa (conversión a `ConflictError` por `conBloqueoDeCancha`), NO cambiar el estado de la reserva, registrar el pago con motivo `SLOT_TAKEN` (reembolso obligatorio, PAG-023, visible en el panel según ADM-017) y responder 200 (no se reintenta). El pago NO DEBE quedar solo en el log.

Motivo: resuelve la observación 7: el pago cobrado sin turno deja de ser solo un registro de consola y queda reembolsable.
(Previously: el requisito aplicaba a una reserva `CANCELLED` que se reconfirmaba; la reserva no se modificaba y solo se emitía la advertencia "requiere revisión manual", sin dejar rastro del pago.)

#### Escenario: Turno tomado por otra reserva
- Dado un pago aprobado por el monto esperado de una reserva `EXPIRED` cuyo turno fue tomado
- Cuando se procesa
- Entonces responde 200, la reserva sigue `EXPIRED` y el pago queda registrado con motivo `SLOT_TAKEN`

#### Escenario: Visible para reembolso obligatorio
- Dada esa reserva
- Cuando el `ADMIN` consulta el historial
- Entonces la reserva figura con `refundDue` `REQUIRED` y el pago es reembolsable según PAG-024

#### Escenario: Notificación repetida del pago sin turno
- Dado el pago registrado con motivo `SLOT_TAKEN`
- Cuando llega de nuevo la misma notificación
- Entonces no se escribe nada y responde 200 (PAG-013)

### PAG-016: Pago rechazado o cancelado

El sistema NO DEBE modificar ninguna reserva, cualquiera sea su estado o su origen (con cuenta o de invitado), ante un pago `rejected` o `cancelled`, y DEBE responder 200. Una reserva `PENDING` de invitado sigue `PENDING` y vence por tiempo (RES-026); una reserva `CONFIRMED` sigue `CONFIRMED`. Los demás estados de pago (por ejemplo `pending` o `in_process`) tampoco DEBEN modificar reservas. Solo los pagos aprobados se registran (PAG-026).

Motivo: el usuario puede reintentar con otro medio de pago, y un rechazo no debe cancelar una reserva pagada con otro intento (observaciones 2 y 3).
(Previously: un pago `rejected` o `cancelled` pasaba a `CANCELLED` las reservas `PENDING` o `CONFIRMED`, sin el bloqueo de cancha.)

#### Escenario: Pago rechazado de una reserva pendiente
- Dado un pago `rejected` con referencia válida y una reserva de invitado `PENDING` vigente
- Cuando se procesa
- Entonces la reserva sigue `PENDING`, responde 200 y el invitado puede reintentar (PAG-021)

#### Escenario: Pago rechazado de una reserva confirmada
- Dado un pago `cancelled` para una reserva `CONFIRMED`
- Cuando se procesa
- Entonces la reserva sigue `CONFIRMED` y no se ejecuta ninguna escritura

#### Escenario: Pago pendiente
- Dado un pago con estado `pending`
- Cuando se procesa
- Entonces no se modifica la reserva, no se registra ningún pago y responde 200

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

### PAG-020: Preferencia de seña de la reserva de invitado [OBJETIVO]

El sistema DEBE crear, al crearse una reserva de invitado (RES-023), una preferencia de Mercado Pago con un único ítem de cantidad 1, `unit_price` igual al `depositAmount` de la reserva (nunca un valor del cliente), `currency_id` `ARS`, título "Seña - <nombre de la cancha>" y `external_reference` igual al `id` de la reserva. DEBE fijar la expiración de la preferencia en el `expiresAt` de la reserva, de modo que no pueda pagarse después. DEBE fijar `back_urls.success`, `failure` y `pending` en `<FRONTEND_URL>/reserva/<token>` y `notification_url` como en PAG-006. Si la reserva tiene `guestEmail`, DEBE enviarlo como `payer.email`; si no lo tiene, NO DEBE enviar `payer.email`. Las variables requeridas y el error 503 siguen PAG-007.

#### Escenario: Monto y referencia
- Dada una reserva de invitado con `totalPrice` 1000 y `depositAmount` 300
- Cuando se crea la preferencia
- Entonces el ítem lleva `unit_price` 300 en `ARS` y `external_reference` es el `id` de la reserva

#### Escenario: Vencimiento de la preferencia
- Dada una reserva con `expiresAt` a las 15:15 UTC
- Cuando se crea la preferencia
- Entonces su fecha de expiración es las 15:15 UTC

#### Escenario: Retorno al link privado
- Dado un token `abc` y `FRONTEND_URL` igual a `https://app.ejemplo.test`
- Cuando se crea la preferencia
- Entonces las tres `back_urls` son `https://app.ejemplo.test/reserva/abc`

#### Escenario: Invitado sin correo
- Dada una reserva de invitado sin `guestEmail`
- Cuando se crea la preferencia
- Entonces la preferencia no incluye `payer.email`

### PAG-021: Reintento de pago de la seña por token [OBJETIVO]

El sistema DEBE permitir, sin autenticación y con el token de la reserva, obtener un nuevo `initPoint` de la seña (PAG-020) mientras la reserva de invitado está `PENDING` y vigente y todavía no tiene un pago válido (PAG-026), de modo que el invitado pueda reintentar con otro medio de pago tras un pago rechazado, abandonado o de monto incorrecto. Un pago previo con motivo `AMOUNT_MISMATCH` NO DEBE bloquear el reintento. DEBE responder 409 si la reserva ya tiene un pago válido, o si no está `PENDING` vigente (confirmada, cancelada, vencida o completada), y 404 genérico (RES-028) si el token no corresponde a ninguna reserva. Si la reserva está `CANCELLED`, el 409 DEBE llevar un mensaje que indique que la reserva fue cancelada y que, para pagar, hay que hacer una reserva nueva ("Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva."): una reserva cancelada nunca se vuelve a pagar. La nueva preferencia vence junto con la reserva, NO DEBE extender `expiresAt` y DEBE guardar su id en la reserva reemplazando el anterior (PAG-025). Si la reserva cambió (se canceló, venció o recibió un pago válido) entre la lectura y el reemplazo del link, DEBE responder 409 con "La reserva cambió mientras se generaba el pago. Intenta de nuevo." y NO DEBE entregar el link nuevo.

Motivo: quien cancela sin pagar y quiere pagar hace una reserva nueva (regla única para cuenta e invitado); un pago de monto incorrecto no debe impedir pagar bien; y el reemplazo del link no debe pisar un cambio concurrente.
(Previously: no existía; el reintento por token se creó en este cambio con el 409 solo por estado de la reserva.)

#### Escenario: Reintento tras un rechazo
- Dada una reserva de invitado `PENDING` vigente cuyo primer pago fue rechazado
- Cuando el invitado solicita un nuevo link de pago con su token
- Entonces responde 200 con un `initPoint` y `expiresAt` no cambia

#### Escenario: Reintento tras un pago de monto incorrecto
- Dada una reserva de invitado `PENDING` vigente con un pago registrado con motivo `AMOUNT_MISMATCH`
- Cuando solicita un nuevo link de pago
- Entonces responde 200 con un `initPoint`

#### Escenario: Reserva con un pago válido
- Dada una reserva de invitado con un pago válido registrado
- Cuando solicita un nuevo link de pago
- Entonces responde 409 y no se crea ninguna preferencia

#### Escenario: Reserva vencida
- Dada una reserva `EXPIRED`, o una `PENDING` con `expiresAt` en el pasado
- Cuando se solicita un nuevo link de pago
- Entonces responde 409 y no se crea ninguna preferencia

#### Escenario: Reserva ya confirmada
- Dada una reserva de invitado `CONFIRMED`
- Cuando se solicita un nuevo link de pago
- Entonces responde 409 y no se crea ninguna preferencia

#### Escenario: Reserva cancelada sin pago
- Dada una reserva de invitado `CANCELLED` que el invitado canceló sin haber pagado
- Cuando se solicita un nuevo link de pago con su token
- Entonces responde 409 con el mensaje que indica hacer una reserva nueva y no se crea ninguna preferencia

#### Escenario: El reintento reemplaza la preferencia anterior
- Dada una reserva `PENDING` vigente con una preferencia guardada
- Cuando el invitado solicita un nuevo link de pago
- Entonces la reserva guarda el id de la preferencia nueva y la anterior se expira (si Mercado Pago falla al expirarla, igual se entrega el nuevo `initPoint` y se registra el error)

#### Escenario: Carrera al reemplazar el link
- Dada una reserva `PENDING` que se cancela o recibe un pago válido mientras se genera la preferencia nueva
- Cuando se intenta guardar el link nuevo
- Entonces responde 409 con "La reserva cambió mientras se generaba el pago. Intenta de nuevo." y no se entrega el link nuevo

#### Escenario: Token inexistente
- Dado un token que no corresponde a ninguna reserva
- Cuando se solicita un nuevo link de pago
- Entonces responde 404 con el mensaje genérico de RES-028

### PAG-022: Cálculo de la seña [OBJETIVO]

El sistema DEBE calcular el `depositAmount` de una reserva de invitado como `totalPrice` multiplicado por `depositPercent` del complejo de la cancha y dividido por 100, redondeado a 2 decimales (mitad hacia arriba), y DEBE persistirlo al crear la reserva. Un cambio posterior de `depositPercent` NO DEBE modificar el `depositAmount` de las reservas ya creadas. Con `depositPercent` igual a 100 la seña es igual al `totalPrice`. Las reservas con cuenta NO DEBEN tener `depositAmount`.

#### Escenario: Porcentaje por defecto
- Dado `totalPrice` 1000 y `depositPercent` 30 (valor por defecto)
- Cuando un invitado crea la reserva
- Entonces `depositAmount` es 300.00

#### Escenario: Redondeo
- Dado `totalPrice` 10.05 y `depositPercent` 33
- Cuando se calcula la seña
- Entonces `depositAmount` es 3.32

#### Escenario: Cobro del precio completo
- Dado `depositPercent` 100
- Cuando un invitado crea la reserva
- Entonces `depositAmount` es igual a `totalPrice`

#### Escenario: Cambio posterior del porcentaje
- Dada una reserva de invitado con `depositAmount` 300 y luego `depositPercent` modificado a 50
- Cuando se consulta la reserva
- Entonces `depositAmount` sigue en 300

### PAG-023: Estado de la seña y reembolso pendiente de la reserva [OBJETIVO]

El sistema DEBE derivar de los pagos registrados de la reserva (PAG-026), sin campos propios en la reserva, dos valores. `depositStatus`: `PAID` si existe un pago válido (`isValid`) sin reembolso; en otro caso `REFUNDED` si existe un pago válido y todos los pagos válidos fueron reembolsados; en otro caso `PENDING`. Un pago con motivo `AMOUNT_MISMATCH` NO cuenta como seña pagada. Las reservas sin `depositAmount` (con cuenta) DEBEN informar `depositStatus` nulo. `refundDue`: `REQUIRED` si existe algún pago sin reembolso con motivo de reembolso distinto de `OWNER_DISCRETION`; en otro caso `AT_DISCRETION` si los únicos pagos sin reembolso con motivo son `OWNER_DISCRETION` (el canchero decide, DP-11); en otro caso `null` (nada por reembolsar). Al pasar una reserva a `CANCELLED` por cualquier vía, DEBE registrar `depositPaidAtCancel`: verdadero si en ese momento tenía un pago válido aceptado (PAG-026), falso si no. Las reservas anteriores a este cambio NO tienen pagos registrados, porque el esquema anterior nunca guardó el id de pago de Mercado Pago y no hay nada que migrar: su `refundDue` es `null` y su `depositPaidAtCancel` no se usa para derivar nada.

Motivo: una reserva cancelada sin pago ya no se puede pagar ni reactivar; si el pago llega igual debe reembolsarse sin que el canchero tenga que decidirlo, y un pago de monto incorrecto no debe contarse como seña pagada ni quedar sin rastro.
(Previously: no existía; en la revisión anterior la seña y el reembolso se derivaban de un `mpPaymentId` único y de una marca en la reserva, reemplazados ahora por pagos registrados.)

#### Escenario: Seña pendiente
- Dada una reserva de invitado sin pagos registrados
- Cuando se informa su estado
- Entonces `depositStatus` es `PENDING` y `refundDue` es nulo

#### Escenario: Seña pagada
- Dada una reserva con un pago válido sin reembolso
- Cuando se informa su estado
- Entonces `depositStatus` es `PAID`

#### Escenario: Seña reembolsada
- Dada una reserva cuyo único pago válido tiene `refundedAt`
- Cuando se informa su estado
- Entonces `depositStatus` es `REFUNDED` y `refundDue` es nulo

#### Escenario: Reserva con cuenta
- Dada una reserva con `userId` y sin `depositAmount`
- Cuando se informa su estado
- Entonces `depositStatus` es nulo

#### Escenario: Monto no coincide
- Dada una reserva de invitado `PENDING` con un único pago con motivo `AMOUNT_MISMATCH` sin reembolso
- Cuando se informa su estado
- Entonces `depositStatus` es `PENDING` y `refundDue` es `REQUIRED`

#### Escenario: Reembolso obligatorio por turno ocupado
- Dada una reserva `EXPIRED` con un pago con motivo `SLOT_TAKEN` sin reembolso
- Cuando se informa su estado
- Entonces `refundDue` es `REQUIRED`

#### Escenario: Pagó después de cancelar
- Dada una reserva `CANCELLED` con un pago con motivo `PAID_AFTER_CANCEL` sin reembolso
- Cuando se informa su estado
- Entonces `refundDue` es `REQUIRED`

#### Escenario: A criterio del canchero
- Dada una reserva `CANCELLED` cuyo único pago sin reembolso tiene motivo `OWNER_DISCRETION`
- Cuando se informa su estado
- Entonces `refundDue` es `AT_DISCRETION`

#### Escenario: Obligatorio tiene precedencia
- Dada una reserva con un pago `OWNER_DISCRETION` y otro `DUPLICATE_PAYMENT`, ambos sin reembolso
- Cuando se informa su estado
- Entonces `refundDue` es `REQUIRED`; si se reembolsa el duplicado, pasa a `AT_DISCRETION`

#### Escenario: Registro al cancelar
- Dada una reserva con un pago válido aceptado que se cancela, y otra sin pagos que se cancela
- Cuando se persisten las cancelaciones
- Entonces la primera queda con `depositPaidAtCancel` verdadero y la segunda con falso

#### Escenario: Sin reembolso pendiente
- Dada una reserva `CONFIRMED` con su pago válido aceptado, o una reserva anterior a este cambio sin pagos
- Cuando se informa su estado
- Entonces `refundDue` es nulo

### PAG-024: Reembolso manual de un pago [OBJETIVO]

El sistema DEBE permitir a un `ADMIN` reembolsar un pago registrado con `POST /api/v1/payments/admin/payments/:paymentId/refund` (`:paymentId` es el `id` del `BookingPayment`, NO el id de Mercado Pago; 401 sin token, 403 para `USER`, 400 si no es un UUID). La operación DEBE reembolsar en Mercado Pago el pago cuyo `mpPaymentId` es el del `BookingPayment`, por su `amount`, y solo si Mercado Pago lo acepta registrar `refundedAt` con el instante actual, y responder 200 con el pago actualizado. DEBE responder 404 si el pago no existe y 409, sin llamar a Mercado Pago, si el pago no tiene motivo de reembolso (un pago válido aceptado de una reserva activa no se reembolsa por esta vía) o si ya fue reembolsado (`refundedAt` no nulo): repetir el reembolso de un pago ya reembolsado responde 409 y no genera un segundo reembolso. Si Mercado Pago falla, DEBE responder un error de servidor (5xx) sin detalle interno y dejar `refundedAt` nulo, de modo que pueda reintentarse. Aplica a los cinco motivos (`AMOUNT_MISMATCH`, `SLOT_TAKEN`, `PAID_AFTER_CANCEL`, `DUPLICATE_PAYMENT`, `OWNER_DISCRETION`) y a cualquier estado de la reserva. El reembolso NO se ejecuta de forma automática en ningún caso (DP-11).

Motivo: una reserva puede tener varios pagos a reembolsar por motivos distintos; el reembolso se decide y se registra pago por pago.
(Previously: no existía; el reembolso se define en este cambio, por pago registrado y no por reserva.)

#### Escenario: Reembolso exitoso
- Dado un pago con motivo `OWNER_DISCRETION` y sin `refundedAt`
- Cuando el `ADMIN` solicita el reembolso y Mercado Pago lo acepta
- Entonces responde 200, se reembolsa el pago en Mercado Pago por su `amount` y `refundedAt` queda definido

#### Escenario: Pago de monto incorrecto en una reserva activa
- Dado un pago con motivo `AMOUNT_MISMATCH` de una reserva `PENDING` o `CONFIRMED`
- Cuando el `ADMIN` solicita el reembolso y Mercado Pago lo acepta
- Entonces responde 200, `refundedAt` queda definido y la reserva conserva su estado

#### Escenario: Pago de una reserva vencida
- Dado un pago con motivo `SLOT_TAKEN` de una reserva `EXPIRED`
- Cuando el `ADMIN` solicita el reembolso y Mercado Pago lo acepta
- Entonces responde 200 y `refundedAt` queda definido

#### Escenario: Pago aceptado de una reserva activa
- Dado el pago válido aceptado (sin motivo) de una reserva `CONFIRMED`
- Cuando el `ADMIN` solicita el reembolso
- Entonces responde 409 y no se llama a Mercado Pago

#### Escenario: Pago ya reembolsado
- Dado un pago ya reembolsado
- Cuando el `ADMIN` solicita otra vez el reembolso
- Entonces responde 409, no se llama a Mercado Pago y `refundedAt` no cambia

#### Escenario: Identificador del pago
- Dado un pago con `mpPaymentId` "111" y `id` de `BookingPayment` igual a un UUID
- Cuando el `ADMIN` llama a la operación con "111" como `:paymentId`
- Entonces responde 400 (no es un UUID) y no se llama a Mercado Pago

#### Escenario: Falla de Mercado Pago
- Dado que Mercado Pago rechaza el reembolso
- Cuando el `ADMIN` lo solicita
- Entonces responde 5xx y `refundedAt` sigue nulo

#### Escenario: Sin permisos
- Dado un token con rol `USER`
- Cuando solicita el reembolso
- Entonces responde 403 y no se llama a Mercado Pago

#### Escenario: Pago inexistente
- Dado un UUID sin pago registrado
- Cuando el `ADMIN` solicita el reembolso
- Entonces responde 404

### PAG-025: Invalidación del link de pago al cancelar o reemplazar la preferencia [OBJETIVO]

El sistema DEBE guardar en la reserva el id de la preferencia de Mercado Pago vigente (`mpPreferenceId`) cada vez que crea una preferencia, ya sea la de una reserva con cuenta (`POST /payments/create-preference`) o la de una reserva de invitado (PAG-020 y PAG-021). Cuando la reserva ya tenía una preferencia guardada, la nueva la reemplaza: el sistema DEBE guardar el id nuevo y vencer la anterior con la misma invalidación de mejor esfuerzo, tanto en la vía con cuenta como en el reintento por token (PAG-021); si Mercado Pago falla al vencer la anterior, igual se entrega la preferencia nueva y el error se registra. Al pasar una reserva a `CANCELLED` por cualquier vía (la ruta del jugador, RES-011; el token del invitado, RES-029; el cambio de estado del administrador, RES-015; o cualquier otra), DEBE actualizar esa preferencia en Mercado Pago para que expire en ese momento, de modo que el link ya no pueda pagarse. Es de mejor esfuerzo: si Mercado Pago falla, la cancelación DEBE confirmarse igual (200), el error DEBE registrarse y la reserva NO DEBE quedar sin cancelar. Si la reserva no tiene preferencia guardada, la cancelación NO DEBE llamar a Mercado Pago. Un pago aprobado que llegue igual (por ejemplo, con la preferencia ya abierta en el navegador) se registra según PAG-012 y PAG-026. La compensación por falla de Mercado Pago al crear la reserva (RES-032) no invalida nada, porque no llegó a guardarse ninguna preferencia.

#### Escenario: Preferencia guardada al crearla
- Dado un invitado que crea una reserva, o un jugador con cuenta que crea la preferencia de una reserva
- Cuando Mercado Pago devuelve el id de la preferencia
- Entonces la reserva queda con ese id guardado

#### Escenario: La preferencia nueva reemplaza a la anterior (cuenta)
- Dada una reserva con cuenta con una preferencia guardada
- Cuando su dueño llama otra vez a `POST /payments/create-preference`
- Entonces la reserva guarda el id de la preferencia nueva y se pide a Mercado Pago que la anterior expire en ese momento

#### Escenario: Falla al vencer la preferencia anterior
- Dada una reserva con cuenta con una preferencia guardada y Mercado Pago que falla al vencerla
- Cuando su dueño crea una preferencia nueva
- Entonces responde 200 con la preferencia nueva guardada y el error se registra

#### Escenario: Cancelación del invitado invalida el link
- Dada una reserva de invitado `PENDING` con preferencia guardada
- Cuando el invitado la cancela con su token
- Entonces responde 200 y se actualiza la preferencia para que expire en ese momento

#### Escenario: Cancelación del jugador invalida el link
- Dada una reserva con cuenta con preferencia guardada
- Cuando su dueño la cancela con `PATCH /bookings/:id/cancel`
- Entonces responde 200 y se actualiza la preferencia para que expire en ese momento

#### Escenario: Cancelación del administrador invalida el link
- Dada una reserva con preferencia guardada
- Cuando el `ADMIN` la cancela con `PATCH /bookings/admin/:id/status`
- Entonces responde 200 y se actualiza la preferencia para que expire en ese momento

#### Escenario: Falla de Mercado Pago al expirar
- Dada una reserva con preferencia guardada y Mercado Pago que rechaza la actualización
- Cuando se cancela la reserva
- Entonces responde 200, la reserva queda `CANCELLED` y el error se registra

#### Escenario: Reserva sin preferencia
- Dada una reserva sin preferencia guardada (por ejemplo, creada en efectivo)
- Cuando se cancela
- Entonces responde 200 y no se llama a Mercado Pago

### PAG-026: Registro de los pagos aprobados [OBJETIVO]

El sistema DEBE registrar cada pago aprobado que Mercado Pago informa por el webhook para una reserva existente como un pago de la reserva (`BookingPayment`) con: su `mpPaymentId` (único en todo el sistema, base de la idempotencia), su `amount` (`transaction_amount`), `isValid` (verdadero si el monto es igual al esperado: `depositAmount` si la reserva lo tiene y, si no, `totalPrice`). Un pago aprobado sin `transaction_amount` NO DEBE confirmar la reserva ni crear fila (la columna `amount` es obligatoria): DEBE registrarse una advertencia en el log con el id del pago para revisarlo a mano. Mercado Pago informa el monto en todo pago aprobado, así que es un caso excepcional, su `refundReason` (nulo, o uno de `AMOUNT_MISMATCH`, `SLOT_TAKEN`, `PAID_AFTER_CANCEL`, `DUPLICATE_PAYMENT`, `OWNER_DISCRETION`) su `refundedAt` (nulo hasta que se reembolsa) y su `createdAt`. NINGÚN pago aprobado de una reserva existente DEBE quedar solo en el log. El pago aceptado de una reserva es su pago válido sin motivo de reembolso (el que la confirmó o respalda). Un pago ya reembolsado (`refundedAt` no nulo) NO cuenta como pago válido sin reembolso: un pago válido nuevo posterior a un reembolso se acepta como tal (PAG-012). Al cancelar una reserva con un pago aceptado, ese pago DEBE pasar a motivo `OWNER_DISCRETION` (el reembolso lo decide el canchero, DP-11) y `depositPaidAtCancel` queda verdadero. Un pago aprobado cuya `external_reference` no corresponde a ninguna reserva de este sistema no es de este sistema: se rige por PAG-011 y NO se registra (solo advertencia).

#### Escenario: Pago registrado
- Dado un pago aprobado "111" por el monto esperado de una reserva `PENDING`
- Cuando se procesa el webhook
- Entonces queda un pago de la reserva con `mpPaymentId` "111", su `amount`, `isValid` verdadero, sin motivo y sin `refundedAt`

#### Escenario: Id único
- Dado un pago registrado con `mpPaymentId` "111"
- Cuando se intenta registrar otro pago con el mismo `mpPaymentId`
- Entonces no se crea un segundo registro

#### Escenario: Cancelar una reserva con pago aceptado
- Dada una reserva `CONFIRMED` con su pago aceptado
- Cuando se cancela por cualquier vía
- Entonces el pago queda con motivo `OWNER_DISCRETION`, `depositPaidAtCancel` es verdadero y no se reembolsa de forma automática

#### Escenario: Cancelar una reserva sin pago aceptado
- Dada una reserva `PENDING` con solo un pago `AMOUNT_MISMATCH`
- Cuando se cancela
- Entonces ese pago conserva su motivo y `depositPaidAtCancel` es falso

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
