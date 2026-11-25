# Delta spec: administracion (cambio `multi-tenant-negocios`)

El dueño (`DUENO`, antes `ADMIN`) opera solo sobre su negocio: las métricas, el listado y el porcentaje de seña quedan limitados a él. Al archivar el cambio, esta delta se fusiona en `openspec/specs/administracion/spec.md`.

Regla de nomenclatura: en los requisitos y escenarios de `administracion` no modificados abajo, `ADMIN` se lee `DUENO` y `USER` se lee `JUGADOR` (AUT-015). La regla general de aislamiento es NEG-010.

## AGREGADO

### ADM-019: Panel limitado al negocio del dueño

El panel `AdminDashboard` DEBE mostrar únicamente datos del negocio del dueño autenticado: las canchas de la pestaña "Canchas" y de la grilla, las reservas de la grilla y del historial y las tarjetas de métricas. NO DEBE ofrecer un selector de negocio ni mostrar datos de otros negocios. El alta de una cancha desde el panel DEBE usar un complejo del propio negocio.

#### Escenario: Dos negocios
- Dados los negocios A y B, cada uno con canchas y reservas
- Cuando el dueño de A abre el panel
- Entonces ve solo las canchas, reservas y métricas de A

#### Escenario: Alta de cancha desde el panel
- Dado el dueño de A en la pestaña "Canchas"
- Cuando da de alta una cancha
- Entonces la cancha queda en un complejo de A

## MODIFICADO

### ADM-001: Protección del router de administración

El sistema DEBE exigir token válido y rol `DUENO` en todas las rutas bajo `/api/v1/admin` (`POST /courts`, `PATCH /courts/:id` y `GET /metrics`), respondiendo 401 sin token válido y 403 con "No tienes los permisos necesarios para realizar esta acción" a un usuario con otro rol (`JUGADOR` o `SUPER_ADMIN`). Todas las operaciones de estas rutas DEBEN actuar sobre el negocio del dueño (NEG-010). La verificación del token y del rol se rige por `autenticacion` (AUT-008 y AUT-009); las rutas de canchas, por `canchas` (CAN-009 a CAN-011).

Motivo: roles nuevos y aislamiento por negocio.
(Previously: exigía el rol `ADMIN` y las rutas actuaban sobre todo el sistema.)

#### Escenario: Usuario sin rol de dueño
- Dado un token con rol `JUGADOR`
- Cuando llama a `GET /api/v1/admin/metrics`
- Entonces responde 403 con `detail` "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: SUPER_ADMIN
- Dado un token con rol `SUPER_ADMIN`
- Cuando llama a `GET /api/v1/admin/metrics`
- Entonces responde 403 con el mismo `detail`

#### Escenario: Dueño
- Dado un token con rol `DUENO`
- Cuando llama a `GET /api/v1/admin/metrics` con fechas válidas
- Entonces responde 200 con un cuerpo que incluye `summary`

#### Escenario: Sin token
- Dado un pedido sin encabezado `Authorization`
- Cuando llama a cualquier ruta bajo `/api/v1/admin`
- Entonces responde 401 antes de evaluar el rol

### ADM-002: Consulta de métricas

El sistema DEBE devolver con `GET /api/v1/admin/metrics` (solo `DUENO`) un resumen y un detalle de las reservas del período indicado por los parámetros de consulta `startDate` y `endDate`, ambos obligatorios, respondiendo 200. El resumen (`summary`), el detalle (`details`) y la recaudación DEBEN calcularse únicamente con las reservas del negocio del dueño; las reservas de otros negocios NO DEBEN contarse, figurar ni sumar.

Motivo: aislamiento por negocio (S5).
(Previously: las métricas abarcaban todas las reservas del sistema.)

#### Escenario: Consulta con período válido
- Dado un `DUENO` autenticado
- Cuando envía `startDate=2026-08-01&endDate=2026-08-31`
- Entonces responde 200 con `period`, `summary` y `details`

#### Escenario: Falta un parámetro
- Dado un `DUENO` autenticado
- Cuando envía solo `startDate`
- Entonces responde 400 con `errors` que indica el campo `endDate`

#### Escenario: Solo reservas del negocio propio
- Dados los negocios A y B, con 2 reservas `CONFIRMED` en A y 3 en B creadas en el período
- Cuando el dueño de A consulta las métricas del período
- Entonces `totalBookings` y `confirmedCount` son 2, `details` solo contiene reservas de A y `totalRevenueARS` suma solo lo cobrado en A

#### Escenario: Negocio sin reservas
- Dado un dueño cuyo negocio no tiene reservas en el período, mientras otro negocio sí las tiene
- Cuando consulta las métricas
- Entonces `summary` tiene los cuatro valores en 0 y `details` es una lista vacía

### ADM-008: Listado completo de reservas del dueño

El sistema DEBE devolver con `GET /api/v1/bookings/admin/all` (solo `DUENO`) todas las reservas del negocio del dueño, de cualquier estado (incluidas las `EXPIRED`, necesarias para gestionar su reembolso), de usuario o de invitado, ordenadas por `startTime` descendente (la más reciente primero), cada una con su cancha completa, su usuario limitado a `id`, `firstName`, `lastName` y `email` (o `null` si es una reserva de invitado) y, para las de invitado, `guestFirstName`, `guestLastName`, `guestPhone`, `guestEmail`, `depositAmount`, `depositStatus` y `refundDue` (PAG-023) y la lista de sus pagos registrados, cada uno con su `id`, `amount`, `isValid`, `refundReason` y `refundedAt` (PAG-026); las reservas con cuenta también incluyen `refundDue` y sus pagos. NO DEBE incluir reservas de otros negocios. NO DEBE exponer la contraseña del usuario, el hash del token de acceso ni el token. Una reserva `PENDING` vencida que el barrido aún no pasó a `EXPIRED` DEBE listarse con estado `EXPIRED`. La ruta pertenece al módulo de reservas y el control de acceso se rige por `reservas` (RES-017).

Motivo: aislamiento por negocio (S5, ADM-008 sin filtro).
(Previously: devolvía todas las reservas del sistema.)

#### Escenario: Listado ordenado
- Dado un `DUENO` autenticado
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 200 con una lista cuyos `startTime` están en orden descendente, cada reserva con `court.name` y, si tiene cuenta, `user.email`, y sin `user.password`

#### Escenario: Reserva de invitado en el listado
- Dado un `DUENO` y una reserva de invitado confirmada de su negocio
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces la reserva figura con `user` nulo, los datos del invitado y `depositStatus`, y sin `accessTokenHash`

#### Escenario: Reserva pendiente vencida
- Dado un `DUENO` y una reserva de invitado `PENDING` con `expiresAt` en el pasado que sigue `PENDING` en la base
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces la reserva figura con estado `EXPIRED`

#### Escenario: Reserva EXPIRED con pago
- Dado un `DUENO` y una reserva `EXPIRED` con un pago con motivo `SLOT_TAKEN` y sin `refundedAt`
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces la reserva figura con `refundDue` `REQUIRED` y ese pago en su lista de pagos con su `refundReason`

#### Escenario: Reservas de otro negocio
- Dados los negocios A y B con reservas cada uno
- Cuando el dueño de A llama a `GET /api/v1/bookings/admin/all`
- Entonces la lista contiene solo reservas de A y ninguna de B

#### Escenario: Usuario sin rol de dueño
- Dado un token con rol `JUGADOR` o `SUPER_ADMIN`
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 403 con "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: Sin token
- Dado un pedido sin token
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 401

### ADM-009: Acceso al panel en el frontend

El frontend DEBE exponer el panel en la ruta `/admin` envuelta en `ProtectedRoute` con `requiredRole="DUENO"`: mientras carga la sesión muestra un indicador de carga, sin sesión redirige a `/login` conservando la ubicación de origen, y con una sesión cuyo rol no es `DUENO` (comparado sin distinguir mayúsculas) redirige a `/`. La `Navbar` DEBE mostrar el enlace "Panel Canchero" a `/admin` solo si el rol del usuario es `DUENO`. Esta protección es de interfaz; la protección efectiva es la de ADM-001.

Motivo: el rol requerido pasa de `ADMIN` a `DUENO` (AUT-015).
(Previously: el rol requerido era `ADMIN`.)

#### Escenario: Usuario sin rol de dueño
- Dado un usuario autenticado con rol `JUGADOR` o `SUPER_ADMIN`
- Cuando navega a `/admin`
- Entonces se lo redirige a `/` y no ve el enlace "Panel Canchero"

#### Escenario: Sin sesión
- Dado un visitante sin sesión
- Cuando navega a `/admin`
- Entonces se lo redirige a `/login`

#### Escenario: Dueño
- Dado un usuario con rol `DUENO`
- Cuando navega a `/admin`
- Entonces ve el panel y el enlace "Panel Canchero" en la `Navbar`

### ADM-015: Configuración del porcentaje de seña

El sistema DEBE permitir a un `DUENO` consultar y modificar el `depositPercent` de un complejo de su negocio (porcentaje del precio del turno que se cobra como seña, valor por defecto 30) mediante una operación autenticada de solo `DUENO` (401 sin token, 403 para `JUGADOR` y `SUPER_ADMIN`). DEBE aceptar solo enteros de 1 a 100 y DEBE responder 400 con la lista `errors` ante cualquier otro valor (cero, negativo, mayor que 100, decimal, no numérico o ausente), sin modificar el complejo. Con 100 se cobra online el precio completo. El nuevo valor afecta solo a las reservas creadas después (PAG-022). DEBE responder 404 si el complejo no existe o pertenece a otro negocio, con la misma respuesta en ambos casos (NEG-010), sin consultar ni modificar el complejo ajeno.

Motivo: la operación por id de complejo no verificaba a quién pertenece (S5).
(Previously: operaba sobre cualquier complejo por id y exigía `ADMIN`.)

#### Escenario: Modificación válida
- Dado un `DUENO` autenticado y un complejo de su negocio con `depositPercent` 30
- Cuando lo cambia a 50
- Entonces responde 200 con `depositPercent` 50 y las nuevas reservas de invitado calculan la seña con 50

#### Escenario: Valor fuera de rango
- Dado un `DUENO` autenticado
- Cuando envía `depositPercent` 0, 101 o -5
- Entonces responde 400 con `errors` que indica `depositPercent` y el valor no cambia

#### Escenario: Valor no entero
- Dado un `DUENO` autenticado
- Cuando envía `depositPercent` 33.5 o "abc"
- Entonces responde 400 y el valor no cambia

#### Escenario: Límites inclusivos
- Dado un `DUENO` autenticado
- Cuando envía `depositPercent` 1 y luego 100
- Entonces ambos se aceptan

#### Escenario: Sin permisos
- Dado un token con rol `JUGADOR`
- Cuando intenta modificar el porcentaje
- Entonces responde 403 y el valor no cambia

#### Escenario: Complejo de otro negocio al modificar
- Dados los negocios A y B y un complejo de B con `depositPercent` 30
- Cuando el dueño de A intenta modificar el porcentaje de ese complejo
- Entonces responde 404, igual que para un complejo inexistente, y el valor de B no cambia

#### Escenario: Complejo de otro negocio al consultar
- Dado un complejo de B
- Cuando el dueño de A consulta su porcentaje
- Entonces responde 404, igual que para un complejo inexistente, y no se revela el valor

#### Escenario: Complejo inexistente
- Dado un id de complejo que no existe
- Cuando un `DUENO` consulta o modifica su porcentaje
- Entonces responde 404

## ELIMINADO

(Sin requisitos eliminados.)
