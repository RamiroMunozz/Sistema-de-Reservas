# Spec: reservas

## Propósito

Describe el comportamiento vigente (multi-tenant) del dominio de reservas: creación por el jugador y por el administrador, consulta, cancelación, cambio de estado, disponibilidad diaria y garantía de no solapamiento de turnos. Las rutas `/api/v1/bookings/admin/*` se documentan aquí; el dominio `administracion` solo referencia el rol `DUENO`.

## Requisitos

### RES-001: Creación de reserva por el jugador

El sistema DEBE permitir que un usuario autenticado cree una reserva con `POST /api/v1/bookings`, a su propio nombre (el `userId` sale del token, nunca del cuerpo), en cualquier cancha activa de un negocio activo (la cuenta de jugador es global, D8), y DEBE responder 201 con la reserva creada y su cancha incluida. La reserva queda en el negocio de la cancha (RES-036).

Motivo: el jugador reserva en cualquier negocio activo.
(Previously: no existía el concepto de negocio.)

#### Escenario: Reserva válida

- Dado un usuario autenticado y una cancha activa
- Cuando envía `courtId`, `startTime` y `endTime` válidos en el futuro
- Entonces responde 201 y la reserva queda asociada al `userId` del token

#### Escenario: Reserva en dos negocios

- Dado un jugador y canchas activas de los negocios A y B
- Cuando reserva una cancha de A y otra de B
- Entonces ambas respuestas son 201 y cada reserva queda en el negocio de su cancha

#### Escenario: Sin token

- Dado un pedido sin cabecera `Authorization: Bearer`
- Cuando llama a `POST /api/v1/bookings`
- Entonces responde 401 y no crea la reserva

### RES-002: Validación del formato de entrada

El sistema DEBE rechazar con 400 (y la lista `errors` con `field` y `message`) los cuerpos donde `courtId` no sea UUID, `startTime` o `endTime` no sean fechas ISO 8601 con formato `datetime` de Zod, o falten, y NO DEBE crear la reserva.

#### Escenario: Campo inválido

- Dado un usuario autenticado
- Cuando envía `courtId: "abc"`, `startTime: "mañana"` o sin `endTime`
- Entonces responde 400 con `errors` y no se invoca la creación

#### Escenario: Parámetros de ruta y consulta

- Dado un `:id` que no es UUID o una `date` con formato distinto de `YYYY-MM-DD` o inexistente (por ejemplo `2026-13-99`)
- Cuando se llama a `/:id/cancel`, `/admin/:id/status`, `/availability` o `/admin/daily`
- Entonces responde 400

### RES-003: Medio de pago de la reserva

El sistema DEBE aceptar `paymentMethod` solo con los valores `CASH` o `TRANSFER`. En `POST /bookings` DEBE usar `CASH` si se omite; en `POST /bookings/admin/create` DEBE exigirlo. NO DEBE aceptar `MERCADOPAGO` ni otros valores por estas rutas.

#### Escenario: Valor por defecto

- Dado un usuario autenticado que omite `paymentMethod`
- Cuando crea una reserva válida
- Entonces la reserva se persiste con `CASH`

#### Escenario: Valor desconocido o ausente en admin

- Dado un cuerpo con `paymentMethod: "BITCOIN"`, o un alta de admin sin `paymentMethod`
- Cuando se envía el pedido
- Entonces responde 400 y no crea la reserva

### RES-004: Validación de turno reservable

El sistema DEBE validar, en este orden, antes de crear una reserva: que `startTime` sea anterior a `endTime`; que la cancha exista y pertenezca a un negocio activo y, cuando la operación tiene un negocio de contexto (el del dueño en la creación por el administrador, el del slug en la reserva de invitado), a ese negocio; que la cancha esté activa (`isActive`); y que `startTime` sea posterior al instante actual. Una cancha de otro negocio o de un negocio inactivo DEBE tratarse como inexistente. Cada incumplimiento DEBE responder 400 con un mensaje propio.

Motivo: la cancha enviada por el cliente debe verificarse contra el negocio de la operación (NEG-010).
(Previously: solo se verificaba que la cancha existiera.)

#### Escenario: Inicio no anterior al fin

- Dado `startTime` mayor o igual a `endTime`
- Cuando se solicita la reserva
- Entonces responde 400 con "La hora de inicio debe ser anterior a la hora de fin."

#### Escenario: Cancha inexistente

- Dado un `courtId` UUID que no existe
- Cuando se solicita la reserva
- Entonces responde 400 con "La cancha no existe."

#### Escenario: Cancha de otro negocio

- Dada una cancha del negocio B
- Cuando el dueño del negocio A, o un invitado con el slug del negocio A, solicita una reserva sobre ella
- Entonces responde 400 con "La cancha no existe.", igual que para una cancha inexistente, y no crea la reserva

#### Escenario: Cancha de un negocio inactivo

- Dada una cancha activa de un negocio con `activo` en falso
- Cuando un jugador autenticado solicita una reserva sobre ella
- Entonces responde 400 con "La cancha no existe." y no crea la reserva

#### Escenario: Cancha inactiva

- Dada una cancha con `isActive = false`
- Cuando se solicita la reserva
- Entonces responde 400 con "La cancha no está disponible."

#### Escenario: Turno pasado

- Dado un `startTime` menor o igual a la hora actual
- Cuando se solicita la reserva
- Entonces responde 400 con "No se puede reservar un turno pasado."

### RES-005: Validación compartida entre jugador, dueño e invitado

El sistema DEBE aplicar la misma función `validarTurnoReservable` a `POST /bookings`, a `POST /bookings/admin/create` y a la creación de la reserva de invitado, de modo que las tres rutas rechacen los mismos casos de RES-004. Esa función es el único punto que fija el negocio de la reserva a partir de la cancha (RES-036).

Motivo: punto único de pertenencia al negocio.
(Previously: compartida solo entre jugador y administrador, sin negocio.)

#### Escenario: Dueño con turno pasado

- Dado un usuario `DUENO`
- Cuando crea una reserva con inicio en el pasado
- Entonces responde 400 con "No se puede reservar un turno pasado." y no crea la reserva

#### Escenario: Dueño con cancha inactiva

- Dado un usuario `DUENO` y una cancha inactiva de su negocio
- Cuando crea una reserva
- Entonces responde 400 con "La cancha no está disponible."

#### Escenario: Mismas reglas en las tres vías

- Dada una cancha inexistente
- Cuando un jugador, un dueño y un invitado piden una reserva sobre ella
- Entonces las tres respuestas son 400 con "La cancha no existe."

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
- Dado un `DUENO` que crea una reserva
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

### RES-008: Serialización de escrituras por cancha

El sistema DEBE ejecutar la creación de reservas y el cambio de estado dentro de una transacción que toma un bloqueo asesor por cancha (`pg_advisory_xact_lock(hashtext(courtId))`) con `lock_timeout` de 5 s, espera máxima de transacción de 5 s y duración máxima de 10 s. La restricción de base de datos DEBE seguir siendo la garantía final.

#### Escenario: Operaciones sobre la misma cancha

- Dadas dos escrituras simultáneas sobre la misma cancha
- Cuando se ejecutan
- Entonces se serializan por el bloqueo de esa cancha

#### Escenario: Bloqueo retenido por otra transacción

- Dada otra transacción que retiene el bloqueo de la cancha
- Cuando se intenta reservar
- Entonces la espera se corta antes de 8 s y la respuesta es 500

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

### RES-010: Consulta de las reservas propias

El sistema DEBE devolver con `GET /bookings/my-bookings` (autenticado) solo las reservas del usuario del token, de todos los negocios, con su cancha incluida y el negocio al que pertenece cada una (`nombre` y `slug`), ordenadas por `startTime` descendente, en cualquier estado. NO DEBE incluir reservas de otras cuentas, aunque sean del mismo negocio.

Motivo: la cuenta de jugador es global y debe indicar el negocio de cada reserva (D8).
(Previously: devolvía las reservas del usuario con su cancha, sin negocio.)

#### Escenario: Usuario con reservas

- Dado un usuario con reservas en varios estados
- Cuando consulta `my-bookings`
- Entonces recibe 200 con todas sus reservas, la más reciente primero

#### Escenario: Reservas en varios negocios

- Dado un jugador con una reserva en el negocio A y otra en el negocio B
- Cuando consulta `my-bookings`
- Entonces recibe ambas, cada una con el `nombre` y el `slug` de su negocio

#### Escenario: Reservas de otro jugador

- Dados dos jugadores con reservas en el mismo negocio
- Cuando el primero consulta `my-bookings`
- Entonces no ve las reservas del segundo

#### Escenario: Usuario sin reservas

- Dado un usuario sin reservas
- Cuando consulta `my-bookings`
- Entonces recibe 200 con una lista vacía

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
- Cuando la intenta cancelar (incluso con rol `DUENO` por esta ruta)
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

El sistema DEBE devolver con la consulta pública de disponibilidad por cancha y fecha (sin autenticación), resuelta por el slug del negocio, la lista de horas de inicio ocupadas del día UTC indicado, con formato `HH:MM` en UTC, considerando las reservas de esa cancha con estado distinto de `CANCELLED` y `EXPIRED` (incluye `PENDING`, `CONFIRMED` y `COMPLETED`) cuyo `startTime` cae en ese día. NO DEBE considerar las reservas `PENDING` vencidas (`expiresAt` menor o igual al instante actual), aunque el barrido aún no las haya pasado a `EXPIRED`. DEBE responder 404 con "Cancha no encontrada" si la cancha no existe o no pertenece al negocio del slug (misma respuesta en ambos casos, NEG-010), y 404 "Negocio no encontrado" si el slug es inexistente o el negocio está inactivo (NEG-005).

Motivo: la consulta pública se resuelve dentro del negocio del slug.
(Previously: `GET /bookings/availability?courtId&date` sin negocio; no consideraba que la cancha pudiera ser de otro negocio.)

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

#### Escenario: Cancha de otro negocio
- Dada una cancha del negocio B
- Cuando se consulta su disponibilidad con el slug del negocio A
- Entonces responde 404 con "Cancha no encontrada" y no revela las horas ocupadas de B

#### Escenario: Negocio inactivo
- Dado un negocio con `activo` en falso
- Cuando se consulta la disponibilidad con su slug
- Entonces responde 404 con "Negocio no encontrado"

### RES-013: Agenda diaria del dueño

El sistema DEBE devolver con `GET /bookings/admin/daily?date` (solo `DUENO`) las reservas del negocio del dueño no canceladas y no vencidas (estado distinto de `CANCELLED` y `EXPIRED`) cuyo `startTime` cae en el día UTC indicado, ordenadas por `startTime` ascendente, con la cancha incluida y, según el titular, el usuario (`id`, `firstName`, `lastName`, `email`) o `null` si es una reserva de invitado. Cada reserva DEBE incluir `depositAmount`, `depositStatus` y `refundDue` (PAG-023), sus pagos registrados con motivo y reembolso (PAG-026) y los datos del invitado (`guestFirstName`, `guestLastName`, `guestPhone`, `guestEmail`). NO DEBE incluir las reservas `PENDING` vencidas, las `EXPIRED` ni las de otros negocios.

Motivo: aislamiento por negocio.
(Previously: devolvía las reservas de todo el sistema.)

#### Escenario: Día con reservas
- Dado un `DUENO` y reservas no canceladas de su negocio en la fecha
- Cuando consulta la agenda
- Entonces recibe 200 con las reservas ordenadas por hora y sin las canceladas

#### Escenario: Día sin reservas
- Dado un `DUENO` y una fecha sin reservas
- Cuando consulta la agenda
- Entonces recibe 200 con lista vacía

#### Escenario: Reserva de invitado
- Dado un `DUENO` y una reserva de invitado `PENDING` vigente de su negocio en la fecha
- Cuando consulta la agenda
- Entonces la reserva figura con `user` nulo, `guestFirstName`, `guestLastName`, `guestPhone` y `depositStatus`

#### Escenario: Reserva pendiente vencida
- Dado un `DUENO` y una reserva de invitado `PENDING` con `expiresAt` en el pasado
- Cuando consulta la agenda
- Entonces esa reserva no figura

#### Escenario: Reserva EXPIRED
- Dado un `DUENO` y una reserva `EXPIRED` en la fecha
- Cuando consulta la agenda
- Entonces esa reserva no figura

#### Escenario: Reservas de otro negocio
- Dados los negocios A y B con reservas en la misma fecha
- Cuando el dueño de A consulta la agenda de esa fecha
- Entonces solo figuran reservas de A

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

### RES-015: Cambio de estado por el dueño

El sistema DEBE permitir a un `DUENO` cambiar el estado de cualquier reserva de su negocio con `PATCH /bookings/admin/:id/status` y cuerpo `{ status }` (`PENDING`, `CONFIRMED`, `CANCELLED` o `COMPLETED`; `EXPIRED` NO es un valor aceptado, RES-035), aplicando RES-014 y ejecutando la actualización bajo el bloqueo de la cancha. DEBE responder 200 con la reserva, su cancha y su usuario (`null` si es una reserva de invitado); 404 si no existe o si pertenece a otro negocio (misma respuesta en ambos casos, NEG-010), sin modificarla ni llamar a Mercado Pago; 400 si el `status` o el `id` son inválidos. Cuando el nuevo estado es `CANCELLED`, DEBE registrar si la seña ya estaba pagada (PAG-023) e invalidar el link de pago vigente en Mercado Pago como mejor esfuerzo: si Mercado Pago falla, la cancelación se confirma igual (200) y el error se registra (PAG-025). Una reserva cancelada NO DEBE reactivarse nunca.

Motivo: el cambio de estado por id debe verificar la pertenencia al negocio (S5).
(Previously: cambiaba el estado de cualquier reserva por id y exigía `ADMIN`.)

#### Escenario: Cancelación por el dueño
- Dada una reserva `CONFIRMED` de cualquier usuario del negocio del dueño
- Cuando el `DUENO` pide `CANCELLED`
- Entonces responde 200 y el turno queda libre

#### Escenario: Cancelación con preferencia guardada
- Dada una reserva `PENDING` o `CONFIRMED` del negocio con una preferencia de pago guardada
- Cuando el `DUENO` pide `CANCELLED`
- Entonces responde 200 y se pide a Mercado Pago que la preferencia expire en ese momento

#### Escenario: Falla de Mercado Pago al invalidar el link
- Dada una reserva con preferencia guardada y Mercado Pago que falla
- Cuando el `DUENO` pide `CANCELLED`
- Entonces responde 200, la reserva queda `CANCELLED` y el error se registra

#### Escenario: Cancelación sin preferencia
- Dada una reserva sin preferencia guardada
- Cuando el `DUENO` pide `CANCELLED`
- Entonces responde 200 y no se llama a Mercado Pago

#### Escenario: Reserva de invitado
- Dada una reserva de invitado del negocio
- Cuando el `DUENO` cambia su estado
- Entonces responde 200 con `user` nulo

#### Escenario: Estado desconocido
- Dado `status: "BORRADA"` o `status: "EXPIRED"`
- Cuando se envía el pedido
- Entonces responde 400 y no se actualiza

#### Escenario: Reserva inexistente
- Dado un UUID sin reserva
- Cuando el `DUENO` cambia su estado
- Entonces responde 404

#### Escenario: Reserva de otro negocio
- Dados los negocios A y B y una reserva `CONFIRMED` de B
- Cuando el dueño de A le pide `CANCELLED` o `COMPLETED`
- Entonces responde 404, igual que para una reserva inexistente, la reserva de B no cambia y no se llama a Mercado Pago

### RES-016: Creación de reserva por el dueño

El sistema DEBE permitir a un `DUENO` crear una reserva con `POST /bookings/admin/create` (mismo cuerpo que RES-001 con `paymentMethod` obligatorio) sobre una cancha de su negocio, respondiendo 201 con la reserva, su cancha y su usuario; la reserva queda a nombre del propio dueño autenticado, `CONFIRMED` y con el negocio de la cancha (RES-036). Una cancha de otro negocio DEBE rechazarse según RES-004.

Motivo: el `courtId` enviado por el cliente debe pertenecer al negocio del dueño (S5).
(Previously: aceptaba cualquier cancha activa y exigía `ADMIN`.)

#### Escenario: Alta válida

- Dado un `DUENO` y un turno libre en una cancha de su negocio
- Cuando crea la reserva con `paymentMethod` `CASH`
- Entonces responde 201 y el `userId` es el del dueño

#### Escenario: Turno ocupado

- Dado un turno ya reservado
- Cuando el `DUENO` intenta crearlo
- Entonces responde 409

#### Escenario: Cancha de otro negocio

- Dados los negocios A y B y una cancha activa de B con el turno libre
- Cuando el dueño de A intenta crear una reserva sobre esa cancha
- Entonces responde 400 con "La cancha no existe." (RES-004), igual que para una cancha inexistente, y no se crea ninguna reserva

### RES-017: Control de acceso

El sistema DEBE exigir token válido para `POST /`, `GET /my-bookings`, `PATCH /:id/cancel` y todas las rutas `/admin/*` (401 sin token o con token inválido o vencido), y DEBE exigir rol `DUENO` en `/admin/*` (403 para `JUGADOR` y para `SUPER_ADMIN`). La disponibilidad pública NO DEBE exigir autenticación.

Motivo: roles nuevos (AUT-015).
(Previously: `/admin/*` exigía `ADMIN` y respondía 403 para `USER`.)

#### Escenario: Usuario sin rol de dueño

- Dado un token con rol `JUGADOR` o `SUPER_ADMIN`
- Cuando llama a `GET /admin/daily`, `PATCH /admin/:id/status` o `POST /admin/create`
- Entonces responde 403 con "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: Sin token en rutas admin

- Dado un pedido sin token
- Cuando llama a cualquier ruta `/admin/*`
- Entonces responde 401

### RES-018: Manejo de errores

El sistema DEBE responder los errores de negocio (`AppError`) con el formato `type/title/status/detail/instance`, y los errores no controlados con 500 genérico, sin exponer mensajes internos de Prisma ni rutas de archivos.

#### Escenario: Error interno

- Dado que la persistencia lanza un error inesperado
- Cuando se crea una reserva
- Entonces responde 500 y el cuerpo no contiene "prisma" ni rutas internas

#### Escenario: Error de validación

- Dado un cuerpo que no cumple el esquema
- Cuando se envía
- Entonces responde 400 con `detail` "Los datos enviados no cumplen con el formato requerido."

### RES-019: Fechas en UTC

El sistema DEBE recibir y persistir `startTime` y `endTime` como instantes UTC, y DEBE calcular los días de disponibilidad y agenda con límites `00:00:00.000Z` a `23:59:59.999Z` y las horas ocupadas con `getUTCHours()` y `getUTCMinutes()`.

#### Escenario: Día UTC

- Dada una reserva a las `2030-01-15T23:30:00.000Z`
- Cuando se consulta el día `2030-01-15`
- Entonces la reserva pertenece a ese día, sin conversión a hora local

#### Escenario: Formato de hora

- Dada una reserva a las 09:00 UTC
- Cuando se consulta la disponibilidad
- Entonces la hora se informa como `"09:00"`

### RES-020: Grilla de reserva del jugador (frontend)

La página `BookingsPage` DEBE mostrar, por cancha, una grilla fija de horarios de 08:00 a 22:00 en intervalos de una hora, deshabilitando los horarios devueltos por `GET /bookings/availability` para la fecha elegida. Con sesión DEBE enviar reservas de una hora (`startTime` y `endTime` en UTC) con `CASH` (pago en el club) o con `TRANSFER` seguido de `POST /payments/create-preference` (Mercado Pago). Sin sesión DEBE mostrar un formulario de invitado con nombre, apellido, teléfono y correo opcional; el teléfono DEBE pedirse con el prefijo fijo `+54 9` a la vista y 10 dígitos (código de área sin 0 y número sin 15), y DEBE enviarse en formato internacional (`549` seguido de esos dígitos) para que el enlace `wa.me` de ADM-016 funcione; enviar `POST /public/bookings` con esos datos y el turno elegido (una hora, en UTC) y llevar al invitado a `/reserva/<token>` con el `initPoint` recibido, sin redirigir directo a Mercado Pago, para que vea y guarde su enlace antes de pagar. DEBE mostrar el `detail` o `message` de error del servidor.

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
- Entonces se envía `POST /public/bookings` y el navegador va a `/reserva/<token>` de la respuesta, con su `initPoint`

#### Escenario: Datos de invitado inválidos
- Dado un invitado con un teléfono inválido
- Cuando confirma
- Entonces se muestran los errores del servidor y no se redirige

### RES-021: Mis reservas (frontend)

La página `MyBookingsPage` DEBE listar las reservas de `GET /bookings/my-bookings` de todos los negocios, mostrar para cada una el nombre del negocio, mostrar la hora de inicio con `getUTCHours()`, y permitir cancelar con confirmación mediante `PATCH /bookings/:id/cancel` mientras la reserva no esté `CANCELLED`, actualizando el estado en pantalla.

Motivo: la cuenta de jugador es global y cada reserva indica su negocio (D8).
(Previously: listaba las reservas sin indicar el negocio.)

#### Escenario: Cancelación

- Dada una reserva no cancelada y confirmación del usuario
- Cuando pulsa "Cancelar"
- Entonces se llama al endpoint y la reserva se muestra "Cancelada"

#### Escenario: Error al cancelar

- Dado que el servidor responde un error
- Cuando se intenta cancelar
- Entonces se muestra el `message` o `detail` recibido

#### Escenario: Negocio visible

- Dado un jugador con reservas en los negocios A y B
- Cuando abre `/mis-reservas`
- Entonces cada reserva muestra el nombre de su negocio

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

### RES-023: Creación de reserva de invitado

El sistema DEBE permitir, sin autenticación y dentro del negocio indicado por su slug (NEG-005), crear una reserva de invitado con cuerpo `courtId`, `startTime`, `endTime`, `guestFirstName`, `guestLastName`, `guestPhone` y `guestEmail` (opcional). La cancha DEBE pertenecer al negocio del slug (RES-004). DEBE aplicar `validarTurnoReservable` (RES-004 y RES-005) y el no solapamiento (RES-007), crear la reserva sin usuario (`userId` nulo) con estado `PENDING`, el negocio de la cancha (RES-036), `totalPrice` igual al `pricePerSlot` de la cancha, `depositAmount` calculado según PAG-022 y `expiresAt` igual al instante de creación más 15 minutos, y DEBE responder 201 con `{ token, initPoint }`. El `courtId` y las fechas siguen las reglas de RES-002 y RES-019 (UTC). El `initPoint` es el de la preferencia de seña (PAG-020).

Motivo: la creación de invitado se resuelve dentro del negocio del slug y verifica la cancha contra él (D2, S5).
(Previously: `POST /api/v1/public/bookings` aceptaba cualquier cancha del sistema.)

#### Escenario: Reserva de invitado válida
- Dada una cancha activa del negocio del slug con `pricePerSlot` 1000, `depositPercent` 30 y un turno libre en el futuro
- Cuando un visitante sin sesión envía el cuerpo completo y válido
- Entonces responde 201 con `token` e `initPoint`, y la reserva queda `PENDING`, con `userId` nulo, `totalPrice` 1000, `depositAmount` 300, `expiresAt` 15 minutos después de la creación y el negocio del slug

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
- Cuando llama a la creación pública con un slug válido y datos válidos
- Entonces no responde 401 y procesa el pedido

#### Escenario: Cancha de otro negocio
- Dados los negocios A y B y una cancha activa de B
- Cuando un invitado envía el pedido con el slug de A y el `courtId` de esa cancha
- Entonces responde 400 con "La cancha no existe." y no crea la reserva

#### Escenario: Slug inexistente o negocio inactivo
- Dado un slug inexistente o el de un negocio inactivo
- Cuando un invitado envía un pedido válido
- Entonces responde 404 "Negocio no encontrado" y no crea la reserva

### RES-024: Datos del invitado

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

### RES-025: Token de acceso privado

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

### RES-026: Vencimiento de las reservas PENDING

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

### RES-027: Barrido periódico de reservas vencidas

El servidor DEBE ejecutar, cada 60 segundos, el paso a `EXPIRED` de todas las reservas `PENDING` vencidas de cualquier cancha (RES-026), para que los turnos se liberen aunque nadie intente reservarlos. Un error en una pasada NO DEBE detener el servidor ni las pasadas siguientes.

#### Escenario: Liberación sin actividad
- Dada una reserva de invitado `PENDING` que venció y ningún pedido sobre su cancha
- Cuando transcurre el siguiente barrido
- Entonces la reserva queda `EXPIRED`

#### Escenario: Falla de una pasada
- Dado un error de base de datos durante un barrido
- Cuando se ejecuta
- Entonces se registra el error y el siguiente barrido se ejecuta normalmente

### RES-028: Consulta de la reserva de invitado por token

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

### RES-029: Cancelación de la reserva de invitado por token

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

### RES-030: Límite de solicitudes por IP en la creación pública

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

### RES-031: Tope de reservas PENDING por teléfono

El sistema DEBE limitar la cantidad de reservas `PENDING` vigentes (no vencidas) asociadas a un mismo `guestPhone` normalizado dentro de un mismo negocio, y DEBE responder 429 con un mensaje propio, sin crear la reserva, cuando el teléfono ya alcanzó el tope en ese negocio. Las reservas de otros negocios NO DEBEN contar: el mismo teléfono tiene un tope independiente en cada negocio. El tope DEBE ser configurable (valor por defecto: 2). Las reservas `PENDING` vencidas, `EXPIRED`, `CONFIRMED`, `CANCELLED` y `COMPLETED` NO DEBEN contar. La comprobación DEBE ejecutarse dentro del bloqueo de cancha o de una forma que no permita superar el tope con pedidos concurrentes, también entre canchas distintas del mismo negocio.

Motivo: el tope global permitía que un teléfono consumiera el cupo en todos los negocios (S5, D5).
(Previously: el tope era global por teléfono, sin considerar el negocio.)

#### Escenario: Tope alcanzado
- Dado un teléfono con 2 reservas `PENDING` vigentes en el negocio A
- Cuando crea una tercera en el negocio A
- Entonces responde 429 y no se crea la reserva

#### Escenario: Una reserva vencida no cuenta
- Dado un teléfono con 1 reserva `PENDING` vigente y 1 vencida en el negocio A
- Cuando crea otra reserva en A
- Entonces responde 201

#### Escenario: Una reserva confirmada no cuenta
- Dado un teléfono con 2 reservas `CONFIRMED` y ninguna `PENDING`
- Cuando crea otra reserva
- Entonces responde 201

#### Escenario: Mismo teléfono con distinto formato
- Dado un teléfono con 2 reservas `PENDING` vigentes cargado como "+54 9 11 5555-1234"
- Cuando se envía el mismo número como "5491155551234"
- Entonces responde 429

#### Escenario: Tope independiente por negocio
- Dado un teléfono con 2 reservas `PENDING` vigentes en el negocio A
- Cuando crea una reserva en el negocio B
- Entonces responde 201 y las reservas de A no consumen el tope de B

#### Escenario: Tope alcanzado en cada negocio
- Dado un teléfono con 2 reservas `PENDING` vigentes en A y 2 en B
- Cuando crea otra en A y otra en B
- Entonces ambas responden 429

### RES-032: Compensación ante falla de Mercado Pago en la creación

El sistema DEBE, si falla la creación de la preferencia de seña después de crear la reserva de invitado (por configuración ausente o por error de Mercado Pago), pasar esa reserva a `CANCELLED` para liberar el turno, y DEBE responder con un error de servidor (5xx) sin devolver `token` ni detalle interno.

#### Escenario: Falla de Mercado Pago
- Dado que Mercado Pago rechaza la creación de la preferencia
- Cuando un invitado crea una reserva válida
- Entonces responde 5xx, la reserva queda `CANCELLED` y el turno puede reservarse de nuevo

#### Escenario: Mercado Pago sin configurar
- Dado `MERCADOPAGO_ACCESS_TOKEN` vacío
- Cuando un invitado crea una reserva válida
- Entonces responde 503 con el mensaje de PAG-007 y la reserva no deja el turno ocupado

### RES-033: Titular obligatorio de la reserva

La base de datos DEBE rechazar toda reserva que no tenga titular, es decir, sin `userId` y sin `guestPhone`. Una reserva con `userId` NO DEBE requerir datos de invitado, y una reserva de invitado NO DEBE tener `userId`.

#### Escenario: Alta sin titular
- Dado un alta directa en base sin `userId` ni `guestPhone`
- Cuando se inserta
- Entonces la base la rechaza

#### Escenario: Reserva con cuenta
- Dada una reserva creada con sesión
- Cuando se persiste
- Entonces tiene `userId` y no tiene datos de invitado

### RES-034: Página de la reserva de invitado (frontend)

El frontend DEBE exponer, sin exigir sesión, la ruta `/reserva/:codigo`, que consulta `GET /public/bookings/:codigo` y muestra el estado de la reserva, la cancha, la fecha y la hora del turno en UTC (`getUTCHours()`, `getUTCMinutes()`), la seña y su estado. Mientras la reserva está `PENDING` vigente DEBE mostrar una cuenta regresiva hasta `expiresAt` y un botón de pago: si la página recibió el `initPoint` de la creación (RES-020), el botón lleva a ese link; si no (por ejemplo, al recargar), usa el reintento (PAG-021). Al llegar desde la creación DEBE destacar que el enlace es la única forma de volver a la reserva; al llegar a cero DEBE mostrar la reserva como vencida y retirar el botón de pago. Una reserva `EXPIRED` DEBE mostrarse como "Vencida", sin botón de pago ni de cancelación. Una reserva `CANCELLED` DEBE mostrarse como "Cancelada", sin botón de pago ni de cancelación, y DEBE ofrecer "Reservar de nuevo", un enlace a la página de reservas, con una indicación de que para pagar hay que hacer una reserva nueva. DEBE ofrecer un botón de cancelación con confirmación mientras la reserva esté `PENDING` o `CONFIRMED`. Cuando `refundAtOwnerDiscretion` es `true`, la confirmación de la cancelación DEBE mostrar, antes de enviar el pedido, una advertencia explícita de que la devolución de la seña queda a criterio del canchero o dueño y no es automática; tras cancelar DEBE volver a mostrar ese aviso si la respuesta trae `refundAtOwnerDiscretion` `true`. Con un código inexistente DEBE mostrar un mensaje de reserva no encontrada. DEBE mostrar el `detail` o `message` de error del servidor.

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

### RES-035: Estado EXPIRED

El sistema DEBE incorporar el estado de reserva `EXPIRED` (vencida), que se usa únicamente para una reserva `PENDING` cuyo `expiresAt` venció sin que se aprobara el pago (RES-026). `EXPIRED` NO DEBE ocupar el turno: se excluye del solapamiento (RES-007 y RES-009), de la disponibilidad (RES-012 y CAN-006) y de la agenda (RES-013), igual que `CANCELLED`. `EXPIRED` NO DEBE usarse para una cancelación del invitado, del jugador o del canchero (esas producen `CANCELLED`). Ningún pedido de cambio de estado del administrador (RES-015) NI de usuario DEBE poder fijar `EXPIRED`: se rechaza con 400. `EXPIRED` es terminal, con la única excepción de la reactivación por pago aprobado tardío con el turno libre (PAG-012). Glosario: `EXPIRED` = reserva `PENDING` que liberó su turno por no pagarse a tiempo.

#### Escenario: Estado producido solo por vencimiento
- Dada una reserva de invitado `PENDING` que el invitado cancela antes de vencer
- Cuando se cancela
- Entonces queda `CANCELLED` y no `EXPIRED`

#### Escenario: El administrador no puede fijar EXPIRED
- Dado un `DUENO` y una reserva `PENDING`
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

### RES-036: Negocio de la reserva

El sistema DEBE asignar a cada reserva, al crearla, el negocio de la cancha reservada (el del complejo de la cancha), sea cual sea la vía de creación (jugador, dueño o invitado), y NO DEBE modificarlo después. Toda reserva DEBE tener negocio. Esta asignación se hace en la validación compartida del turno (RES-005), nunca a partir de un valor enviado por el cliente.

#### Escenario: Negocio tomado de la cancha
- Dada una cancha del negocio A
- Cuando se crea una reserva sobre ella por cualquier vía
- Entonces la reserva queda con el negocio A

#### Escenario: Negocio enviado por el cliente
- Dado un cuerpo que incluye un negocio distinto del de la cancha
- Cuando se crea la reserva
- Entonces el valor enviado se ignora y la reserva queda con el negocio de la cancha

#### Escenario: Reserva sin negocio
- Dado un alta directa en la base de una reserva sin negocio
- Cuando se inserta
- Entonces la base la rechaza

## Fuera de alcance

- Creación de preferencia de pago y webhook de Mercado Pago (dominio `pagos`), salvo mención en Observaciones.
- Disponibilidad por cancha `GET /courts/:id/availability` y administración de canchas y métricas (dominios `canchas` y `administracion`).
- Autenticación y emisión de tokens (dominio `autenticacion`).
- Reserva de invitado, seña, política de cobro y aislamiento por negocio (objetivo, no implementado).

## Observaciones

1. Las reservas nacen `CONFIRMED` antes de cualquier pago, aun con `TRANSFER` (punto A3 de la auditoría). El estado `PENDING` no lo produce este módulo; el valor por defecto del esquema también es `CONFIRMED`.
2. `cancelBooking` actualiza sin `conBloqueoDeCancha`, a diferencia de crear y cambiar estado; en cambio, la verificación de estado queda fuera de toda transacción.
3. En `updateBookingStatus` la transición se valida con una lectura previa fuera del bloqueo; dos cambios concurrentes sobre la misma reserva podrían evaluarse contra un estado desactualizado. No hay prueba que lo cubra.
4. El módulo de pagos modifica el estado de reservas (a `CANCELLED` ante pago rechazado y a `CONFIRMED` al aprobarse) sin pasar por `TRANSICIONES_PERMITIDAS` ni por el bloqueo de cancha (`payment.service.ts:190`, `:219`).
5. Disponibilidad duplicada: `GET /bookings/availability` (lista de `HH:MM`, sin horarios de cancha, no valida que la cancha exista ni esté activa) y `GET /courts/:id/availability` (slots con `CourtSchedule`, 404 si la cancha está inactiva, 422 por fecha inválida). El frontend de jugador usa la primera.
6. `getOccupiedSlots` informa solo la hora de inicio: una reserva de más de una hora, o no alineada a la hora, no marca ocupados los demás horarios que cubre; una reserva iniciada el día anterior que cruza la medianoche no aparece.
7. La creación no consulta `CourtSchedule`: acepta cualquier intervalo futuro con inicio anterior al fin (cualquier duración, fuera del horario de atención y sin alineación a la grilla). No confirmado como intencional.
8. Cancha inexistente o inactiva responde 400 (no 404) al reservar.
9. La reserva del administrador queda a nombre del propio administrador; no hay forma de indicar el cliente, y la agenda mostrará al admin como titular.
10. Si el bloqueo de cancha agota `lock_timeout` la respuesta es 500 (confirmado por prueba), no un 409 ni 503. La detección del solapamiento depende de buscar el nombre de la restricción en el mensaje del error (`reservaSolapada.ts:7`), técnica frágil (Prisma 5 no entrega código).
11. `GET /bookings` no existe en el backend, pero la pestaña "Todas las Reservas" de `AdminDashboard` lo llama (`AdminDashboard.tsx:204`); no se pudo confirmar qué muestra en ese caso más allá de que la ruta no está declarada.
12. `MyBookingsPage` rotula "Confirmada" cualquier estado distinto de `CANCELLED` (incluidos `PENDING` y `COMPLETED`), muestra siempre `HH:00` (descarta minutos) y ofrece "Cancelar" en reservas `COMPLETED`, que el backend rechaza con 409. Formatea la fecha sin `timeZone: "UTC"`, lo que puede mostrar un día distinto del UTC (regla de UTC estricto).
13. `AdminDashboard` muestra el botón "Marcar como jugado" también en reservas `PENDING`, transición que el backend rechaza (409), y rotula como "MP" el medio `TRANSFER`. `BookingsPage` usa `TRANSFER` para pagar con Mercado Pago; `MERCADOPAGO` existe en el enum pero este módulo no lo acepta.
14. Respuestas 401 de `authenticate` y de los controladores usan `{ message }`, mientras que el resto de errores usa el formato `detail`; el frontend contempla ambos.
15. La grilla de `BookingsPage` es fija (08:00 a 22:00) e ignora el horario de cada cancha; permite elegir horarios ya pasados del día actual (el backend los rechaza con 400).
16. No se ejecutaron las pruebas para esta spec. `concurrenciaReservas.test.ts` solo corre con `DATABASE_URL_PRUEBA` y `integration.test.ts` requiere PostgreSQL con datos de seed; `validacionReservas.test.ts` y `rutasAdminReservas.test.ts` simulan Prisma (la segunda usa el Prisma real para cancha inexistente y listas vacías).

## Evidencia

- RES-001: `backend/src/modules/bookings/booking.routes.ts:19`; `booking.controller.ts:18-33`; `booking.service.ts:65-88` (userId en 74); `backend/tests/validacionReservas.test.ts:149-157`; `backend/tests/integration.test.ts:92-106`.
- RES-002: `booking.dto.ts:3-6,8-9,11-23,27-32,38-40,46-53`; `backend/src/core/middlewares/errorHandler.ts:12-25`; `validacionReservas.test.ts:88-102,280-288,343-349,411-433`.
- RES-003: `booking.dto.ts:25,31,34-36`; `booking.service.ts:80,249`; `validacionReservas.test.ts:159-169,205-215`; `backend/prisma/schema.prisma:41-45`.
- RES-004: `booking.service.ts:18-22,35-62`; `validacionReservas.test.ts:104-147`; `rutasAdminReservas.test.ts:128-140`.
- RES-005: `booking.service.ts:66,234`; `validacionReservas.test.ts:187-256`; `rutasAdminReservas.test.ts:104-117`.
- RES-006: `booking.service.ts:79,81,247-248`; `backend/prisma/schema.prisma:121`; `integration.test.ts:92-106`; `validacionReservas.test.ts:84`.
- RES-007: `booking.service.ts:72-87`; `backend/src/core/errors/reservaSolapada.ts:3-12`; `bloqueoCancha.ts:22-24`; `concurrenciaReservas.test.ts:98-124,135-177`; `integration.test.ts:108-121`.
- RES-008: `backend/src/modules/bookings/bloqueoCancha.ts:5,12-25`; `booking.service.ts:72,206,240`; `concurrenciaReservas.test.ts:215-231`.
- RES-009: `backend/prisma/migrations/20261104120000_reservas_sin_solapamiento/migration.sql:1-15`; `backend/prisma/schema.prisma:112-113`; `concurrenciaReservas.test.ts:233-245`.
- RES-010: `booking.routes.ts:20`; `booking.controller.ts:35-48`; `booking.service.ts:90-100`; `rutasAdminReservas.test.ts:119-126`.
- RES-011: `booking.routes.ts:21`; `booking.controller.ts:50-65`; `booking.service.ts:102-131`; `validacionReservas.test.ts:342-408`; `concurrenciaReservas.test.ts:168-177`.
- RES-012: `booking.routes.ts:11`; `booking.controller.ts:67-76`; `booking.service.ts:133-157`; `concurrenciaReservas.test.ts:201-213`; `validacionReservas.test.ts:435-442`.
- RES-013: `booking.routes.ts:14`; `booking.controller.ts:78-87`; `booking.service.ts:159-188`; `rutasAdminReservas.test.ts:95-102`.
- RES-014: `booking.service.ts:24-29,200-204`; `validacionReservas.test.ts:302-339`; `concurrenciaReservas.test.ts:179-199`.
- RES-015: `booking.routes.ts:15`; `booking.controller.ts:89-99`; `booking.service.ts:190-223`; `booking.dto.ts:42-44`; `validacionReservas.test.ts:269-300`; `concurrenciaReservas.test.ts:126-133`.
- RES-016: `booking.routes.ts:16`; `booking.controller.ts:101-116`; `booking.service.ts:225-264` (userId en 244); `validacionReservas.test.ts:258-266`; `concurrenciaReservas.test.ts:58-62,113-124`.
- RES-017: `booking.routes.ts:8,11,14-21`; `backend/src/core/middlewares/auth.ts:11-15,19-26`; `backend/src/core/middlewares/role.middleware.ts:6-16`; `booking.controller.ts:14-15`; `rutasAdminReservas.test.ts:26-93`.
- RES-018: `backend/src/core/middlewares/errorHandler.ts:12-47`; `backend/src/core/errors/AppError.ts:1-35`; `validacionReservas.test.ts:171-184`.
- RES-019: `booking.service.ts:134-135,151-156,160-161`; `AGENTS.md` (regla UTC); `concurrenciaReservas.test.ts:21-24,208-212`.
- RES-020: `frontend/src/pages/BookingsPage.tsx:65-67,95-111,118-121,142-153,159-167,185-197`.
- RES-021: `frontend/src/pages/MyBookingsPage.tsx:33,56-85,124-125,146,174`.
- RES-022: `frontend/src/pages/AdminDashboard.tsx:175,233,251-262,268-276,363-368,627-652`.
- Observaciones: 1 `booking.service.ts:81`, `schema.prisma:121`; 2 `booking.service.ts:102-131`; 3 `booking.service.ts:191-206`; 4 `backend/src/modules/payments/payment.service.ts:21-22,190-191,219-221`; 5 `booking.service.ts:133-157`, `backend/src/modules/courts/court.routes.ts:9`, `court.service.ts:59-149`; 6 `booking.service.ts:134-156`; 7 `booking.service.ts:35-62`; 8 `booking.service.ts:49-55`; 9 `booking.service.ts:244`; 10 `concurrenciaReservas.test.ts:229-230`, `reservaSolapada.ts:5-7`; 11 `booking.routes.ts:11-21`, `AdminDashboard.tsx:204`; 12 `MyBookingsPage.tsx:119,125,146,174`; 13 `AdminDashboard.tsx:612-614,627`, `BookingsPage.tsx:189`; 14 `auth.ts:12-14`, `booking.controller.ts:14-15`, `errorHandler.ts:29-35`; 15 `BookingsPage.tsx:95-111`; 16 `concurrenciaReservas.test.ts:17,26`, `validacionReservas.test.ts:15-32`.
