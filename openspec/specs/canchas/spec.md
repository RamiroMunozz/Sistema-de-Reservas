# Spec: canchas

## Propósito

Describe el catálogo de canchas tal como está implementado hoy (single-tenant): el modelo `Court`/`CourtSchedule`, la consulta pública (listado, detalle y disponibilidad por cancha), el alta y la modificación por parte de un administrador, y las pantallas del frontend que las muestran y las gestionan.

## Requisitos

### CAN-001: Listado público de canchas activas

El sistema DEBE devolver con `GET /api/v1/courts` (sin autenticación) las canchas con `isActive = true`, ordenadas por `pricePerSlot` ascendente, y DEBE incluir en cada una su complejo (`complex`) limitado a `id`, `name`, `address` y `phone`. Responde 200 con un arreglo. NO DEBE devolver canchas inactivas.

#### Escenario: Listado con canchas activas
- Dado que existen canchas activas con distintos `pricePerSlot`
- Cuando se llama a `GET /api/v1/courts` sin token
- Entonces responde 200 con un arreglo ordenado de menor a mayor `pricePerSlot`, y cada elemento tiene la propiedad `complex`

#### Escenario: Cancha inactiva excluida
- Dada una cancha con `isActive = false`
- Cuando se llama a `GET /api/v1/courts`
- Entonces la cancha no aparece en el resultado

#### Escenario: Sin canchas activas
- Dado que no hay canchas activas
- Cuando se llama a `GET /api/v1/courts`
- Entonces responde 200 con un arreglo vacío

### CAN-002: Filtros del listado

El sistema DEBE aceptar en `GET /api/v1/courts` los parámetros opcionales `sport` (`FUTBOL_5`, `FUTBOL_7`, `PADEL`, `TENIS`), `surface` (`SINTETICO`, `CEMENTO`, `POLVO_LADRILLO`, `PARQUET`), `isIndoor`, `maxPrice` y `complexId` (UUID), y DEBE aplicarlos combinados (todos a la vez). `maxPrice` DEBE incluir las canchas con `pricePerSlot` menor o igual al valor. `isIndoor` DEBE interpretarse como `true` solo si el valor es exactamente la cadena `true`; cualquier otro valor se interpreta como `false`.

#### Escenario: Filtro por deporte
- Dadas canchas de varios deportes
- Cuando se llama a `GET /api/v1/courts?sport=FUTBOL_5`
- Entonces responde 200 y todas las canchas devueltas tienen `sport = FUTBOL_5`

#### Escenario: Filtros combinados
- Dadas canchas de pádel de distintos precios
- Cuando se llama a `GET /api/v1/courts?sport=PADEL&maxPrice=20000`
- Entonces solo se devuelven canchas de pádel con `pricePerSlot` menor o igual a 20000

#### Escenario: `isIndoor` distinto de `true`
- Dado el parámetro `isIndoor=1`
- Cuando se llama a `GET /api/v1/courts?isIndoor=1`
- Entonces se filtran las canchas con `isIndoor = false`

### CAN-003: Validación de los filtros del listado

El sistema DEBE responder 400 con el cuerpo de error de validación (`detail`: "Los datos enviados no cumplen con el formato requerido." y la lista `errors` con `field` y `message`) cuando `sport` o `surface` no pertenecen a su enumeración, cuando `complexId` no es un UUID ("El complexId debe ser un UUID válido") o cuando `maxPrice` no es un número positivo ("El precio debe ser un número positivo").

#### Escenario: Deporte inexistente
- Dado un valor de `sport` fuera de la enumeración
- Cuando se llama a `GET /api/v1/courts?sport=GOLF`
- Entonces responde 400 con `errors` que incluye el campo `sport`

#### Escenario: Precio máximo no positivo
- Dado `maxPrice=0` o `maxPrice=abc`
- Cuando se llama a `GET /api/v1/courts`
- Entonces responde 400 con el mensaje "El precio debe ser un número positivo"

### CAN-004: Detalle de una cancha

El sistema DEBE devolver con `GET /api/v1/courts/:id` (sin autenticación) la cancha con su complejo completo y sus horarios (`schedules`) ordenados por `dayOfWeek` ascendente. DEBE responder 404 con "La cancha solicitada no existe o se encuentra inactiva" si la cancha no existe o tiene `isActive = false`.

#### Escenario: Cancha activa
- Dada una cancha activa con horarios cargados
- Cuando se llama a `GET /api/v1/courts/:id`
- Entonces responde 200 con la cancha, su `complex` y sus `schedules` ordenados por día de la semana

#### Escenario: Cancha inactiva o inexistente
- Dado un `id` de una cancha inactiva o que no existe
- Cuando se llama a `GET /api/v1/courts/:id`
- Entonces responde 404 con "La cancha solicitada no existe o se encuentra inactiva"

### CAN-005: Generación de turnos de la disponibilidad

El sistema DEBE devolver con `GET /api/v1/courts/:id/availability?date=YYYY-MM-DD` (sin autenticación) un objeto con `courtId`, `courtName`, `pricePerSlot`, `date` y `slots`, donde cada slot tiene `startTime` y `endTime` (ISO 8601 en UTC) e `isAvailable`. Los slots DEBEN generarse de forma consecutiva desde la hora de apertura hasta la hora de cierre del `CourtSchedule` correspondiente al día de la semana UTC de `date`, con la duración `slotDurationMinutes`. Si la cancha no tiene horario para ese día, DEBE usar 08:00 a 23:00 con turnos de 60 minutos.

#### Escenario: Cancha con horario para el día
- Dada una cancha con `CourtSchedule` de 08:00 a 23:00 y `slotDurationMinutes` 60 para el día consultado
- Cuando se consulta la disponibilidad
- Entonces devuelve 15 slots consecutivos, de 08:00 a 09:00 hasta 22:00 a 23:00 (UTC)

#### Escenario: Cancha sin horario para el día
- Dada una cancha sin `CourtSchedule` para el día de la semana consultado
- Cuando se consulta la disponibilidad
- Entonces devuelve los slots de 08:00 a 23:00 con turnos de 60 minutos

### CAN-006: Ocupación de los turnos de la disponibilidad

El sistema DEBE marcar `isAvailable = false` en un slot cuando se solapa con alguna reserva de la cancha con estado distinto de `CANCELLED` cuyo `startTime` cae dentro del día UTC consultado, y `isAvailable = true` en caso contrario. Un slot contiguo a una reserva (sin solapamiento) DEBE quedar disponible.

#### Escenario: Slot ocupado
- Dada una reserva `CONFIRMED` de 10:00 a 11:00 UTC en esa cancha y fecha
- Cuando se consulta la disponibilidad
- Entonces el slot 10:00 a 11:00 tiene `isAvailable = false` y los slots 09:00 a 10:00 y 11:00 a 12:00 tienen `isAvailable = true`

#### Escenario: Reserva cancelada
- Dada una reserva `CANCELLED` de 10:00 a 11:00 UTC
- Cuando se consulta la disponibilidad
- Entonces el slot 10:00 a 11:00 tiene `isAvailable = true`

### CAN-007: Validación de la disponibilidad

El sistema DEBE responder 400 (error de validación) si `date` falta o no cumple el formato `YYYY-MM-DD` ("El formato de fecha debe ser YYYY-MM-DD"), 422 con "Fecha inválida" si cumple el formato pero no es una fecha real, y 404 con "Cancha no encontrada" si la cancha no existe o está inactiva.

#### Escenario: Formato incorrecto
- Dado `date=01-12-2026`
- Cuando se consulta la disponibilidad
- Entonces responde 400 con el mensaje "El formato de fecha debe ser YYYY-MM-DD"

#### Escenario: Fecha inexistente
- Dado `date=2026-13-99`
- Cuando se consulta la disponibilidad
- Entonces responde 422 con "Fecha inválida"

#### Escenario: Cancha inactiva
- Dada una cancha con `isActive = false`
- Cuando se consulta su disponibilidad con una fecha válida
- Entonces responde 404 con "Cancha no encontrada"

### CAN-008: Consulta de canchas sin autenticación

El sistema NO DEBE exigir token ni rol en `GET /api/v1/courts`, `GET /api/v1/courts/:id` ni `GET /api/v1/courts/:id/availability`.

#### Escenario: Visitante anónimo
- Dado un cliente sin cabecera `Authorization`
- Cuando llama a cualquiera de las tres rutas
- Entonces la solicitud se procesa (no responde 401)

### CAN-009: Alta de cancha por un administrador

El sistema DEBE permitir a un `ADMIN` crear una cancha con `POST /api/v1/admin/courts` y cuerpo `complexId` (UUID), `name` (mínimo 3 caracteres), `sport`, `surface`, `pricePerSlot` (número positivo) e `isIndoor` e `isActive` opcionales (por defecto `false` y `true`). DEBE responder 201 con la cancha creada, 404 con "El complejo especificado no existe" si el complejo no existe, y 400 con el error de validación (CAN-003) si el cuerpo es inválido.

#### Escenario: Alta correcta
- Dado un `ADMIN` autenticado y un complejo existente
- Cuando envía un cuerpo válido sin `isIndoor` ni `isActive`
- Entonces responde 201 con la cancha, con `isIndoor = false` e `isActive = true`

#### Escenario: Complejo inexistente
- Dado un `complexId` con formato UUID que no corresponde a ningún complejo
- Cuando se envía el alta
- Entonces responde 404 con "El complejo especificado no existe"

#### Escenario: Cuerpo inválido
- Dado un `name` de 2 caracteres o un `pricePerSlot` igual a 0
- Cuando se envía el alta
- Entonces responde 400 con `errors` que indica el campo inválido

### CAN-010: Modificación de cancha por un administrador

El sistema DEBE permitir a un `ADMIN` modificar una cancha con `PATCH /api/v1/admin/courts/:id` y un cuerpo con cualquier subconjunto de los campos de CAN-009, validados con las mismas reglas, respondiendo 200 con la cancha actualizada. El `PATCH` DEBE modificar únicamente los campos enviados en el cuerpo: NO DEBE aplicar los valores por defecto de CAN-009 (`isIndoor = false`, `isActive = true`) a los campos omitidos; `isIndoor` e `isActive` omitidos DEBEN conservar el valor almacenado. Un campo enviado explícitamente (incluidos `isIndoor` e `isActive`) DEBE reemplazar el valor almacenado. DEBE responder 404 con "Cancha no encontrada" si el `id` (con formato UUID válido, CAN-015) no existe. La modificación DEBE poder desactivar una cancha (`isActive = false`), incluso si ya estaba inactiva (la búsqueda no filtra por `isActive`).

Motivo: con `createCourtSchema.partial()` los valores por defecto de `isIndoor` e `isActive` se aplicaban igual a campos omitidos, de modo que un `PATCH` reactivaba en silencio una cancha desactivada y restablecía `isIndoor` (observación 8). Los valores por defecto siguen rigiendo solo el alta (CAN-009).

#### Escenario: Desactivar una cancha
- Dado un `ADMIN` autenticado y una cancha activa
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "isActive": false }`
- Entonces responde 200 con la cancha con `isActive = false`, y deja de aparecer en el listado público (CAN-001)

#### Escenario: Cancha inexistente
- Dado un `id` con formato UUID que no corresponde a ninguna cancha
- Cuando se envía la modificación
- Entonces responde 404 con "Cancha no encontrada"

#### Escenario: Campos omitidos conservan su valor (cancha inactiva)
- Dado un `ADMIN` autenticado y una cancha con `isActive = false` e `isIndoor = true`
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "name": "Cancha Central" }`
- Entonces responde 200 con `name` "Cancha Central", `isActive = false` e `isIndoor = true`, y los datos enviados a la base para actualizar contienen solo `name`

#### Escenario: Cuerpo vacío
- Dado un `ADMIN` autenticado y una cancha existente
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{}`
- Entonces ningún campo almacenado cambia (en particular `isIndoor` e `isActive` conservan su valor)

#### Escenario: Valores explícitos reemplazan los almacenados
- Dado un `ADMIN` autenticado y una cancha con `isActive = false` e `isIndoor = false`
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "isActive": true, "isIndoor": true }`
- Entonces responde 200 con `isActive = true` e `isIndoor = true`

#### Escenario: Valor explícito falso
- Dado un `ADMIN` autenticado y una cancha con `isIndoor = true`
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "isIndoor": false }`
- Entonces responde 200 con `isIndoor = false`

#### Escenario: Campo inválido
- Dado un `ADMIN` autenticado y una cancha existente
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "pricePerSlot": 0 }`
- Entonces responde 400 con `errors` que indica el campo `pricePerSlot`
### CAN-011: Protección de la gestión de canchas

El sistema DEBE exigir token válido y rol `ADMIN` en `POST /api/v1/admin/courts` y `PATCH /api/v1/admin/courts/:id`: 401 sin token o con token inválido o vencido, y 403 con "No tienes los permisos necesarios para realizar esta acción" para un usuario sin rol `ADMIN`. La protección es la misma que para el resto de `/admin/*` (ver `reservas`, RES de control de acceso, y `autenticacion`).

#### Escenario: Usuario sin rol de administrador
- Dado un usuario autenticado con rol `USER`
- Cuando llama a `POST /api/v1/admin/courts`
- Entonces responde 403 con "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: Sin token
- Dada una solicitud sin cabecera `Authorization`
- Cuando llama a `PATCH /api/v1/admin/courts/:id`
- Entonces responde 401 con "Token no proporcionado o inválido."

### CAN-012: Modelo de datos de la cancha

El sistema DEBE persistir cada cancha (`Court`, tabla `courts`) con `id` UUID, `complexId` (obligatorio, con eliminación en cascada desde el complejo), `name` (hasta 100 caracteres), `sport`, `surface`, `pricePerSlot` (decimal 10,2), `isIndoor` (por defecto `false`), `isActive` (por defecto `true`) y `createdAt`. DEBE persistir los horarios (`CourtSchedule`, tabla `court_schedules`) con `dayOfWeek` (entero), `openTime`, `closeTime` y `slotDurationMinutes` (por defecto 60), con a lo sumo un horario por cancha y día de la semana, y eliminación en cascada desde la cancha. Los valores de `sport` son `FUTBOL_5`, `FUTBOL_7`, `PADEL` y `TENIS`; los de `surface`, `SINTETICO`, `CEMENTO`, `POLVO_LADRILLO` y `PARQUET`.

#### Escenario: Un horario por cancha y día
- Dada una cancha con un horario para el día 1
- Cuando se intenta insertar otro horario de esa cancha para el día 1
- Entonces la base lo rechaza por la unicidad `(courtId, dayOfWeek)`

#### Escenario: Eliminación del complejo
- Dado un complejo con canchas y horarios
- Cuando se elimina el complejo
- Entonces se eliminan en cascada sus canchas y los horarios de estas

### CAN-013: Catálogo de canchas en la página de reservas (frontend)

La página `BookingsPage` DEBE cargar las canchas con `GET /courts` y mostrarlas con nombre, deporte, superficie, la marca "Techada" si `isIndoor` es verdadero y el precio por turno. DEBE ofrecer un filtro por deporte en el cliente con las opciones `ALL`, `FUTBOL_5`, `FUTBOL_7`, `PADEL` y `TENIS`, y NO DEBE enviar ese filtro al servidor. La grilla de horarios y la reserva se rigen por `reservas`.

#### Escenario: Filtrar por deporte
- Dadas canchas de fútbol 5 y de pádel cargadas
- Cuando el usuario elige `PADEL`
- Entonces solo se muestran las canchas con `sport = PADEL`, sin nueva llamada a `/courts`

#### Escenario: Sin resultados
- Dado un deporte sin canchas
- Cuando el usuario lo elige
- Entonces la página muestra el estado vacío en lugar de la lista

### CAN-014: Gestión de canchas en el panel de administración (frontend)

La pestaña "Canchas" de `AdminDashboard` DEBE listar las canchas obtenidas con `GET /courts` (título "Canchas Activas (n)", con nombre, deporte, superficie y precio) y ofrecer un formulario que envía `POST /admin/courts` con `name`, `sport`, `surface`, `pricePerSlot`, `isIndoor`, `isActive: true` y, si está disponible, `complexId`. Tras un alta correcta DEBE agregar la cancha a la lista, mostrar "¡Cancha creada correctamente en el sistema!" y limpiar `name`, `pricePerSlot` e `isIndoor`; ante un error DEBE mostrar el `detail` o `message` del servidor.

#### Escenario: Alta desde el panel
- Dado un administrador en la pestaña "Canchas" con un `complexId` tomado de la primera cancha cargada
- Cuando completa el formulario y lo envía
- Entonces se envía `POST /admin/courts`, la cancha nueva aparece en la lista y se muestra el mensaje de éxito

#### Escenario: Error del servidor
- Dado un alta que el backend rechaza
- Cuando se envía el formulario
- Entonces se muestra el `detail` (o `message`) de la respuesta, o "Error al crear la cancha." si no hay ninguno

### CAN-015: Validación del identificador de cancha en las rutas con `:id`

El sistema DEBE validar que el parámetro `id` sea un UUID antes de consultar la base de datos en `GET /api/v1/courts/:id`, `GET /api/v1/courts/:id/availability` y `PATCH /api/v1/admin/courts/:id`. Si `id` no es un UUID, DEBE responder 400 con el cuerpo de error de validación (CAN-003): `detail` "Los datos enviados no cumplen con el formato requerido." y la lista `errors` con un elemento cuyo `field` es `id`. NO DEBE responder 500 ni consultar la base de datos en ese caso. En `PATCH /admin/courts/:id` la verificación de token y rol (CAN-011) se evalúa antes que la validación del `id`. Un `id` con formato UUID válido que no corresponde a ninguna cancha mantiene las respuestas 404 de CAN-004, CAN-007 y CAN-010.

#### Escenario: Detalle con `id` mal formado
- Dado un `id` que no es UUID, por ejemplo `abc`
- Cuando se llama a `GET /api/v1/courts/abc`
- Entonces responde 400 con `errors` que incluye el campo `id`, y no se consulta la base de datos

#### Escenario: Disponibilidad con `id` mal formado
- Dado un `id` que no es UUID y una fecha válida
- Cuando se llama a `GET /api/v1/courts/abc/availability?date=2026-12-01`
- Entonces responde 400 con `errors` que incluye el campo `id`, y no se consulta la base de datos

#### Escenario: Modificación con `id` mal formado
- Dado un `ADMIN` autenticado y un `id` que no es UUID
- Cuando envía `PATCH /api/v1/admin/courts/abc` con `{ "name": "Cancha 1" }`
- Entonces responde 400 con `errors` que incluye el campo `id`, y no se consulta ni modifica la base de datos

#### Escenario: `id` con formato UUID válido e inexistente
- Dado un `id` con formato UUID que no corresponde a ninguna cancha
- Cuando se llama a `GET /api/v1/courts/:id`
- Entonces responde 404 con "La cancha solicitada no existe o se encuentra inactiva" (sin cambios respecto de CAN-004)

#### Escenario: Modificación sin rol de administrador con `id` mal formado
- Dado un usuario con rol `USER` y un `id` que no es UUID
- Cuando envía `PATCH /api/v1/admin/courts/abc`
- Entonces responde 403 (CAN-011), no 400

## Fuera de alcance

- Creación y cambio de estado de reservas, grilla de horarios del jugador y `GET /bookings/availability` (dominio `reservas`); validaciones de cancha al reservar (RES-003).
- Métricas de administración (`GET /admin/metrics`) y control de acceso general (`administracion`, `autenticacion`).
- Gestión de complejos (`Complex`): solo existe lectura embebida y verificación de existencia en el alta de cancha; no hay endpoints de complejos.
- Alta, edición o baja de `CourtSchedule`: no hay endpoints ni pantallas (solo el seed los crea).
- Eliminación de canchas: no existe endpoint.
- Aislamiento por negocio (objetivo multi-tenant, no implementado).

## Observaciones

1. Cobertura de pruebas casi nula: solo `integration.test.ts` cubre `GET /courts` (200, arreglo no vacío con `complex`, filtro por `sport`). Requiere PostgreSQL con datos de seed y no se ejecutó para esta spec. Nada prueba CAN-002 (resto de filtros), CAN-003, CAN-004 a CAN-007, CAN-009 a CAN-012 ni el frontend (que no tiene pruebas). Los escenarios de esos requisitos se derivan del código.
2. Disponibilidad duplicada con `GET /bookings/availability` (ver `reservas`, observación 5): este endpoint usa `CourtSchedule` y devuelve slots; el otro devuelve horas ocupadas. El frontend de jugador usa solo el de `bookings`; ninguna pantalla consume `GET /courts/:id/availability` ni `GET /courts/:id`.
3. La creación de reservas no consulta `CourtSchedule` (`reservas`, observación 7): los horarios de la cancha solo influyen en la disponibilidad informativa.
4. La disponibilidad usa solo la hora entera de `openTime` y `closeTime` (`getUTCHours()`); se ignoran los minutos. Si `slotDurationMinutes` no divide el intervalo, el último slot puede terminar después del cierre.
5. La disponibilidad solo considera reservas cuyo `startTime` cae en el día UTC consultado; una reserva que empieza el día anterior y cruza la medianoche no se detecta. No marca como no disponibles los turnos ya pasados.
6. Un día sin `CourtSchedule` se trata como abierto de 08:00 a 23:00, no como cerrado; no se distingue "sin horario cargado" de "cancha cerrada".
7. **Resuelta por `deuda-auditoria` (2026-11-18), ver CAN-015.** `getById` y `getAvailability` pasan el `id` directamente a Prisma sin validar el formato UUID. No hay prueba que muestre la respuesta con un `id` mal formado.
8. **Resuelta por `deuda-auditoria` (2026-11-18), ver CAN-010, salvo la verificación de `complexId`, que sigue pendiente.** `updateCourt` (`PATCH`) usa `createCourtSchema.partial()`, que conserva los valores por defecto de `isIndoor` (`false`) e `isActive` (`true`). Con Zod 4.4.3, `partial()` aplica igual esos valores por defecto: se verificó que `z.object({ isActive: z.boolean().default(true) }).partial().parse({})` devuelve `{ isActive: true }`. Por lo tanto, un `PATCH` sin esos campos los restablece silenciosamente (por ejemplo, reactiva una cancha desactivada). No hay prueba que lo cubra. Además, un `complexId` nuevo no se verifica (a diferencia del alta), por lo que un complejo inexistente fallaría en la base.
9. `getAllCourts` y la pestaña "Canchas Activas" del panel solo ven canchas activas: una cancha desactivada con `PATCH` desaparece del panel de administración y no hay forma de reactivarla desde la interfaz. Tampoco hay edición ni desactivación en el frontend; solo alta.
10. `AdminDashboard` ofrece solo `FUTBOL_5`, `PADEL` y `TENIS` al crear (falta `FUTBOL_7`, que sí acepta el backend y filtra `BookingsPage`), con precio mínimo 1000 y paso 500 del formulario que el backend no exige (solo positivo). El `complexId` se toma de la primera cancha cargada; si no hay canchas, el alta se envía sin `complexId` y el backend responde 400 (no hay selector de complejo).
11. `pricePerSlot` es `Decimal`; el tipo del frontend lo declara `string | number` y lo convierte con `Number(...)` al mostrarlo y al reservar.
12. Algunos mensajes del dominio difieren en cancha inexistente según la ruta: "La cancha solicitada no existe o se encuentra inactiva" (detalle), "Cancha no encontrada" (disponibilidad y `PATCH`) y 400 "La cancha no existe." al reservar (`reservas`).
13. Los errores de `authenticate` (401) responden `{ message }`, sin el formato del manejador global (`detail`, `type`), a diferencia del 403 de `requireRole`.

## Evidencia

- CAN-001: `backend/src/modules/courts/court.service.ts:10-37` (filtro `isActive` en `:11-13`, `include` de `complex` en `:25-34`, orden en `:35`); `court.controller.ts:11-23`; `court.routes.ts:7`; `backend/src/app.ts:31`; `backend/tests/integration.test.ts:32-39`.
- CAN-002: `court.dto.ts:3-21`; `court.service.ts:15-21`; `backend/tests/integration.test.ts:41-45` (solo `sport`).
- CAN-003: `court.dto.ts:3-21`; `court.controller.ts:17`; `backend/src/core/middlewares/errorHandler.ts:12-25`.
- CAN-004: `court.service.ts:39-57`; `court.controller.ts:25-37`; `court.routes.ts:8`; `backend/src/core/errors/AppError.ts:31-35`.
- CAN-005: `court.service.ts:59-86`, `:104-148`; `court.dto.ts:23-27`; `court.controller.ts:39-55`; `court.routes.ts:9`; `backend/prisma/seed.ts:86-104`.
- CAN-006: `court.service.ts:88-102`, `:123-137`.
- CAN-007: `court.dto.ts:23-27`; `court.service.ts:60-63`, `:77-79`; `AppError.ts:37-43`.
- CAN-008: `court.routes.ts:7-9`; `backend/src/app.ts:31` (sin middlewares de autenticación).
- CAN-009: `backend/src/modules/admin/admin.dto.ts:3-11`; `admin.service.ts:27-47`; `admin.controller.ts:12-24`; `admin.routes.ts:13`.
- CAN-010: `admin.dto.ts:13`; `admin.service.ts:49-62`; `admin.controller.ts:26-36`; `admin.routes.ts:14`.
- CAN-011: `admin.routes.ts:9-11`; `backend/src/core/middlewares/auth.ts:4-26`; `backend/src/core/middlewares/role.middleware.ts:4-20`; `backend/tests/integration.test.ts:48-58` (403 en `/admin/metrics`, misma protección de router).
- CAN-012: `backend/prisma/schema.prisma:20-32`, `:67-77`, `:79-96`, `:98-110`.
- CAN-013: `frontend/src/pages/BookingsPage.tsx:23-24`, `:54-58`, `:116-119`, `:249-259`, `:281-305`; `frontend/src/types/index.ts:13-23`.
- CAN-014: `frontend/src/pages/AdminDashboard.tsx:66-72`, `:139-150`, `:283-320`, `:674-800`; `frontend/src/types/index.ts:13-23`.
- Observación 8: `admin.dto.ts:9-13`; `admin.service.ts:58-61`; `backend/package.json:29`.
- Observación 10: `AdminDashboard.tsx:147-149`, `:298-300`, `:705-713`, `:737-746`.
