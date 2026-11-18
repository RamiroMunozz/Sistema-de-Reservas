# Delta spec: pagos (cambio `reserva-invitado`)

Agrega el cobro de la seña de la reserva de invitado (cálculo, preferencia, reintento y estado derivado), el registro de cada pago aprobado como un pago de la reserva con su motivo de reembolso, y el reembolso manual por pago. Rediseña el webhook: valida la transición dentro del bloqueo de cancha, registra cada pago aprobado (con su id de Mercado Pago único, que da la idempotencia), guarda `MERCADOPAGO` como medio de pago, y clasifica todo pago que no confirma una reserva con un motivo de reembolso (`AMOUNT_MISMATCH`, `SLOT_TAKEN`, `PAID_AFTER_CANCEL`, `DUPLICATE_PAYMENT`, `OWNER_DISCRETION`) en lugar de dejarlo solo en el log. Una reserva `CANCELLED` nunca se reactiva ni se paga (PAG-004 y PAG-021 responden 409 con el aviso de hacer una reserva nueva; PAG-025 invalida el link al cancelar). Un pago rechazado deja de cancelar reservas. Usa el estado `EXPIRED` definido en la delta de `reservas` (RES-035). Resuelve las observaciones 1 y 7 (para invitados), 2, 3, 4 y 5 de `pagos`, y resuelve en parte la 9 y la 14. Los requisitos PAG-001 a PAG-003, PAG-007 a PAG-011 y PAG-017 a PAG-019 no cambian. Los nombres de campos y de entidades de pago (`BookingPayment` con `mpPaymentId` único, `amount`, `isValid`, `refundReason`, `refundedAt` y `createdAt`; y en la reserva `depositPaidAtCancel`, `mpPreferenceId` y el derivado `refundDue`) son los acordados con el diseño. Todos los requisitos son `[OBJETIVO]`. Al archivar el cambio, esta delta se fusiona en `openspec/specs/pagos/spec.md`.

## AGREGADO

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

El sistema DEBE registrar cada pago aprobado que Mercado Pago informa por el webhook para una reserva existente como un pago de la reserva (`BookingPayment`) con: su `mpPaymentId` (único en todo el sistema, base de la idempotencia), su `amount` (`transaction_amount`), `isValid` (verdadero si el monto es igual al esperado: `depositAmount` si la reserva lo tiene y, si no, `totalPrice`; la ausencia de monto es inválida), su `refundReason` (nulo, o uno de `AMOUNT_MISMATCH`, `SLOT_TAKEN`, `PAID_AFTER_CANCEL`, `DUPLICATE_PAYMENT`, `OWNER_DISCRETION`) su `refundedAt` (nulo hasta que se reembolsa) y su `createdAt`. NINGÚN pago aprobado de una reserva existente DEBE quedar solo en el log. El pago aceptado de una reserva es su pago válido sin motivo de reembolso (el que la confirmó o respalda). Un pago ya reembolsado (`refundedAt` no nulo) NO cuenta como pago válido sin reembolso: un pago válido nuevo posterior a un reembolso se acepta como tal (PAG-012). Al cancelar una reserva con un pago aceptado, ese pago DEBE pasar a motivo `OWNER_DISCRETION` (el reembolso lo decide el canchero, DP-11) y `depositPaidAtCancel` queda verdadero. Un pago aprobado cuya `external_reference` no corresponde a ninguna reserva de este sistema no es de este sistema: se rige por PAG-011 y NO se registra (solo advertencia).

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

## MODIFICADO

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

El sistema DEBE fijar, para las reservas con cuenta, `back_urls.success`, `failure` y `pending` en `<FRONTEND_URL>/mis-reservas` (con `http://localhost:5173` si `FRONTEND_URL` no está definida), y, para las reservas de invitado, en `<FRONTEND_URL>/reserva/<token>`. NO DEBE enviar `auto_return`, y DEBE fijar `notification_url` en `<BACKEND_URL>/api/v1/payments/webhook?source_news=webhooks` en ambos casos.

Motivo: el invitado vuelve a su link privado, que muestra el estado de la reserva.
(Previously: las tres URLs de retorno apuntaban siempre a `/mis-reservas`.)

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
- Entonces las URLs de retorno apuntan a `<FRONTEND_URL>/reserva/abc` y no se envía `auto_return`

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

El sistema NO DEBE confirmar ni reactivar la reserva cuando `transaction_amount` del pago aprobado es distinto del monto esperado (comparación estricta numérica, incluida la ausencia de monto); el monto esperado es el `depositAmount` si la reserva lo tiene y, si no, el `totalPrice`. En ese caso, en cualquier estado (incluida `COMPLETED`, donde solo se registra) y aunque ya exista un pago válido (PAG-012), DEBE registrar el pago con `isValid` falso y motivo `AMOUNT_MISMATCH` sin cambiar el estado ni el `paymentMethod` de la reserva, y responder 200. El pago NO cuenta como seña pagada (PAG-023). Una reserva `PENDING` con un pago de monto incorrecto sigue `PENDING` y vence normalmente (RES-026); si luego llega un pago por el monto esperado, la confirma (PAG-012), y el pago anterior sigue pendiente de reembolso.

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

## ELIMINADO

Ninguno.
