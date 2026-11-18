# Spec: administracion

## Propósito

Describe el comportamiento vigente del área de administración: la protección de las rutas `/api/v1/admin`, las métricas de reservas (`GET /admin/metrics`), el listado completo de reservas para el administrador (`GET /bookings/admin/all`) y el panel `AdminDashboard` del frontend. El alta y la modificación de canchas, la operación de reservas y la autenticación se documentan en `canchas`, `reservas` y `autenticacion`, y aquí solo se referencian. Estado actual: single-tenant.

## Requisitos

### ADM-001: Protección del router de administración

El sistema DEBE exigir token válido y rol `ADMIN` en todas las rutas bajo `/api/v1/admin` (`POST /courts`, `PATCH /courts/:id` y `GET /metrics`), respondiendo 401 sin token válido y 403 con "No tienes los permisos necesarios para realizar esta acción" a un usuario con otro rol. La verificación del token y del rol se rige por `autenticacion` (AUT-008 y AUT-009); las rutas de canchas, por `canchas` (CAN-009 a CAN-011).

#### Escenario: Usuario sin rol de administrador
- Dado un token con rol `USER`
- Cuando llama a `GET /api/v1/admin/metrics`
- Entonces responde 403 con `detail` "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: Administrador
- Dado un token con rol `ADMIN`
- Cuando llama a `GET /api/v1/admin/metrics` con fechas válidas
- Entonces responde 200 con un cuerpo que incluye `summary`

#### Escenario: Sin token
- Dado un pedido sin encabezado `Authorization`
- Cuando llama a cualquier ruta bajo `/api/v1/admin`
- Entonces responde 401 antes de evaluar el rol

### ADM-002: Consulta de métricas

El sistema DEBE devolver con `GET /api/v1/admin/metrics` (solo `ADMIN`) un resumen y un detalle de las reservas del período indicado por los parámetros de consulta `startDate` y `endDate`, ambos obligatorios, respondiendo 200.

#### Escenario: Consulta con período válido
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-08-01&endDate=2026-08-31`
- Entonces responde 200 con `period`, `summary` y `details`

#### Escenario: Falta un parámetro
- Dado un `ADMIN` autenticado
- Cuando envía solo `startDate`
- Entonces responde 400 con `errors` que indica el campo `endDate`

### ADM-003: Validación de las fechas de métricas

El sistema DEBE aceptar `startDate` y `endDate` solo con el formato `YYYY-MM-DD` (cuatro dígitos, guion, dos dígitos, guion, dos dígitos) y con una fecha de calendario que exista (incluido el 29 de febrero solo en años bisiestos). DEBE responder 400 con el `detail` "Los datos enviados no cumplen con el formato requerido." y la lista `errors` con el campo inválido (`startDate` o `endDate`) si el valor no cumple el formato o corresponde a una fecha que no existe. Para el formato incorrecto el mensaje del campo es "Formato YYYY-MM-DD". NO DEBE desbordar una fecha inexistente al mes siguiente ni dejar que llegue a la consulta de la base de datos (no debe haber respuesta 500). La validación NO verifica que `startDate` sea anterior o igual a `endDate`.

Motivo: una fecha con formato válido pero inexistente (`2026-02-31`) se desbordaba en silencio al mes siguiente y las métricas usaban otro rango sin avisar, y una con mes o día fuera de rango (`2026-13-01`) producía `Invalid Date` (observación 9).

#### Escenario: Formato inválido
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=01/08/2026&endDate=2026-08-31`
- Entonces responde 400 con `errors` que contiene `field` `startDate` y `message` "Formato YYYY-MM-DD"

#### Escenario: Día inexistente del mes
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-02-31&endDate=2026-03-31`
- Entonces responde 400 con `errors` que contiene el campo `startDate`, y no se consulta la base de datos

#### Escenario: Mes inexistente
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-08-01&endDate=2026-13-01`
- Entonces responde 400 con `errors` que contiene el campo `endDate`, y no se consulta la base de datos

#### Escenario: Día mayor que 31
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-02-32&endDate=2026-03-31`
- Entonces responde 400 con `errors` que contiene el campo `startDate`

#### Escenario: 29 de febrero en año no bisiesto
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-02-29&endDate=2026-03-31`
- Entonces responde 400 con `errors` que contiene el campo `startDate`

#### Escenario: 29 de febrero en año bisiesto
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2028-02-29&endDate=2028-03-31`
- Entonces la validación lo acepta y responde 200 con `period.from` "2028-02-29"

#### Escenario: Período válido con fechas límite del mes
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-08-01&endDate=2026-08-31`
- Entonces responde 200 con `period`, `summary` y `details` (ADM-002)

#### Escenario: Rango invertido
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-08-31&endDate=2026-08-01`
- Entonces la validación lo acepta y el período, que no puede contener reservas, produce un resumen con todos los contadores en cero

### ADM-004: Período de las métricas

El sistema DEBE considerar las reservas cuyo `createdAt` (fecha de creación de la reserva) está entre `startDate` a las `00:00:00.000Z` y `endDate` a las `23:59:59.999Z`, ambos extremos incluidos, en UTC. NO DEBE filtrar por la fecha del turno (`startTime`), por la cancha ni por el estado.

#### Escenario: Límite final inclusivo
- Dada una reserva creada el `2026-08-31T23:59:59.999Z`
- Cuando se consulta el período del `2026-08-01` al `2026-08-31`
- Entonces la reserva se cuenta en el período

#### Escenario: Turno futuro creado dentro del período
- Dada una reserva creada el `2026-08-10` para un turno del `2026-09-20`
- Cuando se consulta el período de agosto de 2026
- Entonces la reserva se cuenta, porque se filtra por su fecha de creación y no por la del turno

### ADM-005: Resumen de las métricas

El sistema DEBE responder `period` con `from` y `to` iguales a los parámetros recibidos, y `summary` con `totalBookings` (cantidad de reservas del período, de cualquier estado), `confirmedCount` (reservas `CONFIRMED`), `cancelledCount` (reservas `CANCELLED`) y `totalRevenueARS`. Las reservas `PENDING` y `COMPLETED` cuentan en `totalBookings` pero no en `confirmedCount` ni en `cancelledCount`.

#### Escenario: Conteo por estado
- Dado un período con 2 reservas `CONFIRMED`, 1 `CANCELLED` y 1 `COMPLETED`
- Cuando se consultan las métricas
- Entonces `totalBookings` es 4, `confirmedCount` es 2 y `cancelledCount` es 1

#### Escenario: Período sin reservas
- Dado un período sin reservas creadas
- Cuando se consultan las métricas
- Entonces `summary` tiene los cuatro valores en 0 y `details` es una lista vacía

### ADM-006: Recaudación de las métricas

El sistema DEBE calcular `totalRevenueARS` como la suma de `totalPrice` de las reservas `CONFIRMED` del período, como número. NO DEBE incluir en la suma las reservas `CANCELLED`, `PENDING` ni `COMPLETED`.

#### Escenario: Solo confirmadas
- Dadas una reserva `CONFIRMED` de 25000 y una `CANCELLED` de 30000 en el período
- Cuando se consultan las métricas
- Entonces `totalRevenueARS` es 25000

#### Escenario: Reserva completada
- Dada una reserva `COMPLETED` de 25000 y ninguna `CONFIRMED`
- Cuando se consultan las métricas
- Entonces `totalRevenueARS` es 0

### ADM-007: Detalle de las métricas

El sistema DEBE devolver en `details` una entrada por cada reserva del período, con `id`, `court` (nombre de la cancha), `sport`, `status`, `price` (número) y `startTime`. NO DEBE incluir datos del usuario, `paymentMethod` ni un orden garantizado.

#### Escenario: Contenido de una entrada
- Dada una reserva del período
- Cuando se consultan las métricas
- Entonces su entrada en `details` contiene `id`, `court`, `sport`, `status`, `price` y `startTime`, y no contiene `user` ni `userId`

#### Escenario: Incluye todos los estados
- Dado un período con reservas `CANCELLED` y `CONFIRMED`
- Cuando se consultan las métricas
- Entonces `details` incluye ambas

### ADM-008: Listado completo de reservas del administrador

El sistema DEBE devolver con `GET /api/v1/bookings/admin/all` (solo `ADMIN`) todas las reservas de cualquier estado y usuario, ordenadas por `startTime` descendente (la más reciente primero), cada una con su cancha completa y su usuario limitado a `id`, `firstName`, `lastName` y `email`. NO DEBE exponer la contraseña del usuario. La ruta pertenece al módulo de reservas y el control de acceso se rige por `reservas` (RES-017).

#### Escenario: Listado ordenado
- Dado un `ADMIN` autenticado
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 200 con una lista cuyos `startTime` están en orden descendente, cada reserva con `court.name` y `user.email`, y sin `user.password`

#### Escenario: Usuario sin rol de administrador
- Dado un token con rol `USER`
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 403 con "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: Sin token
- Dado un pedido sin token
- Cuando llama a `GET /api/v1/bookings/admin/all`
- Entonces responde 401

### ADM-009: Acceso al panel en el frontend

El frontend DEBE exponer el panel en la ruta `/admin` envuelta en `ProtectedRoute` con `requiredRole="ADMIN"`: mientras carga la sesión muestra un indicador de carga, sin sesión redirige a `/login` conservando la ubicación de origen, y con una sesión cuyo rol no es `ADMIN` (comparado sin distinguir mayúsculas) redirige a `/`. La `Navbar` DEBE mostrar el enlace "Panel Canchero" a `/admin` solo si el rol del usuario es `ADMIN`. Esta protección es de interfaz; la protección efectiva es la de ADM-001.

#### Escenario: Usuario sin rol de administrador
- Dado un usuario autenticado con rol `USER`
- Cuando navega a `/admin`
- Entonces se lo redirige a `/` y no ve el enlace "Panel Canchero"

#### Escenario: Sin sesión
- Dado un visitante sin sesión
- Cuando navega a `/admin`
- Entonces se lo redirige a `/login`

### ADM-010: Estructura del panel de administración

La página `AdminDashboard` DEBE mostrar el encabezado "Panel Administrativo", las tarjetas de métricas (ADM-011) y tres pestañas: "Grilla del Día" (activa al abrir), "Canchas" y "Todas las Reservas". Las tarjetas DEBEN permanecer visibles en las tres pestañas. La pestaña "Canchas" se rige por `canchas` (CAN-014).

#### Escenario: Apertura
- Dado un administrador que abre `/admin`
- Cuando se monta la página
- Entonces la pestaña activa es "Grilla del Día"

#### Escenario: Cambio de pestaña
- Dado el panel abierto
- Cuando se pulsa "Todas las Reservas"
- Entonces se muestra el historial y las tarjetas de métricas siguen visibles

### ADM-011: Tarjetas de métricas del mes

Al montarse, el panel DEBE pedir `GET /admin/metrics` con `startDate` igual al día 1 y `endDate` igual al último día del mes actual calculado en UTC, y mostrar tres tarjetas: "Recaudación del Mes" (`totalRevenueARS` formateado `es-AR` con prefijo `$`), "Reservas Confirmadas" (`confirmedCount`) y "Reservas Canceladas" (`cancelledCount`). Mientras carga DEBE mostrar "..." y, si no hay valor, 0. La solicitud de métricas y la de canchas (`GET /courts`) se hacen juntas.

#### Escenario: Carga correcta
- Dado un administrador y reservas creadas en el mes en curso
- Cuando se monta el panel
- Entonces las tarjetas muestran la recaudación, las confirmadas y las canceladas del `summary` recibido

#### Escenario: Falla la carga
- Dado que `GET /admin/metrics` o `GET /courts` fallan
- Cuando se monta el panel
- Entonces se registra el error en la consola, no se informa nada en pantalla y las tarjetas muestran `$0` y 0

### ADM-012: Grilla del día del panel

La pestaña "Grilla del Día" DEBE pedir `GET /bookings/admin/daily?date=<fecha elegida>` (fecha inicial: la de hoy en UTC) y mostrar una tabla con una columna por cancha cargada y una fila por cada hora de 08:00 a 22:00. Cada celda DEBE mostrar "Libre" o la reserva cuya cancha coincide y cuya hora de inicio en UTC (`getUTCHours()`, `getUTCMinutes()`) coincide con la fila, ignorando las reservas `CANCELLED`. La reserva DEBE mostrar el nombre del usuario (`firstName` y `lastName`, o la parte local del correo, o "Cliente"), la etiqueta "Transferencia" si el medio de pago es `TRANSFER` (en cualquier otro caso "Efectivo") y el precio formateado `es-AR`. La operación sobre esas reservas y la carga de turnos manuales se rigen por `reservas` (RES-022).

#### Escenario: Turno ocupado
- Dada una reserva `CONFIRMED` de una cancha a las 18:00 UTC
- Cuando se muestra la grilla de ese día
- Entonces la celda de esa cancha en la fila "18:00 hs" muestra a su usuario, el medio de pago y el precio

#### Escenario: Reserva cancelada
- Dada una reserva `CANCELLED` en ese horario
- Cuando se muestra la grilla
- Entonces la celda muestra "Libre"

### ADM-013: Historial de reservas del panel

La pestaña "Todas las Reservas" DEBE pedir `GET /bookings/admin/all` al activarse y listar cada reserva con el nombre de la cancha, el estado, la fecha y la hora de inicio en UTC, el deporte, el usuario (nombre completo o correo) y el precio formateado `es-AR`. Si no hay reservas DEBE mostrar "No hay reservas registradas en el sistema.". DEBE ofrecer el botón "Cancelar" solo en las reservas que no están `CANCELLED`.

#### Escenario: Listado con reservas
- Dado un administrador con reservas en el sistema
- Cuando abre la pestaña "Todas las Reservas"
- Entonces se listan con su estado y solo las no canceladas tienen el botón "Cancelar"

#### Escenario: Sin reservas
- Dado un sistema sin reservas
- Cuando abre la pestaña
- Entonces se muestra "No hay reservas registradas en el sistema."

### ADM-014: Cancelación desde el historial

Al pulsar "Cancelar" en el historial, el panel DEBE pedir confirmación con "¿Seguro que deseás cancelar este turno como administrador?" y, si se acepta, enviar `PATCH /bookings/admin/:id/status` con `{ status: "CANCELLED" }`. Si el pedido tiene éxito DEBE marcar la reserva como `CANCELLED` en la lista y ajustar las tarjetas localmente (confirmadas menos uno, con mínimo 0, y canceladas más uno). Si falla DEBE mostrar el aviso "No se pudo cancelar el turno." sin modificar la lista.

#### Escenario: Cancelación confirmada
- Dada una reserva no cancelada en el historial
- Cuando el administrador acepta la confirmación
- Entonces se envía `status: "CANCELLED"`, la reserva pasa a `CANCELLED` en pantalla y la tarjeta de canceladas aumenta en uno

#### Escenario: Confirmación rechazada
- Dada una reserva no cancelada
- Cuando el administrador rechaza la confirmación
- Entonces no se envía ningún pedido y la lista no cambia

#### Escenario: Error del servidor
- Dado que el servidor responde un error
- Cuando se acepta la cancelación
- Entonces se muestra "No se pudo cancelar el turno." y la reserva sigue sin cancelar en pantalla

## Fuera de alcance

- Alta y modificación de canchas (`POST` y `PATCH /admin/courts`) y su pestaña en el panel: dominio `canchas` (CAN-009 a CAN-011 y CAN-014).
- Agenda diaria, cambio de estado, transiciones, creación de reservas por el administrador y su operación en el panel: dominio `reservas` (RES-013 a RES-017 y RES-022).
- Autenticación, emisión y verificación de tokens y control de acceso por rol: dominio `autenticacion` (AUT-008, AUT-009, AUT-014).
- Gestión de usuarios, de complejos, empleados y de negocios: no existen endpoints ni pantallas.
- Roles `SUPER_ADMIN`, dueño y aislamiento por negocio (objetivo multi-tenant, no implementado).

## Observaciones

1. Cobertura de pruebas parcial. `integration.test.ts` cubre solo ADM-001 para `GET /admin/metrics` (403 a `USER` y 200 con `summary` a `ADMIN`) y requiere PostgreSQL con datos de seed y los usuarios de prueba (`admin@sportsbooking.com`, `jugador@example.com`); no se ejecutó para esta spec. `rutasAdminReservas.test.ts` cubre 401/403 y el listado de `GET /bookings/admin/all` (ADM-008) sin ser un archivo propio del dominio; el caso del listado necesita base de datos. Ninguna prueba cubre ADM-002 a ADM-007 (validación, período, conteos, recaudación, detalle), el 401 de `/admin/metrics` ni el frontend (sin pruebas). Los escenarios de esos requisitos se derivan del código.
2. El archivo `backend/tests/rutasAdminReservas.test.ts` no es UTF-8 válido: el nombre de la prueba de la línea 89 contiene bytes ilegibles ("m�s reciente a la m�s antigua"). No afecta la ejecución, pero impide editarlo con herramientas que exigen UTF-8.
3. La administración está dividida en dos prefijos: `/api/v1/admin` (canchas y métricas, módulo `admin`) y `/api/v1/bookings/admin/*` (agenda, listado, estado y alta de reservas, módulo `bookings`). No existe un módulo único de administración.
4. `GET /bookings/admin/all` no figura en ningún requisito de `reservas` (RES-013 a RES-017 cubren las otras tres rutas admin), por lo que se documenta aquí (ADM-008). Devuelve todas las reservas sin paginación ni límite.
5. Las métricas filtran por `createdAt` y no por la fecha del turno. La tarjeta "Recaudación del Mes" suma así lo reservado durante el mes (turnos que pueden ser de meses futuros) y no lo jugado en el mes. Ver ADM-004.
6. La recaudación excluye las reservas `COMPLETED`: marcar un turno como jugado lo saca de `confirmedCount` y de `totalRevenueARS`. Como el panel permite pasar `CONFIRMED` a `COMPLETED`, la "Recaudación del Mes" disminuye al completar turnos. Ver ADM-006.
7. Las métricas no distinguen si la reserva fue pagada: una reserva `CONFIRMED` con `MERCADOPAGO` sin acreditar se suma a la recaudación (las reservas nacen `CONFIRMED` antes del pago; ver `reservas`, observación 1).
8. **Resuelta por `deuda-auditoria` (2026-11-18): el tipo se infiere de la consulta de Prisma y la recaudación se suma con `Prisma.Decimal`.** `getMetrics` convierte la respuesta de Prisma con `as unknown as BookingMetricItem[]`, y el tipo declara `totalPrice: any` (`admin.service.ts:15`), lo que contradice la regla de "cero `any`" de `AGENTS.md`.
9. **Resuelta por `deuda-auditoria` (2026-11-18), ver ADM-003.** Una fecha con formato `YYYY-MM-DD` pero inexistente pasa la validación del esquema. Verificado con Node: un día que no existe en el mes y no supera 31 (por ejemplo `2026-02-31`) se desborda en silencio al mes siguiente (`2026-03-03T00:00:00.000Z`), así que las métricas usan otro rango sin avisar. Un mes mayor que 12 o un día mayor que 31 (por ejemplo `2026-13-01` o `2026-02-32`) producen `Invalid Date`. En ese caso es probable que Prisma rechace la consulta y la respuesta sea 500, pero no se ejecutó contra la base ni hay prueba que lo cubra.
10. El `details` de las métricas no define `orderBy`, por lo que el orden depende de la base y no está garantizado. No incluye usuario ni medio de pago; el panel solo usa `summary`.
11. El panel no consume `details` ni `period` de las métricas, y las tarjetas solo se piden al montar: cambiar el estado desde la "Grilla del Día" (marcar jugado o cancelar) no las actualiza. Solo la cancelación desde el historial ajusta los contadores y únicamente `confirmedCount` y `cancelledCount`, no la recaudación (ADM-014); además resta uno a confirmadas aunque la reserva cancelada no estuviera `CONFIRMED`, y la reserva puede ser de otro mes.
12. Si `GET /admin/metrics` o `GET /courts` fallan, `Promise.all` descarta también la otra respuesta: la lista de canchas queda vacía y la grilla no tiene columnas, sin ningún aviso al administrador (ADM-011).
13. En la grilla del día el botón de cancelar se muestra también en reservas `COMPLETED` (y la etiqueta de pago muestra "Efectivo" para `MERCADOPAGO` y cualquier valor distinto de `TRANSFER`). Cancelar una `COMPLETED` sería rechazado por la regla de transiciones (409, ver RES-014) y el panel solo mostraría "No se pudo actualizar el estado de la reserva." (inferido de la lectura del código; no probado).
14. La grilla usa una lista fija de horas (08:00 a 22:00) sin relación con `CourtSchedule` y ofrece una única columna por cancha activa devuelta por `GET /courts` (las desactivadas no aparecen; ver `canchas`, observación 9). Una reserva fuera de esas horas o de una cancha inactiva no se ve en la grilla, aunque la agenda del backend la devuelva.
15. El rol se compara en el frontend sin distinguir mayúsculas (`toUpperCase()`), mientras el backend compara exactamente `"ADMIN"` (`role.middleware.ts:10`). La coherencia depende de que el rol del token sea siempre `ADMIN`; no hay prueba que lo cubra.
16. Las métricas, el listado y la agenda abarcan todas las reservas del sistema, sin filtro por complejo o negocio (consistente con el estado single-tenant).

## Evidencia

- ADM-001: `backend/src/modules/admin/admin.routes.ts:9-15`; `backend/src/core/middlewares/role.middleware.ts:4-20`; `backend/src/app.ts:33`; `backend/tests/integration.test.ts:49-67`.
- ADM-002: `admin.routes.ts:15`; `backend/src/modules/admin/admin.controller.ts:41-53`; `backend/src/modules/admin/admin.dto.ts:15-18`; `backend/tests/integration.test.ts:60-67`.
- ADM-003: `admin.dto.ts:15-18`; `admin.controller.ts:47`; `backend/src/core/middlewares/errorHandler.ts:12-25`.
- ADM-004: `backend/src/modules/admin/admin.service.ts:64-77`.
- ADM-005: `admin.service.ts:81-87`, `:94-104`.
- ADM-006: `admin.service.ts:82-92`, `:100-103`.
- ADM-007: `admin.service.ts:105-112`; `:68-77` (`include` solo de `name` y `sport` de la cancha).
- ADM-008: `backend/src/modules/bookings/booking.routes.ts:8`, `:15`; `backend/src/modules/bookings/booking.controller.ts:89-98`; `backend/src/modules/bookings/booking.service.ts:159-176`; `backend/tests/rutasAdminReservas.test.ts:49-56` (403), `:83-87` (401), `:89-112` (listado, orden y sin `password`).
- ADM-009: `frontend/src/App.tsx:29-36`; `frontend/src/components/ProtectedRoute.tsx:14-31`; `frontend/src/components/Navbar.tsx:15`, `:48-56`.
- ADM-010: `frontend/src/pages/AdminDashboard.tsx:57-59`, `:390-439`, `:442-487`.
- ADM-011: `AdminDashboard.tsx:62-63`, `:121-167`, `:442-487`.
- ADM-012: `AdminDashboard.tsx:75-80`, `:103-119`, `:169-196`, `:363-385`, `:507-671`.
- ADM-013: `AdminDashboard.tsx:198-225`, `:802-895`.
- ADM-014: `AdminDashboard.tsx:332-361`.
- Observación 1: `backend/tests/integration.test.ts:11-26`; `backend/tests/rutasAdminReservas.test.ts:17-182`.
- Observación 3: `backend/src/app.ts:32-33`; `booking.routes.ts:13-17`.
- Observación 8: `admin.service.ts:9-24`, `:79`.
- Observaciones 11 y 12: `AdminDashboard.tsx:135-162`, `:228-240`, `:343-356`.
- Observación 13: `AdminDashboard.tsx:605-615`, `:641-652`.
- Observación 15: `Navbar.tsx:15`; `ProtectedRoute.tsx:29`; `role.middleware.ts:10`.
