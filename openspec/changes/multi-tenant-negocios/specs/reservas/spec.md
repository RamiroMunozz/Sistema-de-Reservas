# Delta spec: reservas (cambio `multi-tenant-negocios`)

Cada reserva pertenece al negocio de su cancha; el dueño opera solo sobre las de su negocio; la reserva de invitado y la disponibilidad pública se resuelven por el slug del negocio; el tope por teléfono es por negocio; "Mis reservas" del jugador abarca todos los negocios. Al archivar el cambio, esta delta se fusiona en `openspec/specs/reservas/spec.md`.

Regla de nomenclatura: en los requisitos y escenarios de `reservas` no modificados abajo, `ADMIN` se lee `DUENO` y `USER` se lee `JUGADOR` (AUT-015). La regla general de aislamiento es NEG-010.

Nota de alcance: las operaciones públicas de reservas (disponibilidad y creación de invitado) se exponen bajo `/api/v1/negocios/:slug/...`; su trazado exacto lo define el diseño, y las referencias a rutas públicas de RES-028 a RES-030 se ajustan en consecuencia. En los escenarios, "con el slug del negocio X" designa esa operación pública dentro del negocio.

## AGREGADO

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

## MODIFICADO

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

## ELIMINADO

(Sin requisitos eliminados.)
