# Delta spec: reservas (cambio `reserva-invitado`)

Agrega la reserva de invitado (sin cuenta) por la API pública, su vencimiento a los 15 minutos (que pasa la reserva a un estado nuevo, `EXPIRED`), la consulta y la cancelación por link privado, los límites de abuso y las pantallas del frontend. Modifica los requisitos que hoy asumen que toda reserva tiene usuario, nace `CONFIRMED` y solo conoce los estados `PENDING`, `CONFIRMED`, `CANCELLED` y `COMPLETED`. Resuelve las observaciones 1 (solo para invitados) y 2 de `reservas`. El pago de la seña y el webhook se especifican en la delta de `pagos`; el panel del canchero, en la de `administracion`. Todos los requisitos son `[OBJETIVO]`: no están implementados. Al archivar el cambio, esta delta se fusiona en `openspec/specs/reservas/spec.md`.

## AGREGADO

### RES-023: Creación de reserva de invitado [OBJETIVO]

El sistema DEBE permitir, sin autenticación, crear una reserva con `POST /api/v1/public/bookings` y cuerpo `courtId`, `startTime`, `endTime`, `guestFirstName`, `guestLastName`, `guestPhone` y `guestEmail` (opcional). DEBE aplicar `validarTurnoReservable` (RES-004 y RES-005) y el no solapamiento (RES-007), crear la reserva sin usuario (`userId` nulo) con estado `PENDING`, `totalPrice` igual al `pricePerSlot` de la cancha, `depositAmount` calculado según PAG-022 y `expiresAt` igual al instante de creación más 15 minutos, y DEBE responder 201 con `{ token, initPoint }`. El `courtId` y las fechas siguen las reglas de RES-002 y RES-019 (UTC). El `initPoint` es el de la preferencia de seña (PAG-020).

#### Escenario: Reserva de invitado válida
- Dada una cancha activa con `pricePerSlot` 1000, `depositPercent` 30 y un turno libre en el futuro
- Cuando un visitante sin sesión envía el cuerpo completo y válido
- Entonces responde 201 con `token` e `initPoint`, y la reserva queda `PENDING`, con `userId` nulo, `totalPrice` 1000, `depositAmount` 300 y `expiresAt` 15 minutos después de la creación

#### Escenario: Turno ocupado
- Dado un turno con una reserva activa (RES-007)
- Cuando un invitado pide ese turno
- Entonces responde 409 con "El turno seleccionado ya fue reservado." y no crea la reserva

#### Escenario: Validación del turno
- Dada una cancha inactiva o un `startTime` en el pasado
- Cuando un invitado envía el pedido
- Entonces responde 400 con el mismo mensaje que RES-004 y no crea la reserva

#### Escenario: Sin sesión permitida
- Dado un pedido sin cabecera `Authorization`
- Cuando llama a `POST /api/v1/public/bookings` con datos válidos
- Entonces no responde 401 y procesa el pedido

### RES-024: Datos del invitado [OBJETIVO]

El sistema DEBE exigir `guestFirstName` y `guestLastName` no vacíos tras recortar espacios y de hasta 100 caracteres, y `guestPhone` con formato internacional: tras quitar espacios, guiones, paréntesis y un `+` inicial, solo dígitos y entre 8 y 15 de ellos. DEBE aceptar `guestEmail` solo si es un correo válido y tratarlo como opcional. DEBE persistir `guestPhone` normalizado (solo dígitos). Ante un dato inválido o ausente DEBE responder 400 con la lista `errors` (`field` y `message`) y NO DEBE crear la reserva.

#### Escenario: Teléfono con formato libre
- Dado `guestPhone` igual a "+54 9 11 5555-1234"
- Cuando se crea la reserva
- Entonces se persiste "5491155551234"

#### Escenario: Faltan datos obligatorios
- Dado un cuerpo sin `guestLastName`, o con `guestFirstName` formado solo por espacios
- Cuando se envía el pedido
- Entonces responde 400 con `errors` que indica el campo y no se crea la reserva

#### Escenario: Teléfono inválido
- Dado `guestPhone` igual a "abc" o con 5 dígitos
- Cuando se envía el pedido
- Entonces responde 400 con `errors` que indica `guestPhone`

#### Escenario: Correo omitido
- Dado un cuerpo válido sin `guestEmail`
- Cuando se crea la reserva
- Entonces responde 201 y la reserva se persiste sin correo

### RES-025: Token de acceso privado [OBJETIVO]

El sistema DEBE generar para cada reserva de invitado un token aleatorio de 32 bytes codificado en base64url (43 caracteres), DEBE devolverlo una sola vez en la respuesta de creación (RES-023) y DEBE persistir únicamente su hash SHA-256 (`accessTokenHash`, único). NO DEBE persistir el token en claro ni devolverlo en ninguna otra respuesta.

#### Escenario: Token devuelto una vez
- Dada una reserva de invitado recién creada
- Cuando se inspecciona la respuesta de creación
- Entonces `token` tiene 43 caracteres del alfabeto base64url y su SHA-256 coincide con el `accessTokenHash` persistido

#### Escenario: Token no recuperable
- Dada una reserva de invitado existente
- Cuando se consultan las respuestas de `GET /public/bookings/:token` y del panel del administrador
- Entonces ninguna incluye el token ni su hash

#### Escenario: Tokens distintos
- Dadas dos reservas de invitado
- Cuando se crean
- Entonces sus tokens y sus hashes son distintos

### RES-026: Vencimiento de las reservas PENDING [OBJETIVO]

El sistema DEBE pasar a `EXPIRED` toda reserva `PENDING` con `expiresAt` menor o igual al instante actual, de modo que el turno quede libre (RES-035). DEBE ejecutar ese cambio para la cancha involucrada dentro del bloqueo de cancha (RES-008) y antes de validar el solapamiento de cualquier creación de reserva en esa cancha. El vencimiento NO DEBE producir `CANCELLED`. Una reserva con `expiresAt` nulo NO DEBE vencer nunca, y una reserva que ya no está `PENDING` NO DEBE vencer aunque tenga `expiresAt`.

#### Escenario: Turno liberado por vencimiento
- Dada una reserva de invitado `PENDING` cuyo `expiresAt` ya pasó y que aún no fue pasada a `EXPIRED`
- Cuando otro pedido reserva el mismo turno
- Entonces la reserva vencida pasa a `EXPIRED` (no a `CANCELLED`) y el nuevo pedido responde 201

#### Escenario: Reserva sin vencimiento
- Dada una reserva `PENDING` creada por un administrador o por un jugador, con `expiresAt` nulo
- Cuando pasa cualquier lapso de tiempo
- Entonces no se cancela por vencimiento

#### Escenario: Reserva confirmada
- Dada una reserva `CONFIRMED` con `expiresAt` en el pasado
- Cuando corre la liberación de vencidas
- Entonces sigue `CONFIRMED`

#### Escenario: Aún no vencida
- Dada una reserva `PENDING` con `expiresAt` dentro de 5 minutos
- Cuando otro pedido reserva el mismo turno
- Entonces responde 409

### RES-027: Barrido periódico de reservas vencidas [OBJETIVO]

El servidor DEBE ejecutar, cada 60 segundos, el paso a `EXPIRED` de todas las reservas `PENDING` vencidas de cualquier cancha (RES-026), para que los turnos se liberen aunque nadie intente reservarlos. Un error en una pasada NO DEBE detener el servidor ni las pasadas siguientes.

#### Escenario: Liberación sin actividad
- Dada una reserva de invitado `PENDING` que venció y ningún pedido sobre su cancha
- Cuando transcurre el siguiente barrido
- Entonces la reserva queda `EXPIRED`

#### Escenario: Falla de una pasada
- Dado un error de base de datos durante un barrido
- Cuando se ejecuta
- Entonces se registra el error y el siguiente barrido se ejecuta normalmente

### RES-028: Consulta de la reserva de invitado por token [OBJETIVO]

El sistema DEBE devolver con `GET /api/v1/public/bookings/:token` (sin autenticación) la reserva cuyo `accessTokenHash` coincide con el SHA-256 del token, con solo los campos públicos: `status`, `startTime`, `endTime`, `expiresAt`, `totalPrice`, `depositAmount`, `depositStatus` (PAG-023), `guestFirstName`, `refundAtOwnerDiscretion` y `court` con `name` y `sport`. `refundAtOwnerDiscretion` es `true` cuando la reserva está `PENDING` o `CONFIRMED` y su seña está pagada (`depositStatus` `PAID`), es decir, cuando cancelarla dejaría la devolución a criterio del canchero (RES-029); en cualquier otro caso es `false`. NO DEBE exponer el teléfono, el correo, `userId`, los pagos registrados (ni sus ids de Mercado Pago), `accessTokenHash` ni datos de reembolso. Una reserva `PENDING` vencida (aunque el barrido aún no la haya pasado a `EXPIRED`) DEBE informarse con `status` `EXPIRED`. Si el token no corresponde a ninguna reserva o no tiene un formato válido DEBE responder 404 con el mismo mensaje genérico en ambos casos.

#### Escenario: Token válido
- Dada una reserva de invitado `PENDING` vigente
- Cuando se consulta con su token
- Entonces responde 200 con los campos públicos y sin teléfono, correo, pagos registrados ni hash

#### Escenario: Token inexistente
- Dado un token con formato válido que no corresponde a ninguna reserva
- Cuando se consulta
- Entonces responde 404 con un mensaje genérico

#### Escenario: Token con formato inválido
- Dado un token con caracteres fuera del alfabeto base64url o de longitud distinta de 43
- Cuando se consulta
- Entonces responde 404 con el mismo mensaje genérico que en el caso anterior

#### Escenario: Reserva vencida no barrida
- Dada una reserva `PENDING` con `expiresAt` en el pasado que sigue `PENDING` en la base
- Cuando se consulta con su token
- Entonces `status` es `EXPIRED`

#### Escenario: Indicador de devolución a criterio del canchero
- Dada una reserva de invitado `CONFIRMED` con seña pagada
- Cuando se consulta con su token
- Entonces `refundAtOwnerDiscretion` es `true`; con una reserva `PENDING` sin pago es `false`

### RES-029: Cancelación de la reserva de invitado por token [OBJETIVO]

El sistema DEBE permitir con `PATCH /api/v1/public/bookings/:token/cancel` (sin autenticación) cancelar la reserva identificada por el token cuando está `PENDING` vigente o `CONFIRMED`, pasándola a `CANCELLED` dentro del bloqueo de cancha y aplicando las transiciones de RES-014, y DEBE responder 200 con los campos públicos de RES-028. No hay límite de tiempo para cancelar una reserva `CONFIRMED`. DEBE responder 409 si la reserva está `CANCELLED`, `EXPIRED` (incluida una `PENDING` vencida aún no barrida) o `COMPLETED`, y 404 genérico (RES-028) si el token no corresponde a ninguna reserva. La cancelación NO DEBE reembolsar la seña: el reembolso lo decide el canchero o dueño (DP-11, PAG-024). Una reserva cancelada NO DEBE reactivarse ni volver a pagarse (PAG-021 y PAG-012): para pagar hay que hacer una reserva nueva. Al cancelar, el sistema DEBE registrar si la seña ya estaba pagada (PAG-023) e invalidar el link de pago vigente en Mercado Pago como mejor esfuerzo; si Mercado Pago falla, la cancelación se confirma igual y el error se registra (PAG-025). La respuesta DEBE incluir `refundAtOwnerDiscretion` igual a `true` cuando la seña estaba pagada al cancelar, para que el cliente informe de forma explícita que la devolución del dinero queda a criterio del canchero.

#### Escenario: Cancelación de una reserva pendiente
- Dada una reserva de invitado `PENDING` vigente
- Cuando el invitado la cancela con su token
- Entonces responde 200 con `status` `CANCELLED` y el turno queda libre

#### Escenario: Cancelación de una reserva confirmada con seña pagada
- Dada una reserva de invitado `CONFIRMED` con seña pagada
- Cuando el invitado la cancela
- Entonces responde 200 con `refundAtOwnerDiscretion` `true`, la reserva pasa a `CANCELLED`, su pago aceptado queda con motivo `OWNER_DISCRETION` y no se reembolsa de forma automática

#### Escenario: Cancelación sin seña pagada
- Dada una reserva de invitado `PENDING` vigente sin pago
- Cuando el invitado la cancela
- Entonces responde 200 con `refundAtOwnerDiscretion` `false`

#### Escenario: Cancelación sin límite de anticipación
- Dada una reserva de invitado `CONFIRMED` cuyo turno empieza dentro de 10 minutos
- Cuando el invitado la cancela
- Entonces responde 200 y la reserva pasa a `CANCELLED`

#### Escenario: Estado terminal
- Dada una reserva `CANCELLED`, `EXPIRED` o `COMPLETED`
- Cuando se intenta cancelar con su token
- Entonces responde 409 y no se modifica

#### Escenario: Token inexistente
- Dado un token que no corresponde a ninguna reserva
- Cuando se intenta cancelar
- Entonces responde 404 con el mensaje genérico de RES-028

#### Escenario: Cancelación invalida el link de pago
- Dada una reserva de invitado `PENDING` vigente con preferencia guardada
- Cuando el invitado la cancela con su token
- Entonces responde 200, la reserva queda `CANCELLED` y se pide a Mercado Pago que la preferencia expire en ese momento (PAG-025)

#### Escenario: Falla de Mercado Pago al invalidar el link
- Dada una reserva de invitado con preferencia guardada y Mercado Pago que falla
- Cuando el invitado la cancela
- Entonces responde 200, la reserva queda `CANCELLED` y el error se registra

#### Escenario: Una cancelada sin pago no se vuelve a pagar
- Dada una reserva de invitado que el invitado canceló sin pagar
- Cuando solicita un nuevo link de pago (PAG-021)
- Entonces responde 409 con el mensaje que indica hacer una reserva nueva

#### Escenario: Cancelación concurrente
- Dadas dos cancelaciones simultáneas de la misma reserva
- Cuando se procesan
- Entonces una responde 200 y la otra 409, sin deadlocks

### RES-030: Límite de solicitudes por IP en la creación pública [OBJETIVO]

El sistema DEBE limitar por dirección IP las solicitudes a `POST /api/v1/public/bookings`, contando todas (las exitosas y las rechazadas) dentro de una ventana de tiempo configurable, y DEBE responder 429 sin crear la reserva cuando una IP supera el máximo configurado. El servidor DEBE tomar la IP del cliente según una configuración explícita de `trust proxy`, de modo que un cliente no pueda eludir el límite con cabeceras falsificadas. Las consultas y cancelaciones por token (RES-028 y RES-029) DEBERÍAN tener un límite propio, más permisivo.

#### Escenario: Exceso de solicitudes
- Dada una IP que ya alcanzó el máximo de solicitudes en la ventana
- Cuando envía otro `POST /public/bookings`
- Entonces responde 429 y no crea la reserva

#### Escenario: Cuentan también las solicitudes inválidas
- Dada una IP que agotó el máximo con solicitudes rechazadas por validación (400)
- Cuando envía una solicitud válida dentro de la misma ventana
- Entonces responde 429

#### Escenario: Otra IP
- Dada una IP que superó el límite
- Cuando otra IP envía una solicitud válida
- Entonces la segunda se procesa con normalidad

#### Escenario: Cabecera falsificada
- Dada una IP que superó el límite
- Cuando cambia la cabecera `X-Forwarded-For` en cada solicitud sin que el proxy configurado la haya escrito
- Entonces el límite se sigue aplicando a su IP real

### RES-031: Tope de reservas PENDING por teléfono [OBJETIVO]

El sistema DEBE limitar la cantidad de reservas `PENDING` vigentes (no vencidas) asociadas a un mismo `guestPhone` normalizado y DEBE responder 429 con un mensaje propio, sin crear la reserva, cuando el teléfono ya alcanzó el tope. El tope DEBE ser configurable (valor por defecto: 2). Las reservas `PENDING` vencidas, `EXPIRED`, `CONFIRMED`, `CANCELLED` y `COMPLETED` NO DEBEN contar. La comprobación DEBE ejecutarse dentro del bloqueo de cancha o de una forma que no permita superar el tope con pedidos concurrentes.

#### Escenario: Tope alcanzado
- Dado un teléfono con 2 reservas `PENDING` vigentes
- Cuando crea una tercera
- Entonces responde 429 y no se crea la reserva

#### Escenario: Una reserva vencida no cuenta
- Dado un teléfono con 1 reserva `PENDING` vigente y 1 vencida
- Cuando crea otra reserva
- Entonces responde 201

#### Escenario: Una reserva confirmada no cuenta
- Dado un teléfono con 2 reservas `CONFIRMED` y ninguna `PENDING`
- Cuando crea otra reserva
- Entonces responde 201

#### Escenario: Mismo teléfono con distinto formato
- Dado un teléfono con 2 reservas `PENDING` vigentes cargado como "+54 9 11 5555-1234"
- Cuando se envía el mismo número como "5491155551234"
- Entonces responde 429

### RES-032: Compensación ante falla de Mercado Pago en la creación [OBJETIVO]

El sistema DEBE, si falla la creación de la preferencia de seña después de crear la reserva de invitado (por configuración ausente o por error de Mercado Pago), pasar esa reserva a `CANCELLED` para liberar el turno, y DEBE responder con un error de servidor (5xx) sin devolver `token` ni detalle interno.

#### Escenario: Falla de Mercado Pago
- Dado que Mercado Pago rechaza la creación de la preferencia
- Cuando un invitado crea una reserva válida
- Entonces responde 5xx, la reserva queda `CANCELLED` y el turno puede reservarse de nuevo

#### Escenario: Mercado Pago sin configurar
- Dado `MERCADOPAGO_ACCESS_TOKEN` vacío
- Cuando un invitado crea una reserva válida
- Entonces responde 503 con el mensaje de PAG-007 y la reserva no deja el turno ocupado

### RES-033: Titular obligatorio de la reserva [OBJETIVO]

La base de datos DEBE rechazar toda reserva que no tenga titular, es decir, sin `userId` y sin `guestPhone`. Una reserva con `userId` NO DEBE requerir datos de invitado, y una reserva de invitado NO DEBE tener `userId`.

#### Escenario: Alta sin titular
- Dado un alta directa en base sin `userId` ni `guestPhone`
- Cuando se inserta
- Entonces la base la rechaza

#### Escenario: Reserva con cuenta
- Dada una reserva creada con sesión
- Cuando se persiste
- Entonces tiene `userId` y no tiene datos de invitado

### RES-034: Página de la reserva de invitado (frontend) [OBJETIVO]

El frontend DEBE exponer, sin exigir sesión, la ruta `/reserva/:codigo`, que consulta `GET /public/bookings/:codigo` y muestra el estado de la reserva, la cancha, la fecha y la hora del turno en UTC (`getUTCHours()`, `getUTCMinutes()`), la seña y su estado. Mientras la reserva está `PENDING` vigente DEBE mostrar una cuenta regresiva hasta `expiresAt` y un botón de pago (PAG-021); al llegar a cero DEBE mostrar la reserva como vencida y retirar el botón de pago. Una reserva `EXPIRED` DEBE mostrarse como "Vencida", sin botón de pago ni de cancelación. Una reserva `CANCELLED` DEBE mostrarse como "Cancelada", sin botón de pago ni de cancelación, y DEBE ofrecer "Reservar de nuevo", un enlace a la página de reservas, con una indicación de que para pagar hay que hacer una reserva nueva. DEBE ofrecer un botón de cancelación con confirmación mientras la reserva esté `PENDING` o `CONFIRMED`. Cuando `refundAtOwnerDiscretion` es `true`, la confirmación de la cancelación DEBE mostrar, antes de enviar el pedido, una advertencia explícita de que la devolución de la seña queda a criterio del canchero o dueño y no es automática; tras cancelar DEBE volver a mostrar ese aviso si la respuesta trae `refundAtOwnerDiscretion` `true`. Con un código inexistente DEBE mostrar un mensaje de reserva no encontrada. DEBE mostrar el `detail` o `message` de error del servidor.

#### Escenario: Reserva pendiente
- Dada una reserva de invitado `PENDING` a la que le restan 10 minutos
- Cuando el invitado abre `/reserva/<token>`
- Entonces ve el estado "pendiente de pago", la cuenta regresiva y el botón de pago

#### Escenario: Vencimiento en pantalla
- Dada la página abierta con la cuenta regresiva en cero
- Cuando se agota el tiempo
- Entonces la reserva se muestra vencida y el botón de pago desaparece

#### Escenario: Cancelación con confirmación
- Dada una reserva `CONFIRMED`
- Cuando el invitado pulsa "Cancelar" y acepta la confirmación
- Entonces se llama a `PATCH /public/bookings/<token>/cancel` y la pantalla muestra la reserva cancelada

#### Escenario: Advertencia al cancelar con seña pagada
- Dada una reserva de invitado `CONFIRMED` con `refundAtOwnerDiscretion` `true`
- Cuando el invitado pulsa "Cancelar"
- Entonces la confirmación muestra que la devolución de la seña queda a criterio del canchero o dueño y no se envía el pedido hasta que el invitado acepta

#### Escenario: Cancelación sin seña pagada
- Dada una reserva `PENDING` sin pago, con `refundAtOwnerDiscretion` `false`
- Cuando el invitado pulsa "Cancelar"
- Entonces la confirmación no muestra la advertencia de devolución

#### Escenario: Rechazar la advertencia
- Dada la advertencia de devolución visible
- Cuando el invitado rechaza la confirmación
- Entonces no se envía ningún pedido y la reserva sigue sin cambios

#### Escenario: Reserva cancelada
- Dada una reserva con `status` `CANCELLED`, aunque el invitado todavía tenga abierta una pestaña con el botón de pago
- Cuando abre o recarga `/reserva/<token>`
- Entonces se muestra "Cancelada", no hay botón de pago ni de cancelación y se ofrece "Reservar de nuevo" hacia la página de reservas

#### Escenario: Reservar de nuevo
- Dada una reserva `CANCELLED` mostrada en la página
- Cuando el invitado pulsa "Reservar de nuevo"
- Entonces se lo lleva a la página de reservas, sin reutilizar la reserva cancelada

#### Escenario: Reserva vencida
- Dada una reserva con `status` `EXPIRED`
- Cuando el invitado abre `/reserva/<token>`
- Entonces se muestra "Vencida" sin botón de pago ni de cancelación

#### Escenario: Código inexistente
- Dado un código que el servidor responde con 404
- Cuando se abre la página
- Entonces se muestra un mensaje de reserva no encontrada y ningún dato de reserva

#### Escenario: Retorno desde Mercado Pago
- Dado un invitado que vuelve de Mercado Pago a `/reserva/<token>` tras un pago aprobado
- Cuando la página consulta la reserva
- Entonces muestra el estado vigente devuelto por el servidor (`CONFIRMED` o, si la notificación aún no llegó, `PENDING`)

### RES-035: Estado EXPIRED [OBJETIVO]

El sistema DEBE incorporar el estado de reserva `EXPIRED` (vencida), que se usa únicamente para una reserva `PENDING` cuyo `expiresAt` venció sin que se aprobara el pago (RES-026). `EXPIRED` NO DEBE ocupar el turno: se excluye del solapamiento (RES-007 y RES-009), de la disponibilidad (RES-012 y CAN-006) y de la agenda (RES-013), igual que `CANCELLED`. `EXPIRED` NO DEBE usarse para una cancelación del invitado, del jugador o del canchero (esas producen `CANCELLED`). Ningún pedido de cambio de estado del administrador (RES-015) NI de usuario DEBE poder fijar `EXPIRED`: se rechaza con 400. `EXPIRED` es terminal, con la única excepción de la reactivación por pago aprobado tardío con el turno libre (PAG-012). Glosario: `EXPIRED` = reserva `PENDING` que liberó su turno por no pagarse a tiempo.

#### Escenario: Estado producido solo por vencimiento
- Dada una reserva de invitado `PENDING` que el invitado cancela antes de vencer
- Cuando se cancela
- Entonces queda `CANCELLED` y no `EXPIRED`

#### Escenario: El administrador no puede fijar EXPIRED
- Dado un `ADMIN` y una reserva `PENDING`
- Cuando envía `PATCH /bookings/admin/:id/status` con `status: "EXPIRED"`
- Entonces responde 400 y la reserva no cambia

#### Escenario: EXPIRED no ocupa turno
- Dada una reserva `EXPIRED` de 10:00 a 11:00 en una cancha
- Cuando otro pedido reserva ese turno
- Entonces responde 201

#### Escenario: EXPIRED es terminal
- Dada una reserva `EXPIRED`
- Cuando el administrador pide `CONFIRMED` o `CANCELLED` por la ruta de cambio de estado
- Entonces responde 409 y la reserva sigue `EXPIRED`

## MODIFICADO

### RES-006: Estado inicial y precio de la reserva

El sistema DEBE crear toda reserva de jugador (`POST /bookings`) o de administrador (`POST /bookings/admin/create`) con estado `CONFIRMED` y con `totalPrice` igual al `pricePerSlot` de la cancha en ese momento, y DEBE crear toda reserva de invitado (RES-023) con estado `PENDING`, `expiresAt` a 15 minutos y el mismo `totalPrice`. Una reserva de invitado pasa a `CONFIRMED` solo cuando se aprueba el pago de la seña (PAG-012) o cuando lo hace un administrador (RES-015).

Motivo: la reserva de invitado no puede ocupar el turno de forma definitiva sin pago (punto A3 de la auditoría, observación 1). Las reservas con cuenta conservan el comportamiento actual; su cambio queda para `politica-cobro`.
(Previously: toda reserva, de jugador o de administrador, nacía `CONFIRMED`.)

#### Escenario: Reserva de jugador
- Dado una cancha con `pricePerSlot` 1000
- Cuando un jugador reserva con `CASH`
- Entonces la reserva queda `CONFIRMED` con `totalPrice` 1000

#### Escenario: Reserva con TRANSFER
- Dado un jugador que reserva con `TRANSFER`
- Cuando se crea la reserva
- Entonces nace `CONFIRMED` igualmente, sin depender de un pago

#### Escenario: Reserva de invitado
- Dada una cancha con `pricePerSlot` 1000
- Cuando un invitado reserva por la API pública
- Entonces la reserva nace `PENDING` con `totalPrice` 1000 y `expiresAt` definido

#### Escenario: Reserva de administrador
- Dado un `ADMIN` que crea una reserva
- Cuando se persiste
- Entonces nace `CONFIRMED` con `expiresAt` nulo

### RES-007: No solapamiento de reservas activas

El sistema NO DEBE permitir dos reservas con estado distinto de `CANCELLED` y `EXPIRED` que se solapen en una misma cancha. Una reserva `PENDING` vencida (RES-026) DEJA de bloquear el turno: pasa a `EXPIRED` antes de evaluar el solapamiento. Ante un solapamiento DEBE responder 409 con el mensaje "El turno seleccionado ya fue reservado.". Los turnos contiguos y los de otras canchas DEBEN permitirse.

Motivo: una reserva de invitado `PENDING` sin pagar libera el turno a los 15 minutos y pasa al estado `EXPIRED` (RES-035).
(Previously: toda reserva distinta de `CANCELLED` bloqueaba el turno sin excepción por vencimiento y no existía `EXPIRED`.)

#### Escenario: Mismo turno
- Dada una reserva activa de 10:00 a 11:00
- Cuando otro pedido reserva 10:00 a 11:00 en la misma cancha
- Entonces responde 409 con el mensaje de turno ocupado

#### Escenario: Solapamiento parcial
- Dada una reserva activa de 10:00 a 12:00
- Cuando se solicita 11:00 a 13:00 en la misma cancha
- Entonces responde 409

#### Escenario: Turnos contiguos y otra cancha
- Dada una reserva activa de 10:00 a 11:00
- Cuando se solicita 11:00 a 12:00 en la misma cancha, o 10:00 a 11:00 en otra cancha
- Entonces responde 201 en ambos casos

#### Escenario: Turno liberado por cancelación
- Dada una reserva cancelada de 10:00 a 11:00
- Cuando se solicita ese mismo turno
- Entonces responde 201

#### Escenario: Turno liberado por vencimiento
- Dada una reserva de invitado `PENDING` de 10:00 a 11:00 cuyo `expiresAt` ya pasó
- Cuando se solicita ese mismo turno
- Entonces responde 201

#### Escenario: Turno de una reserva ya vencida
- Dada una reserva `EXPIRED` de 10:00 a 11:00
- Cuando se solicita ese mismo turno
- Entonces responde 201

#### Escenario: Reserva pendiente vigente
- Dada una reserva de invitado `PENDING` de 10:00 a 11:00 que vence dentro de 5 minutos
- Cuando se solicita ese mismo turno
- Entonces responde 409

#### Escenario: Concurrencia
- Dados 20 pedidos simultáneos por el mismo turno (o 5 de jugador y 5 de admin, repetido 30 veces; o una mezcla de pedidos de jugador, de administrador y de invitado)
- Cuando se procesan
- Entonces exactamente uno responde 201 y los demás 409, sin deadlocks

### RES-009: Restricciones de integridad en la base

La base de datos DEBE rechazar reservas con `end_time` no posterior a `start_time` (`bookings_horario_valido`) y reservas activas solapadas por cancha (`bookings_sin_solapamiento`, `EXCLUDE USING gist` sobre `court_id` y `tstzrange(start_time, end_time)`, excluyendo `CANCELLED` y `EXPIRED`). La migración que incorpora `EXPIRED` DEBE conservar la restricción sin permitir ventanas en las que reservas activas puedan solaparse; el diseño define cómo.

Motivo: una reserva `EXPIRED` libera el turno y no debe bloquearlo en la base (RES-035).
(Previously: la restricción excluía solo `CANCELLED`.)

#### Escenario: Horario invertido
- Dado un alta directa en base con fin anterior al inicio
- Cuando se inserta
- Entonces la base la rechaza

#### Escenario: Solapamiento detectado por la restricción
- Dado que la restricción `bookings_sin_solapamiento` reporta una violación
- Cuando el error llega a `conBloqueoDeCancha`
- Entonces se convierte en 409 "El turno seleccionado ya fue reservado."

#### Escenario: Reserva EXPIRED no participa de la restricción
- Dada una reserva `EXPIRED` de 10:00 a 11:00 y una reserva `CONFIRMED` del mismo turno y cancha
- Cuando se insertan
- Entonces la base acepta ambas

#### Escenario: Dos reservas activas solapadas
- Dadas una reserva `PENDING` y una `CONFIRMED` solapadas en la misma cancha
- Cuando se insertan
- Entonces la base rechaza la segunda

### RES-011: Cancelación de la reserva propia

El sistema DEBE permitir a un usuario autenticado cancelar con `PATCH /bookings/:id/cancel` solo sus propias reservas en estado `PENDING` o `CONFIRMED`, pasándolas a `CANCELLED`. La lectura del estado y la actualización DEBEN ejecutarse dentro del bloqueo de la cancha (RES-008). Una reserva cancelada NO DEBE reactivarse nunca, ni por pago (PAG-012). Al cancelar, el sistema DEBE registrar si la seña ya estaba pagada (PAG-023) e invalidar el link de pago vigente en Mercado Pago como mejor esfuerzo, sin impedir la cancelación si falla (PAG-025). DEBE responder 404 si no existe, 403 si pertenece a otro usuario o es una reserva de invitado (sin usuario) y 409 si ya está `CANCELLED`, `EXPIRED` o `COMPLETED`.

Motivo: resuelve la observación 2 (la cancelación no usaba el bloqueo de cancha) y define el caso de las reservas sin usuario, que no pertenecen a ninguna cuenta.
(Previously: la cancelación no se ejecutaba bajo el bloqueo de cancha, la ruta no consideraba reservas sin usuario y no invalidaba el link de pago; una reserva cancelada podía reactivarse por un pago posterior. Ahora, quien cancela sin pagar y quiere pagar hace una reserva nueva.)

#### Escenario: Cancelación propia
- Dada una reserva `CONFIRMED` del usuario
- Cuando la cancela
- Entonces responde 200 y el estado pasa a `CANCELLED`

#### Escenario: Reserva ajena
- Dada una reserva de otro usuario
- Cuando la intenta cancelar (incluso con rol `ADMIN` por esta ruta)
- Entonces responde 403 y no se modifica

#### Escenario: Reserva de invitado
- Dada una reserva de invitado (sin `userId`)
- Cuando un usuario autenticado intenta cancelarla por esta ruta
- Entonces responde 403 y no se modifica

#### Escenario: Estado terminal
- Dada una reserva `CANCELLED`, `EXPIRED` o `COMPLETED`
- Cuando se intenta cancelar
- Entonces responde 409

#### Escenario: Inexistente
- Dado un UUID de reserva que no existe
- Cuando se intenta cancelar
- Entonces responde 404

#### Escenario: Cancelación invalida el link de pago
- Dada una reserva con cuenta `PENDING` o `CONFIRMED` con una preferencia de pago guardada
- Cuando su dueño la cancela
- Entonces la reserva pasa a `CANCELLED` y se pide a Mercado Pago que la preferencia expire en ese momento (PAG-025)

#### Escenario: Falla al invalidar el link
- Dada una reserva con preferencia guardada y Mercado Pago que falla
- Cuando su dueño la cancela
- Entonces responde 200, la reserva queda `CANCELLED` y el error se registra

#### Escenario: Una cancelada no se reactiva
- Dada una reserva `CANCELLED` sin pago
- Cuando llega un pago aprobado (PAG-012) o se intenta crear su preferencia (PAG-004)
- Entonces la reserva sigue `CANCELLED`

#### Escenario: Cancelación bajo el bloqueo
- Dadas una cancelación y una creación simultáneas sobre la misma cancha
- Cuando se procesan
- Entonces se serializan por el bloqueo de esa cancha y ninguna produce un estado inconsistente

### RES-012: Consulta pública de horarios ocupados

El sistema DEBE devolver con `GET /bookings/availability?courtId&date` (sin autenticación) la lista de horas de inicio ocupadas del día UTC indicado, con formato `HH:MM` en UTC, considerando las reservas de esa cancha con estado distinto de `CANCELLED` y `EXPIRED` (incluye `PENDING`, `CONFIRMED` y `COMPLETED`) cuyo `startTime` cae en ese día. NO DEBE considerar las reservas `PENDING` vencidas (`expiresAt` menor o igual al instante actual), aunque el barrido aún no las haya pasado a `EXPIRED`.

Motivo: el turno de una reserva de invitado sin pagar se libera a los 15 minutos (estado `EXPIRED`, RES-035).
(Previously: toda reserva distinta de `CANCELLED` figuraba como ocupada.)

#### Escenario: Día con reservas
- Dada una reserva 10:00 a 11:00 UTC no cancelada en la fecha
- Cuando se consulta la disponibilidad
- Entonces la respuesta incluye `"10:00"`

#### Escenario: Reserva completada
- Dada una reserva `COMPLETED` a las 10:00
- Cuando se consulta la disponibilidad
- Entonces `"10:00"` sigue figurando ocupado

#### Escenario: Reserva pendiente vigente
- Dada una reserva de invitado `PENDING` a las 10:00 con `expiresAt` en el futuro
- Cuando se consulta la disponibilidad
- Entonces `"10:00"` figura ocupado

#### Escenario: Reserva pendiente vencida
- Dada una reserva de invitado `PENDING` a las 10:00 con `expiresAt` en el pasado
- Cuando se consulta la disponibilidad
- Entonces `"10:00"` no figura ocupado

#### Escenario: Reserva vencida ya pasada a EXPIRED
- Dada una reserva `EXPIRED` a las 10:00
- Cuando se consulta la disponibilidad
- Entonces `"10:00"` no figura ocupado

#### Escenario: Parámetros inválidos
- Dado un `courtId` que no es UUID o una fecha inexistente
- Cuando se consulta
- Entonces responde 400

### RES-013: Agenda diaria del administrador

El sistema DEBE devolver con `GET /bookings/admin/daily?date` (solo `ADMIN`) las reservas no canceladas y no vencidas (estado distinto de `CANCELLED` y `EXPIRED`) cuyo `startTime` cae en el día UTC indicado, ordenadas por `startTime` ascendente, con la cancha incluida y, según el titular, el usuario (`id`, `firstName`, `lastName`, `email`) o `null` si es una reserva de invitado. Cada reserva DEBE incluir `depositAmount`, `depositStatus` y `refundDue` (PAG-023), sus pagos registrados con motivo y reembolso (PAG-026) y los datos del invitado (`guestFirstName`, `guestLastName`, `guestPhone`, `guestEmail`). NO DEBE incluir las reservas `PENDING` vencidas ni las `EXPIRED`.

Motivo: la agenda debe admitir reservas sin usuario y no mostrar turnos ya liberados.
(Previously: incluía siempre el usuario y todas las reservas no canceladas.)

#### Escenario: Día con reservas
- Dado un `ADMIN` y reservas no canceladas en la fecha
- Cuando consulta la agenda
- Entonces recibe 200 con las reservas ordenadas por hora y sin las canceladas

#### Escenario: Día sin reservas
- Dado un `ADMIN` y una fecha sin reservas
- Cuando consulta la agenda
- Entonces recibe 200 con lista vacía

#### Escenario: Reserva de invitado
- Dado un `ADMIN` y una reserva de invitado `PENDING` vigente en la fecha
- Cuando consulta la agenda
- Entonces la reserva figura con `user` nulo, `guestFirstName`, `guestLastName`, `guestPhone` y `depositStatus`

#### Escenario: Reserva pendiente vencida
- Dado un `ADMIN` y una reserva de invitado `PENDING` con `expiresAt` en el pasado
- Cuando consulta la agenda
- Entonces esa reserva no figura

#### Escenario: Reserva EXPIRED
- Dado un `ADMIN` y una reserva `EXPIRED` en la fecha
- Cuando consulta la agenda
- Entonces esa reserva no figura

### RES-014: Transiciones de estado permitidas

El sistema DEBE permitir únicamente las transiciones `PENDING` a `CONFIRMED` o `CANCELLED`, y `CONFIRMED` a `COMPLETED` o `CANCELLED`, por las rutas de cambio de estado y de cancelación. `CANCELLED`, `COMPLETED` y `EXPIRED` son estados terminales. La transición `PENDING` a `EXPIRED` la produce solo el vencimiento (RES-026), nunca un pedido de usuario o de administrador. La única transición que sale de `EXPIRED` es la reactivación a `CONFIRMED` por un pago aprobado con el turno libre (PAG-012). Cualquier otra transición (incluida la de un estado a sí mismo) NO DEBE aplicarse y DEBE responder 409 con "No se puede cambiar una reserva de <actual> a <nuevo>.".

Motivo: se incorpora el estado `EXPIRED` (RES-035).
(Previously: los estados terminales eran solo `CANCELLED` y `COMPLETED`, y no existía `EXPIRED`.)

#### Escenario: Transición permitida
- Dada una reserva `CONFIRMED`
- Cuando el administrador pide `COMPLETED`
- Entonces responde 200 y el estado cambia

#### Escenario: Reconfirmar una cancelada
- Dada una reserva `CANCELLED` cuyo turno ya fue tomado por otra
- Cuando el administrador pide `CONFIRMED`
- Entonces responde 409 y la reserva sigue `CANCELLED`

#### Escenario: Transiciones rechazadas
- Dadas las combinaciones CANCELLED a COMPLETED, COMPLETED a CANCELLED, CONFIRMED a PENDING, CONFIRMED a CONFIRMED, PENDING a COMPLETED, EXPIRED a CONFIRMED y EXPIRED a CANCELLED
- Cuando el administrador las solicita
- Entonces cada una responde 409 y no actualiza

#### Escenario: Vencimiento por el sistema
- Dada una reserva `PENDING` vencida
- Cuando corre el vencimiento (RES-026 o RES-027)
- Entonces pasa a `EXPIRED` sin que intervenga ningún pedido de usuario

### RES-015: Cambio de estado por el administrador

El sistema DEBE permitir a un `ADMIN` cambiar el estado de cualquier reserva con `PATCH /bookings/admin/:id/status` y cuerpo `{ status }` (`PENDING`, `CONFIRMED`, `CANCELLED` o `COMPLETED`; `EXPIRED` NO es un valor aceptado, RES-035), aplicando RES-014 y ejecutando la actualización bajo el bloqueo de la cancha. DEBE responder 200 con la reserva, su cancha y su usuario (`null` si es una reserva de invitado); 404 si no existe; 400 si el `status` o el `id` son inválidos. Cuando el nuevo estado es `CANCELLED`, DEBE registrar si la seña ya estaba pagada (PAG-023) e invalidar el link de pago vigente en Mercado Pago como mejor esfuerzo: si Mercado Pago falla, la cancelación se confirma igual (200) y el error se registra (PAG-025). Una reserva cancelada NO DEBE reactivarse nunca.

Motivo: la cancelación del administrador debe vencer el link de Mercado Pago igual que la del jugador y la del invitado (PAG-025), y la ruta debe admitir reservas sin usuario.
(Previously: la cancelación no invalidaba el link de pago, la respuesta incluía siempre el usuario y no existía el estado `EXPIRED`.)

#### Escenario: Cancelación por el administrador
- Dada una reserva `CONFIRMED` de cualquier usuario
- Cuando el `ADMIN` pide `CANCELLED`
- Entonces responde 200 y el turno queda libre

#### Escenario: Cancelación con preferencia guardada
- Dada una reserva `PENDING` o `CONFIRMED` con una preferencia de pago guardada
- Cuando el `ADMIN` pide `CANCELLED`
- Entonces responde 200 y se pide a Mercado Pago que la preferencia expire en ese momento

#### Escenario: Falla de Mercado Pago al invalidar el link
- Dada una reserva con preferencia guardada y Mercado Pago que falla
- Cuando el `ADMIN` pide `CANCELLED`
- Entonces responde 200, la reserva queda `CANCELLED` y el error se registra

#### Escenario: Cancelación sin preferencia
- Dada una reserva sin preferencia guardada
- Cuando el `ADMIN` pide `CANCELLED`
- Entonces responde 200 y no se llama a Mercado Pago

#### Escenario: Reserva de invitado
- Dada una reserva de invitado
- Cuando el `ADMIN` cambia su estado
- Entonces responde 200 con `user` nulo

#### Escenario: Estado desconocido
- Dado `status: "BORRADA"` o `status: "EXPIRED"`
- Cuando se envía el pedido
- Entonces responde 400 y no se actualiza

#### Escenario: Reserva inexistente
- Dado un UUID sin reserva
- Cuando el `ADMIN` cambia su estado
- Entonces responde 404

### RES-020: Grilla de reserva del jugador (frontend)

La página `BookingsPage` DEBE mostrar, por cancha, una grilla fija de horarios de 08:00 a 22:00 en intervalos de una hora, deshabilitando los horarios devueltos por `GET /bookings/availability` para la fecha elegida. Con sesión DEBE enviar reservas de una hora (`startTime` y `endTime` en UTC) con `CASH` (pago en el club) o con `TRANSFER` seguido de `POST /payments/create-preference` (Mercado Pago). Sin sesión DEBE mostrar un formulario de invitado con nombre, apellido, teléfono y correo opcional, enviar `POST /public/bookings` con esos datos y el turno elegido (una hora, en UTC) y redirigir el navegador al `initPoint` recibido. DEBE mostrar el `detail` o `message` de error del servidor.

Motivo: el jugador sin cuenta ya puede reservar como invitado (DP-04 enmendada y DP-09).
(Previously: reservar exigía sesión.)

#### Escenario: Reserva en efectivo
- Dado un jugador con sesión que elige un horario libre
- Cuando confirma "Abonar en Efectivo en el Club"
- Entonces se envía `POST /bookings` con `paymentMethod: "CASH"` y se refresca la disponibilidad

#### Escenario: Conflicto
- Dado que el turno fue tomado entretanto
- Cuando el jugador confirma
- Entonces el modal muestra "El turno seleccionado ya fue reservado."

#### Escenario: Invitado sin sesión
- Dado un visitante sin sesión que elige un horario libre y completa nombre, apellido y teléfono
- Cuando confirma
- Entonces se envía `POST /public/bookings` y el navegador se redirige al `initPoint` de la respuesta

#### Escenario: Datos de invitado inválidos
- Dado un invitado con un teléfono inválido
- Cuando confirma
- Entonces se muestran los errores del servidor y no se redirige

### RES-022: Operación de reservas en el panel de administración (frontend)

El panel `AdminDashboard` DEBE mostrar la grilla diaria desde `GET /bookings/admin/daily`, permitir marcar una reserva como `COMPLETED` o `CANCELLED` mediante `PATCH /bookings/admin/:id/status` y registrar un turno manual de una hora con `POST /bookings/admin/create`. DEBE funcionar con reservas sin usuario (de invitado), mostrándolas según ADM-016 y sin fallar por la ausencia de `user`.

Motivo: la agenda y los listados incluyen reservas de invitado.
(Previously: asumía que toda reserva tenía usuario.)

#### Escenario: Marcar como jugado
- Dada una reserva no completada en la grilla
- Cuando el administrador pulsa "Marcar como jugado"
- Entonces se envía `status: "COMPLETED"` y se recarga la grilla

#### Escenario: Turno manual rechazado
- Dado un turno manual que el backend rechaza
- Cuando se envía el formulario
- Entonces se muestra el `detail` del error

#### Escenario: Reserva de invitado en la grilla
- Dada una reserva de invitado `CONFIRMED` en la grilla del día
- Cuando se muestra la grilla
- Entonces la celda se renderiza con los datos del invitado y sin errores

## ELIMINADO

Ninguno.
