# Delta spec: administracion (cambio `reserva-invitado`)

Agrega la configuración del porcentaje de seña, la vista de las reservas de invitado en el panel del canchero (titular invitado, teléfono, estado de la seña, enlace `wa.me`), la lista de pagos a reembolsar de cada reserva, con su motivo y un botón de reembolso por pago. Modifica el listado completo (ADM-008), el período, el resumen y la recaudación de las métricas (ADM-004, ADM-005 y ADM-006; la recaudación de invitados suma la seña y no el precio del turno) para admitir reservas de invitado y para tratar las reservas vencidas (`PENDING` vencidas y `EXPIRED`) como excluidas de las métricas, sin mezclarlas con las canceladas. La spec base de `administracion` ya existe, por lo que esta delta usa `## AGREGADO` y `## MODIFICADO` (la propuesta la daba por inexistente). El registro de pagos y el reembolso por pago contra Mercado Pago se especifican en `pagos` (PAG-026 y PAG-024). Todos los requisitos son `[OBJETIVO]`. Al archivar el cambio, esta delta se fusiona en `openspec/specs/administracion/spec.md`.

## AGREGADO

### ADM-015: Configuración del porcentaje de seña [OBJETIVO]

El sistema DEBE permitir a un `ADMIN` consultar y modificar el `depositPercent` del complejo (porcentaje del precio del turno que se cobra como seña, valor por defecto 30) mediante una operación autenticada de solo `ADMIN` (401 sin token, 403 para `USER`). DEBE aceptar solo enteros de 1 a 100 y DEBE responder 400 con la lista `errors` ante cualquier otro valor (cero, negativo, mayor que 100, decimal, no numérico o ausente), sin modificar el complejo. Con 100 se cobra online el precio completo. El nuevo valor afecta solo a las reservas creadas después (PAG-022). DEBE responder 404 si el complejo no existe.

#### Escenario: Modificación válida
- Dado un `ADMIN` autenticado y un complejo con `depositPercent` 30
- Cuando lo cambia a 50
- Entonces responde 200 con `depositPercent` 50 y las nuevas reservas de invitado calculan la seña con 50

#### Escenario: Valor fuera de rango
- Dado un `ADMIN` autenticado
- Cuando envía `depositPercent` 0, 101 o -5
- Entonces responde 400 con `errors` que indica `depositPercent` y el valor no cambia

#### Escenario: Valor no entero
- Dado un `ADMIN` autenticado
- Cuando envía `depositPercent` 33.5 o "abc"
- Entonces responde 400 y el valor no cambia

#### Escenario: Límites inclusivos
- Dado un `ADMIN` autenticado
- Cuando envía `depositPercent` 1 y luego 100
- Entonces ambos se aceptan

#### Escenario: Sin permisos
- Dado un token con rol `USER`
- Cuando intenta modificar el porcentaje
- Entonces responde 403 y el valor no cambia

### ADM-016: Reservas de invitado en el panel [OBJETIVO]

El panel `AdminDashboard` DEBE mostrar, en la "Grilla del Día" y en "Todas las Reservas", las reservas de invitado con una marca de invitado, el nombre y el apellido del invitado (en lugar del usuario), su teléfono, el estado de la seña (`depositStatus`: pendiente, pagada o reembolsada) y el monto de la seña. DEBE ofrecer un botón de contacto que abra un enlace `https://wa.me/<guestPhone>?text=<mensaje>`, con el teléfono normalizado de solo dígitos y un mensaje armado y codificado en URL que incluya al menos el nombre del invitado, la cancha, y la fecha y la hora del turno en UTC. NO DEBE usar la API de WhatsApp Business (DP-13). Las reservas con cuenta se muestran como hasta ahora (ADM-012 y ADM-013). Una reserva `PENDING` vencida o `EXPIRED` NO DEBE aparecer en la grilla (RES-013). En "Todas las Reservas" una reserva `EXPIRED` DEBE mostrarse con el estado "Vencida" y sin el botón "Cancelar" (ADM-013).

#### Escenario: Reserva de invitado en la grilla
- Dada una reserva de invitado `CONFIRMED` con seña pagada a las 18:00 UTC
- Cuando se muestra la grilla de ese día
- Entonces la celda muestra la marca de invitado, su nombre, su teléfono y la seña como pagada

#### Escenario: Enlace de contacto
- Dado un invitado con `guestPhone` "5491155551234"
- Cuando el administrador pulsa el botón de contacto
- Entonces se abre un enlace que empieza con `https://wa.me/5491155551234?text=` y contiene el mensaje codificado

#### Escenario: Reserva con cuenta
- Dada una reserva con cuenta
- Cuando se muestra el panel
- Entonces se muestra como en ADM-012 y ADM-013, sin marca de invitado ni botón de contacto de invitado

#### Escenario: Reserva pendiente vigente
- Dada una reserva de invitado `PENDING` vigente
- Cuando se muestra el panel
- Entonces figura con la seña pendiente y el botón de contacto

#### Escenario: Reserva vencida en el historial
- Dada una reserva `EXPIRED` en "Todas las Reservas"
- Cuando se muestra el historial
- Entonces figura como "Vencida", sin botón "Cancelar" y no aparece en la grilla del día

### ADM-017: Reembolso pendiente y reembolso manual en el panel [OBJETIVO]

El panel DEBE mostrar, en "Todas las Reservas", para cada reserva con pagos pendientes de reembolso, la lista de esos pagos (los que tienen motivo de reembolso y no tienen `refundedAt`, PAG-026) con su monto y la etiqueta de su motivo: `AMOUNT_MISMATCH` "monto no coincide", `SLOT_TAKEN` "pago sin turno", `PAID_AFTER_CANCEL` "pagó después de cancelar", `DUPLICATE_PAYMENT` "pago duplicado" y `OWNER_DISCRETION` "a criterio del canchero" (DP-11). Los motivos distintos de `OWNER_DISCRETION` se presentan como "Reembolso obligatorio" (`refundDue` `REQUIRED`, PAG-023) y `OWNER_DISCRETION` como "Seña sin reembolsar" (`AT_DISCRETION`). DEBE ofrecer un botón "Reembolsar" por cada pago de la lista. Al pulsarlo DEBE pedir confirmación y, si se acepta, invocar el reembolso de ese pago (PAG-024) y quitarlo de la lista de pendientes cuando el servidor responde con éxito, sin afectar a los demás pagos de la reserva. Si falla, DEBE mostrar el aviso de error y mantener el pago en la lista. NO DEBE ofrecer el botón en pagos sin motivo de reembolso ni en pagos ya reembolsados.

Motivo: una reserva puede tener varios pagos a reembolsar con motivos distintos (monto incorrecto, duplicado, turno ocupado); el reembolso se decide pago por pago.
(Previously: no existía; el requisito se crea en este cambio con el reembolso por pago.)

#### Escenario: Reembolso confirmado
- Dada una reserva `CANCELLED` con un pago `OWNER_DISCRETION` sin reembolsar
- Cuando el administrador pulsa "Reembolsar" en ese pago y acepta
- Entonces se invoca el reembolso de ese pago y deja de figurar entre los pendientes

#### Escenario: Pago sin turno
- Dada una reserva `EXPIRED` con un pago `SLOT_TAKEN` sin reembolsar
- Cuando se muestra el historial
- Entonces figura el pago con la etiqueta "pago sin turno" como reembolso obligatorio y el botón "Reembolsar"

#### Escenario: Monto no coincide
- Dada una reserva `PENDING` o `CONFIRMED` con un pago `AMOUNT_MISMATCH` sin reembolsar
- Cuando se muestra el historial
- Entonces figura el pago con la etiqueta "monto no coincide", con el botón "Reembolsar" y sin cambiar el estado visible de la reserva

#### Escenario: Pagó después de cancelar
- Dada una reserva `CANCELLED` con un pago `PAID_AFTER_CANCEL` sin reembolsar
- Cuando se muestra el historial
- Entonces figura el pago con la etiqueta "pagó después de cancelar" y el botón "Reembolsar"

#### Escenario: Pago duplicado
- Dada una reserva con un pago `DUPLICATE_PAYMENT` sin reembolsar
- Cuando se muestra el historial
- Entonces figura el pago con la etiqueta "pago duplicado" y el botón "Reembolsar"

#### Escenario: A criterio del canchero
- Dada una reserva `CANCELLED` por el invitado que ya tenía la seña pagada al cancelarse
- Cuando se muestra el historial
- Entonces figura el pago con la etiqueta "a criterio del canchero" y el botón "Reembolsar"

#### Escenario: Varios pagos a reembolsar
- Dada una reserva con un pago `AMOUNT_MISMATCH` y otro `DUPLICATE_PAYMENT` sin reembolsar
- Cuando el administrador reembolsa solo el primero
- Entonces el segundo sigue en la lista con su botón

#### Escenario: Confirmación rechazada
- Dado un pago pendiente de reembolso
- Cuando el administrador rechaza la confirmación
- Entonces no se envía ningún pedido

#### Escenario: Falla del reembolso
- Dado que el servidor responde un error
- Cuando se acepta el reembolso
- Entonces se muestra el aviso de error y el pago sigue en la lista de pendientes

#### Escenario: Reserva sin pagos a reembolsar
- Dada una reserva sin pagos, o cuyos pagos no tienen motivo de reembolso o ya fueron reembolsados
- Cuando se muestra el panel
- Entonces no se ofrece ningún botón "Reembolsar"

### ADM-018: Ajuste del porcentaje de seña en el panel [OBJETIVO]

El panel DEBE mostrar el `depositPercent` vigente y permitir al administrador modificarlo mediante ADM-015, validando en pantalla que sea un entero de 1 a 100 antes de enviarlo. Ante un error del servidor DEBE mostrar el `detail` o `message` recibido y conservar el valor anterior.

#### Escenario: Cambio exitoso
- Dado un administrador con el panel abierto
- Cuando ingresa 40 y guarda
- Entonces se envía el nuevo valor y el panel muestra 40

#### Escenario: Valor inválido en pantalla
- Dado un administrador
- Cuando ingresa 0 o 150
- Entonces el panel no envía el pedido y muestra un aviso de rango válido

## MODIFICADO

### ADM-004: Período de las métricas

El sistema DEBE considerar las reservas cuyo `createdAt` (fecha de creación de la reserva) está entre `startDate` a las `00:00:00.000Z` y `endDate` a las `23:59:59.999Z`, ambos extremos incluidos, en UTC. NO DEBE filtrar por la fecha del turno (`startTime`), por la cancha ni por el estado, con una única excepción: NO DEBE considerar las reservas vencidas, es decir las `EXPIRED` y las `PENDING` con `expiresAt` menor o igual al instante actual. Las reservas vencidas se EXCLUYEN de las métricas: no se cuentan en `totalBookings`, no figuran en `details` y no suman a ningún contador (en particular, NO cuentan en `cancelledCount`), de modo que el resultado es el mismo antes y después de que el barrido las pase a `EXPIRED`.

Motivo: una reserva de invitado vencida liberó el turno sin que nadie la cancelara y no representa actividad real ni una cancelación. Se descarta contarla aparte para no ampliar el contrato de la respuesta.
(Previously: no se filtraba por estado y toda reserva del período se contaba.)

#### Escenario: Límite final inclusivo
- Dada una reserva creada el `2026-08-31T23:59:59.999Z`
- Cuando se consulta el período del `2026-08-01` al `2026-08-31`
- Entonces la reserva se cuenta en el período

#### Escenario: Turno futuro creado dentro del período
- Dada una reserva creada el `2026-08-10` para un turno del `2026-09-20`
- Cuando se consulta el período de agosto de 2026
- Entonces la reserva se cuenta, porque se filtra por su fecha de creación y no por la del turno

#### Escenario: Reserva pendiente vencida
- Dada una reserva de invitado `PENDING` con `expiresAt` en el pasado, creada dentro del período, que aún no fue pasada a `EXPIRED` por el barrido
- Cuando se consultan las métricas
- Entonces no se cuenta en `totalBookings` ni figura en `details`

#### Escenario: Reserva EXPIRED
- Dada una reserva `EXPIRED` creada dentro del período
- Cuando se consultan las métricas
- Entonces no se cuenta en `totalBookings`, no figura en `details` y `cancelledCount` no aumenta

#### Escenario: Mismo resultado antes y después del barrido
- Dada una reserva de invitado vencida
- Cuando se consultan las métricas antes y después de que el barrido la pase a `EXPIRED`
- Entonces ambos resultados son idénticos

#### Escenario: Reserva pendiente vigente
- Dada una reserva de invitado `PENDING` con `expiresAt` en el futuro, creada dentro del período
- Cuando se consultan las métricas
- Entonces se cuenta en `totalBookings` pero no en `confirmedCount`, `cancelledCount` ni en la recaudación

### ADM-005: Resumen de las métricas

El sistema DEBE responder `period` con `from` y `to` iguales a los parámetros recibidos, y `summary` con `totalBookings` (cantidad de reservas del período, de cualquier estado salvo las vencidas, ADM-004), `confirmedCount` (reservas `CONFIRMED`), `cancelledCount` (reservas `CANCELLED`) y `totalRevenueARS` (calculada según ADM-006). Las reservas `PENDING` y `COMPLETED` cuentan en `totalBookings` pero no en `confirmedCount` ni en `cancelledCount`. Las reservas `EXPIRED` y las `PENDING` vencidas no cuentan en ningún valor.

Motivo: `EXPIRED` no es una cancelación y se excluye de las métricas (ADM-004).
(Previously: `totalBookings` contaba las reservas del período de cualquier estado y `totalRevenueARS` sumaba el `totalPrice` de toda reserva `CONFIRMED`; ahora la recaudación se define en ADM-006.)

#### Escenario: Conteo por estado
- Dado un período con 2 reservas `CONFIRMED`, 1 `CANCELLED` y 1 `COMPLETED`
- Cuando se consultan las métricas
- Entonces `totalBookings` es 4, `confirmedCount` es 2 y `cancelledCount` es 1

#### Escenario: Reservas vencidas no cuentan
- Dado un período con 2 `CONFIRMED`, 1 `CANCELLED` y 3 `EXPIRED`
- Cuando se consultan las métricas
- Entonces `totalBookings` es 3, `confirmedCount` es 2 y `cancelledCount` es 1

#### Escenario: Período sin reservas
- Dado un período sin reservas creadas
- Cuando se consultan las métricas
- Entonces `summary` tiene los cuatro valores en 0 y `details` es una lista vacía

### ADM-006: Recaudación de las métricas

El sistema DEBE calcular `totalRevenueARS` como la suma, como número, de lo cobrado por las reservas `CONFIRMED` del período: el `amount` de su pago válido sin reembolso (lo cobrado online, PAG-026) para las reservas de invitado, y el `totalPrice` para las reservas con cuenta, que siguen contándose como hasta ahora hasta el cambio `politica-cobro`. Una reserva de invitado `CONFIRMED` sin pago válido (por ejemplo, confirmada a mano por el administrador) o cuyo pago fue reembolsado suma 0. Los pagos con motivo `AMOUNT_MISMATCH` o `DUPLICATE_PAYMENT` no suman. NO DEBE incluir en la suma las reservas `CANCELLED`, `EXPIRED`, `PENDING` ni `COMPLETED`.

Motivo: el invitado paga online solo la seña, y la recaudación debe reflejar lo efectivamente cobrado y no reembolsado, no el precio del turno ni la seña teórica. La recaudación sigue el criterio de ADM-004 y ADM-005 para las reservas vencidas.
(Previously: la recaudación sumaba el `totalPrice` de toda reserva `CONFIRMED`; en la revisión anterior, el `depositAmount` para invitados.)

#### Escenario: Solo confirmadas
- Dadas una reserva `CONFIRMED` con cuenta de 25000 y una `CANCELLED` de 30000 en el período
- Cuando se consultan las métricas
- Entonces `totalRevenueARS` es 25000

#### Escenario: Reserva completada
- Dada una reserva `COMPLETED` de 25000 y ninguna `CONFIRMED`
- Cuando se consultan las métricas
- Entonces `totalRevenueARS` es 0

#### Escenario: Reserva de invitado
- Dada una reserva de invitado `CONFIRMED` con `totalPrice` 25000 y un pago válido de 7500 sin reembolso
- Cuando se consultan las métricas
- Entonces `totalRevenueARS` es 7500

#### Escenario: Mezcla de cuenta e invitado
- Dadas una reserva `CONFIRMED` con cuenta de 25000 y una de invitado `CONFIRMED` con `totalPrice` 25000 y un pago válido de 7500 sin reembolso
- Cuando se consultan las métricas
- Entonces `totalRevenueARS` es 32500

#### Escenario: Seña del 100 por ciento
- Dada una reserva de invitado `CONFIRMED` con `depositPercent` 100 y su pago válido de 25000
- Cuando se consultan las métricas
- Entonces `totalRevenueARS` es 25000

#### Escenario: Reserva de invitado confirmada a mano sin pago
- Dada una reserva de invitado confirmada por el administrador sin ningún pago registrado
- Cuando se consultan las métricas
- Entonces suma 0 a `totalRevenueARS`

#### Escenario: Pagos que no suman
- Dada una reserva de invitado `CONFIRMED` con su pago válido de 7500 y otro pago `DUPLICATE_PAYMENT` de 7500
- Cuando se consultan las métricas
- Entonces `totalRevenueARS` es 7500

#### Escenario: Reservas pendientes y vencidas
- Dadas una reserva de invitado `PENDING` y una `EXPIRED` en el período
- Cuando se consultan las métricas
- Entonces no suman a `totalRevenueARS`

### ADM-008: Listado completo de reservas del administrador

El sistema DEBE devolver con `GET /api/v1/bookings/admin/all` (solo `ADMIN`) todas las reservas de cualquier estado (incluidas las `EXPIRED`, necesarias para gestionar su reembolso), de usuario o de invitado, ordenadas por `startTime` descendente (la más reciente primero), cada una con su cancha completa, su usuario limitado a `id`, `firstName`, `lastName` y `email` (o `null` si es una reserva de invitado) y, para las de invitado, `guestFirstName`, `guestLastName`, `guestPhone`, `guestEmail`, `depositAmount`, `depositStatus` y `refundDue` (PAG-023) y la lista de sus pagos registrados, cada uno con su `id`, `amount`, `isValid`, `refundReason` y `refundedAt` (PAG-026); las reservas con cuenta también incluyen `refundDue` y sus pagos. NO DEBE exponer la contraseña del usuario, el hash del token de acceso ni el token. Una reserva `PENDING` vencida que el barrido aún no pasó a `EXPIRED` DEBE listarse con estado `EXPIRED`. La ruta pertenece al módulo de reservas y el control de acceso se rige por `reservas` (RES-017).

Motivo: el listado debe admitir reservas sin usuario y mostrar los datos que necesita el panel (ADM-016 y ADM-017).
(Previously: devolvía siempre el usuario y no incluía datos de invitado, de la seña ni de los pagos con su motivo de reembolso.)

#### Escenario: Listado ordenado
- Dado un `ADMIN` autenticado
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 200 con una lista cuyos `startTime` están en orden descendente, cada reserva con `court.name` y, si tiene cuenta, `user.email`, y sin `user.password`

#### Escenario: Reserva de invitado en el listado
- Dado un `ADMIN` y una reserva de invitado confirmada
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces la reserva figura con `user` nulo, los datos del invitado y `depositStatus`, y sin `accessTokenHash`

#### Escenario: Reserva pendiente vencida
- Dado un `ADMIN` y una reserva de invitado `PENDING` con `expiresAt` en el pasado que sigue `PENDING` en la base
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces la reserva figura con estado `EXPIRED`

#### Escenario: Reserva EXPIRED con pago
- Dado un `ADMIN` y una reserva `EXPIRED` con un pago con motivo `SLOT_TAKEN` y sin `refundedAt`
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces la reserva figura con `refundDue` `REQUIRED` y ese pago en su lista de pagos con su `refundReason`

#### Escenario: Usuario sin rol de administrador
- Dado un token con rol `USER`
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 403 con "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: Sin token
- Dado un pedido sin token
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 401

## ELIMINADO

Ninguno.
