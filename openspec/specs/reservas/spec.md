# Spec: reservas

## Propósito

Describe el comportamiento actual (single-tenant) del dominio de reservas: creación por el jugador y por el administrador, consulta, cancelación, cambio de estado, disponibilidad diaria y garantía de no solapamiento de turnos. Las rutas `/api/v1/bookings/admin/*` se documentan aquí; el dominio `administracion` solo referencia el rol `ADMIN`.

## Requisitos

### RES-001: Creación de reserva por el jugador

El sistema DEBE permitir que un usuario autenticado cree una reserva con `POST /api/v1/bookings`, a su propio nombre (el `userId` sale del token, nunca del cuerpo), y DEBE responder 201 con la reserva creada y su cancha incluida.

#### Escenario: Reserva válida

- Dado un usuario autenticado y una cancha activa
- Cuando envía `courtId`, `startTime` y `endTime` válidos en el futuro
- Entonces responde 201 y la reserva queda asociada al `userId` del token

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

El sistema DEBE validar, en este orden, antes de crear una reserva: que `startTime` sea anterior a `endTime`; que la cancha exista; que la cancha esté activa (`isActive`); y que `startTime` sea posterior al instante actual. Cada incumplimiento DEBE responder 400 con un mensaje propio.

#### Escenario: Inicio no anterior al fin

- Dado `startTime` mayor o igual a `endTime`
- Cuando se solicita la reserva
- Entonces responde 400 con "La hora de inicio debe ser anterior a la hora de fin."

#### Escenario: Cancha inexistente

- Dado un `courtId` UUID que no existe
- Cuando se solicita la reserva
- Entonces responde 400 con "La cancha no existe."

#### Escenario: Cancha inactiva

- Dada una cancha con `isActive = false`
- Cuando se solicita la reserva
- Entonces responde 400 con "La cancha no está disponible."

#### Escenario: Turno pasado

- Dado un `startTime` menor o igual a la hora actual
- Cuando se solicita la reserva
- Entonces responde 400 con "No se puede reservar un turno pasado."

### RES-005: Validación compartida entre jugador y administrador

El sistema DEBE aplicar la misma función `validarTurnoReservable` tanto a `POST /bookings` como a `POST /bookings/admin/create`, de modo que ambas rutas rechacen los mismos casos de RES-004.

#### Escenario: Administrador con turno pasado

- Dado un usuario `ADMIN`
- Cuando crea una reserva con inicio en el pasado
- Entonces responde 400 con "No se puede reservar un turno pasado." y no crea la reserva

#### Escenario: Administrador con cancha inactiva

- Dado un usuario `ADMIN` y una cancha inactiva
- Cuando crea una reserva
- Entonces responde 400 con "La cancha no está disponible."

### RES-006: Estado inicial y precio de la reserva

El sistema DEBE crear toda reserva (de jugador o de administrador) con estado `CONFIRMED` y con `totalPrice` igual al `pricePerSlot` de la cancha en ese momento.

#### Escenario: Reserva de jugador

- Dado una cancha con `pricePerSlot` 1000
- Cuando un jugador reserva con `CASH`
- Entonces la reserva queda `CONFIRMED` con `totalPrice` 1000

#### Escenario: Reserva con TRANSFER

- Dado un jugador que reserva con `TRANSFER`
- Cuando se crea la reserva
- Entonces nace `CONFIRMED` igualmente, sin depender de un pago

### RES-007: No solapamiento de reservas activas

El sistema NO DEBE permitir dos reservas con estado distinto de `CANCELLED` que se solapen en una misma cancha. Ante un solapamiento DEBE responder 409 con el mensaje "El turno seleccionado ya fue reservado.". Los turnos contiguos y los de otras canchas DEBEN permitirse.

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

#### Escenario: Concurrencia

- Dados 20 pedidos simultáneos por el mismo turno (o 5 de jugador y 5 de admin, repetido 30 veces)
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

La base de datos DEBE rechazar reservas con `end_time` no posterior a `start_time` (`bookings_horario_valido`) y reservas activas solapadas por cancha (`bookings_sin_solapamiento`, `EXCLUDE USING gist` sobre `court_id` y `tstzrange(start_time, end_time)`, excluyendo `CANCELLED`).

#### Escenario: Horario invertido

- Dado un alta directa en base con fin anterior al inicio
- Cuando se inserta
- Entonces la base la rechaza

#### Escenario: Solapamiento detectado por la restricción

- Dado que la restricción `bookings_sin_solapamiento` reporta una violación
- Cuando el error llega a `conBloqueoDeCancha`
- Entonces se convierte en 409 "El turno seleccionado ya fue reservado."

### RES-010: Consulta de las reservas propias

El sistema DEBE devolver con `GET /bookings/my-bookings` (autenticado) solo las reservas del usuario del token, con su cancha incluida, ordenadas por `startTime` descendente, en cualquier estado.

#### Escenario: Usuario con reservas

- Dado un usuario con reservas en varios estados
- Cuando consulta `my-bookings`
- Entonces recibe 200 con todas sus reservas, la más reciente primero

#### Escenario: Usuario sin reservas

- Dado un usuario sin reservas
- Cuando consulta `my-bookings`
- Entonces recibe 200 con una lista vacía

### RES-011: Cancelación de la reserva propia

El sistema DEBE permitir a un usuario autenticado cancelar con `PATCH /bookings/:id/cancel` solo sus propias reservas en estado `PENDING` o `CONFIRMED`, pasándolas a `CANCELLED`. DEBE responder 404 si no existe, 403 si pertenece a otro usuario y 409 si ya está `CANCELLED` o `COMPLETED`.

#### Escenario: Cancelación propia

- Dada una reserva `CONFIRMED` del usuario
- Cuando la cancela
- Entonces responde 200 y el estado pasa a `CANCELLED`

#### Escenario: Reserva ajena

- Dada una reserva de otro usuario
- Cuando la intenta cancelar (incluso con rol `ADMIN` por esta ruta)
- Entonces responde 403 y no se modifica

#### Escenario: Estado terminal

- Dada una reserva `CANCELLED` o `COMPLETED`
- Cuando se intenta cancelar
- Entonces responde 409

#### Escenario: Inexistente

- Dado un UUID de reserva que no existe
- Cuando se intenta cancelar
- Entonces responde 404

### RES-012: Consulta pública de horarios ocupados

El sistema DEBE devolver con `GET /bookings/availability?courtId&date` (sin autenticación) la lista de horas de inicio ocupadas del día UTC indicado, con formato `HH:MM` en UTC, considerando las reservas de esa cancha con estado distinto de `CANCELLED` (incluye `PENDING`, `CONFIRMED` y `COMPLETED`) cuyo `startTime` cae en ese día.

#### Escenario: Día con reservas

- Dada una reserva 10:00 a 11:00 UTC no cancelada en la fecha
- Cuando se consulta la disponibilidad
- Entonces la respuesta incluye `"10:00"`

#### Escenario: Reserva completada

- Dada una reserva `COMPLETED` a las 10:00
- Cuando se consulta la disponibilidad
- Entonces `"10:00"` sigue figurando ocupado

#### Escenario: Parámetros inválidos

- Dado un `courtId` que no es UUID o una fecha inexistente
- Cuando se consulta
- Entonces responde 400

### RES-013: Agenda diaria del administrador

El sistema DEBE devolver con `GET /bookings/admin/daily?date` (solo `ADMIN`) las reservas no canceladas cuyo `startTime` cae en el día UTC indicado, ordenadas por `startTime` ascendente, con la cancha y el usuario (`id`, `firstName`, `lastName`, `email`) incluidos.

#### Escenario: Día con reservas

- Dado un `ADMIN` y reservas no canceladas en la fecha
- Cuando consulta la agenda
- Entonces recibe 200 con las reservas ordenadas por hora y sin las canceladas

#### Escenario: Día sin reservas

- Dado un `ADMIN` y una fecha sin reservas
- Cuando consulta la agenda
- Entonces recibe 200 con lista vacía

### RES-014: Transiciones de estado permitidas

El sistema DEBE permitir únicamente las transiciones `PENDING` a `CONFIRMED` o `CANCELLED`, y `CONFIRMED` a `COMPLETED` o `CANCELLED`. `CANCELLED` y `COMPLETED` son estados terminales. Cualquier otra transición (incluida la de un estado a sí mismo) NO DEBE aplicarse y DEBE responder 409 con "No se puede cambiar una reserva de <actual> a <nuevo>.".

#### Escenario: Transición permitida

- Dada una reserva `CONFIRMED`
- Cuando el administrador pide `COMPLETED`
- Entonces responde 200 y el estado cambia

#### Escenario: Reconfirmar una cancelada

- Dada una reserva `CANCELLED` cuyo turno ya fue tomado por otra
- Cuando el administrador pide `CONFIRMED`
- Entonces responde 409 y la reserva sigue `CANCELLED`

#### Escenario: Transiciones rechazadas

- Dadas las combinaciones CANCELLED a COMPLETED, COMPLETED a CANCELLED, CONFIRMED a PENDING, CONFIRMED a CONFIRMED y PENDING a COMPLETED
- Cuando el administrador las solicita
- Entonces cada una responde 409 y no actualiza

### RES-015: Cambio de estado por el administrador

El sistema DEBE permitir a un `ADMIN` cambiar el estado de cualquier reserva con `PATCH /bookings/admin/:id/status` y cuerpo `{ status }` (`PENDING`, `CONFIRMED`, `CANCELLED` o `COMPLETED`), aplicando RES-014 y ejecutando la actualización bajo el bloqueo de la cancha. DEBE responder 200 con la reserva, su cancha y su usuario; 404 si no existe; 400 si el `status` o el `id` son inválidos.

#### Escenario: Cancelación por el administrador

- Dada una reserva `CONFIRMED` de cualquier usuario
- Cuando el `ADMIN` pide `CANCELLED`
- Entonces responde 200 y el turno queda libre

#### Escenario: Estado desconocido

- Dado `status: "BORRADA"`
- Cuando se envía el pedido
- Entonces responde 400 y no se actualiza

#### Escenario: Reserva inexistente

- Dado un UUID sin reserva
- Cuando el `ADMIN` cambia su estado
- Entonces responde 404

### RES-016: Creación de reserva por el administrador

El sistema DEBE permitir a un `ADMIN` crear una reserva con `POST /bookings/admin/create` (mismo cuerpo que RES-001 con `paymentMethod` obligatorio), respondiendo 201 con la reserva, su cancha y su usuario; la reserva queda a nombre del propio administrador autenticado y `CONFIRMED`.

#### Escenario: Alta válida

- Dado un `ADMIN` y un turno libre
- Cuando crea la reserva con `paymentMethod` `CASH`
- Entonces responde 201 y el `userId` es el del administrador

#### Escenario: Turno ocupado

- Dado un turno ya reservado
- Cuando el `ADMIN` intenta crearlo
- Entonces responde 409

### RES-017: Control de acceso

El sistema DEBE exigir token válido para `POST /`, `GET /my-bookings`, `PATCH /:id/cancel` y todas las rutas `/admin/*` (401 sin token o con token inválido o vencido), y DEBE exigir rol `ADMIN` en `/admin/*` (403 para `USER`). `GET /availability` NO DEBE exigir autenticación.

#### Escenario: Usuario sin rol de administrador

- Dado un token con rol `USER`
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

La página `BookingsPage` DEBE mostrar, por cancha, una grilla fija de horarios de 08:00 a 22:00 en intervalos de una hora, deshabilitando los horarios devueltos por `GET /bookings/availability` para la fecha elegida, y DEBE enviar reservas de una hora (`startTime` y `endTime` en UTC) con `CASH` (pago en el club) o con `TRANSFER` seguido de `POST /payments/create-preference` (Mercado Pago). DEBE mostrar el `detail` o `message` de error del servidor.

#### Escenario: Reserva en efectivo

- Dado un jugador que elige un horario libre
- Cuando confirma "Abonar en Efectivo en el Club"
- Entonces se envía `POST /bookings` con `paymentMethod: "CASH"` y se refresca la disponibilidad

#### Escenario: Conflicto

- Dado que el turno fue tomado entretanto
- Cuando el jugador confirma
- Entonces el modal muestra "El turno seleccionado ya fue reservado."

### RES-021: Mis reservas (frontend)

La página `MyBookingsPage` DEBE listar las reservas de `GET /bookings/my-bookings`, mostrar la hora de inicio con `getUTCHours()`, y permitir cancelar con confirmación mediante `PATCH /bookings/:id/cancel` mientras la reserva no esté `CANCELLED`, actualizando el estado en pantalla.

#### Escenario: Cancelación

- Dada una reserva no cancelada y confirmación del usuario
- Cuando pulsa "Cancelar"
- Entonces se llama al endpoint y la reserva se muestra "Cancelada"

#### Escenario: Error al cancelar

- Dado que el servidor responde un error
- Cuando se intenta cancelar
- Entonces se muestra el `message` o `detail` recibido

### RES-022: Operación de reservas en el panel de administración (frontend)

El panel `AdminDashboard` DEBE mostrar la grilla diaria desde `GET /bookings/admin/daily`, permitir marcar una reserva como `COMPLETED` o `CANCELLED` mediante `PATCH /bookings/admin/:id/status` y registrar un turno manual de una hora con `POST /bookings/admin/create`.

#### Escenario: Marcar como jugado

- Dada una reserva no completada en la grilla
- Cuando el administrador pulsa "Marcar como jugado"
- Entonces se envía `status: "COMPLETED"` y se recarga la grilla

#### Escenario: Turno manual rechazado

- Dado un turno manual que el backend rechaza
- Cuando se envía el formulario
- Entonces se muestra el `detail` del error

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
