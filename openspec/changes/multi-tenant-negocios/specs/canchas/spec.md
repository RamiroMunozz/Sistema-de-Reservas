# Delta spec: canchas (cambio `multi-tenant-negocios`)

El catálogo público se consulta siempre dentro de un negocio resuelto por slug (NEG-005), y la gestión de canchas queda limitada al negocio del dueño (NEG-010). Al archivar el cambio, esta delta se fusiona en `openspec/specs/canchas/spec.md`.

Regla de nomenclatura: en los requisitos y escenarios de `canchas` no modificados abajo, `ADMIN` se lee `DUENO` y `USER` se lee `JUGADOR` (AUT-015).

Nota de alcance: las rutas públicas de canchas se exponen bajo `/api/v1/negocios/:slug/...`; su trazado exacto lo define el diseño. En los escenarios, "consultar el catálogo, el detalle o la disponibilidad del negocio `<slug>`" designa la operación pública equivalente de cada requisito dentro de ese negocio.

## MODIFICADO

### CAN-001: Listado público de canchas activas

El sistema DEBE devolver, sin autenticación y dentro del negocio indicado por su slug, las canchas con `isActive = true` cuyo complejo pertenece a ese negocio, ordenadas por `pricePerSlot` ascendente, y DEBE incluir en cada una su complejo (`complex`) limitado a `id`, `name`, `address` y `phone`. Responde 200 con un arreglo. NO DEBE devolver canchas inactivas ni canchas de otros negocios: no existe un catálogo que mezcle negocios. Para un slug inexistente o un negocio inactivo se rige por NEG-005 (404).

Motivo: aislamiento por negocio y resolución por slug (D2).
(Previously: `GET /api/v1/courts` devolvía las canchas activas de todo el sistema.)

#### Escenario: Listado con canchas activas
- Dado un negocio con canchas activas de distintos `pricePerSlot`
- Cuando se consulta su catálogo sin token
- Entonces responde 200 con un arreglo ordenado de menor a mayor `pricePerSlot`, y cada elemento tiene la propiedad `complex`

#### Escenario: Cancha inactiva excluida
- Dada una cancha del negocio con `isActive = false`
- Cuando se consulta su catálogo
- Entonces la cancha no aparece en el resultado

#### Escenario: Sin canchas activas
- Dado un negocio sin canchas activas
- Cuando se consulta su catálogo
- Entonces responde 200 con un arreglo vacío

#### Escenario: Canchas de otro negocio
- Dados los negocios A y B con canchas activas cada uno
- Cuando se consulta el catálogo del negocio A
- Entonces el resultado contiene solo canchas de A

#### Escenario: Filtro por complejo de otro negocio
- Dado el `complexId` de un complejo del negocio B
- Cuando se consulta el catálogo del negocio A con ese `complexId`
- Entonces responde 200 con un arreglo vacío

#### Escenario: Slug inexistente o negocio inactivo
- Dado un slug inexistente o el de un negocio con `activo` en falso
- Cuando se consulta su catálogo
- Entonces responde 404 "Negocio no encontrado"

### CAN-004: Detalle de una cancha

El sistema DEBE devolver, sin autenticación y dentro del negocio indicado por su slug, la cancha con su complejo completo y sus horarios (`schedules`) ordenados por `dayOfWeek` ascendente. DEBE responder 404 con "La cancha solicitada no existe o se encuentra inactiva" si la cancha no existe, tiene `isActive = false` o pertenece a otro negocio, con la misma respuesta en los tres casos (NEG-010).

Motivo: aislamiento por negocio.
(Previously: el detalle se obtenía por id de cancha sin considerar el negocio.)

#### Escenario: Cancha activa
- Dada una cancha activa del negocio con horarios cargados
- Cuando se consulta su detalle en ese negocio
- Entonces responde 200 con la cancha, su `complex` y sus `schedules` ordenados por día de la semana

#### Escenario: Cancha inactiva o inexistente
- Dado un `id` de una cancha inactiva o que no existe
- Cuando se consulta su detalle
- Entonces responde 404 con "La cancha solicitada no existe o se encuentra inactiva"

#### Escenario: Cancha de otro negocio
- Dada una cancha activa del negocio B
- Cuando se consulta su detalle con el slug del negocio A
- Entonces responde 404 con "La cancha solicitada no existe o se encuentra inactiva", igual que para una cancha inexistente

### CAN-007: Validación de la disponibilidad

El sistema DEBE responder 400 (error de validación) si `date` falta o no cumple el formato `YYYY-MM-DD` ("El formato de fecha debe ser YYYY-MM-DD"), 422 con "Fecha inválida" si cumple el formato pero no es una fecha real, y 404 con "Cancha no encontrada" si la cancha no existe, está inactiva o pertenece a un negocio distinto del indicado por el slug, con la misma respuesta en los tres casos (NEG-010).

Motivo: la disponibilidad pública se consulta dentro del negocio del slug.
(Previously: 404 solo si la cancha no existía o estaba inactiva.)

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

#### Escenario: Cancha de otro negocio
- Dada una cancha activa del negocio B
- Cuando se consulta su disponibilidad con el slug del negocio A y una fecha válida
- Entonces responde 404 con "Cancha no encontrada", igual que para una cancha inexistente

### CAN-008: Consulta de canchas sin autenticación

El sistema NO DEBE exigir token ni rol en el listado, el detalle ni la disponibilidad públicos de canchas (CAN-001, CAN-004, CAN-005 y CAN-007), que se resuelven por el slug del negocio (NEG-005).

Motivo: las rutas públicas se consultan por negocio.
(Previously: `GET /api/v1/courts`, `GET /api/v1/courts/:id` y `GET /api/v1/courts/:id/availability` sin token.)

#### Escenario: Visitante anónimo
- Dado un cliente sin cabecera `Authorization`
- Cuando consulta el catálogo, el detalle o la disponibilidad de un negocio activo
- Entonces la solicitud se procesa (no responde 401)

### CAN-009: Alta de cancha por un dueño

El sistema DEBE permitir a un `DUENO` crear una cancha con `POST /api/v1/admin/courts` y cuerpo `complexId` (UUID), `name` (mínimo 3 caracteres), `sport`, `surface`, `pricePerSlot` (número positivo) e `isIndoor` e `isActive` opcionales (por defecto `false` y `true`). El complejo DEBE pertenecer al negocio del dueño. DEBE responder 201 con la cancha creada, 404 con "El complejo especificado no existe" si el complejo no existe o pertenece a otro negocio (misma respuesta en ambos casos, NEG-010), sin crear la cancha, y 400 con el error de validación (CAN-003) si el cuerpo es inválido.

Motivo: el `complexId` enviado por el cliente debe verificarse contra el negocio del dueño.
(Previously: bastaba que el complejo existiera y el rol era `ADMIN`.)

#### Escenario: Alta correcta
- Dado un `DUENO` autenticado y un complejo de su negocio
- Cuando envía un cuerpo válido sin `isIndoor` ni `isActive`
- Entonces responde 201 con la cancha, con `isIndoor = false` e `isActive = true`

#### Escenario: Complejo inexistente
- Dado un `complexId` con formato UUID que no corresponde a ningún complejo
- Cuando se envía el alta
- Entonces responde 404 con "El complejo especificado no existe"

#### Escenario: Complejo de otro negocio
- Dados los negocios A y B y un complejo de B
- Cuando el dueño de A envía un alta con el `complexId` de ese complejo
- Entonces responde 404 con "El complejo especificado no existe" y no se crea ninguna cancha

#### Escenario: Cuerpo inválido
- Dado un `name` de 2 caracteres o un `pricePerSlot` igual a 0
- Cuando se envía el alta
- Entonces responde 400 con `errors` que indica el campo inválido

### CAN-010: Modificación de cancha por un dueño

El sistema DEBE permitir a un `DUENO` modificar una cancha de su negocio con `PATCH /api/v1/admin/courts/:id` y un cuerpo con cualquier subconjunto de los campos de CAN-009, validados con las mismas reglas, respondiendo 200 con la cancha actualizada. El `PATCH` DEBE modificar únicamente los campos enviados en el cuerpo: NO DEBE aplicar los valores por defecto de CAN-009 (`isIndoor = false`, `isActive = true`) a los campos omitidos; `isIndoor` e `isActive` omitidos DEBEN conservar el valor almacenado. Un campo enviado explícitamente (incluidos `isIndoor` e `isActive`) DEBE reemplazar el valor almacenado. DEBE responder 404 con "Cancha no encontrada" si el `id` (con formato UUID válido, CAN-015) no existe o pertenece a otro negocio (misma respuesta en ambos casos, NEG-010), sin modificar nada. Si el cuerpo trae un `complexId`, ese complejo DEBE pertenecer al negocio del dueño: si no existe o es de otro negocio DEBE responder 404 con "El complejo especificado no existe" sin modificar la cancha. La modificación DEBE poder desactivar una cancha (`isActive = false`), incluso si ya estaba inactiva (la búsqueda no filtra por `isActive`).

Motivo: aislamiento por negocio de la cancha y del complejo de destino.
(Previously: modificaba cualquier cancha por id, y el `complexId` nuevo no se verificaba.)

#### Escenario: Desactivar una cancha
- Dado un `DUENO` autenticado y una cancha activa de su negocio
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "isActive": false }`
- Entonces responde 200 con la cancha con `isActive = false`, y deja de aparecer en el catálogo público (CAN-001)

#### Escenario: Cancha inexistente
- Dado un `id` con formato UUID que no corresponde a ninguna cancha
- Cuando se envía la modificación
- Entonces responde 404 con "Cancha no encontrada"

#### Escenario: Cancha de otro negocio
- Dados los negocios A y B y una cancha de B
- Cuando el dueño de A envía `PATCH /api/v1/admin/courts/:id` con el id de esa cancha
- Entonces responde 404 con "Cancha no encontrada", igual que para una cancha inexistente, y la cancha de B no cambia

#### Escenario: Mover una cancha a un complejo de otro negocio
- Dada una cancha del negocio A y un complejo del negocio B
- Cuando el dueño de A envía `{ "complexId": <complejo de B> }`
- Entonces responde 404 con "El complejo especificado no existe" y la cancha conserva su complejo

#### Escenario: Campos omitidos conservan su valor (cancha inactiva)
- Dado un `DUENO` autenticado y una cancha de su negocio con `isActive = false` e `isIndoor = true`
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "name": "Cancha Central" }`
- Entonces responde 200 con `name` "Cancha Central", `isActive = false` e `isIndoor = true`, y los datos enviados a la base para actualizar contienen solo `name`

#### Escenario: Cuerpo vacío
- Dado un `DUENO` autenticado y una cancha de su negocio
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{}`
- Entonces ningún campo almacenado cambia (en particular `isIndoor` e `isActive` conservan su valor)

#### Escenario: Valores explícitos reemplazan los almacenados
- Dado un `DUENO` autenticado y una cancha de su negocio con `isActive = false` e `isIndoor = false`
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "isActive": true, "isIndoor": true }`
- Entonces responde 200 con `isActive = true` e `isIndoor = true`

#### Escenario: Valor explícito falso
- Dado un `DUENO` autenticado y una cancha de su negocio con `isIndoor = true`
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "isIndoor": false }`
- Entonces responde 200 con `isIndoor = false`

#### Escenario: Campo inválido
- Dado un `DUENO` autenticado y una cancha de su negocio
- Cuando envía `PATCH /api/v1/admin/courts/:id` con `{ "pricePerSlot": 0 }`
- Entonces responde 400 con `errors` que indica el campo `pricePerSlot`

### CAN-011: Protección de la gestión de canchas

El sistema DEBE exigir token válido y rol `DUENO` en `POST /api/v1/admin/courts` y `PATCH /api/v1/admin/courts/:id`: 401 sin token o con token inválido o vencido, y 403 con "No tienes los permisos necesarios para realizar esta acción" para un usuario sin rol `DUENO` (`JUGADOR` o `SUPER_ADMIN`). La protección es la misma que para el resto de `/admin/*` (ver `reservas`, RES de control de acceso, y `autenticacion`).

Motivo: roles nuevos (AUT-015).
(Previously: exigía el rol `ADMIN`.)

#### Escenario: Usuario sin rol de dueño
- Dado un usuario autenticado con rol `JUGADOR` o `SUPER_ADMIN`
- Cuando llama a `POST /api/v1/admin/courts`
- Entonces responde 403 con "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: Sin token
- Dada una solicitud sin cabecera `Authorization`
- Cuando llama a `PATCH /api/v1/admin/courts/:id`
- Entonces responde 401 con "Token no proporcionado o inválido."

### CAN-013: Catálogo de canchas en la página de reservas (frontend)

La página `BookingsPage` DEBE servirse en la ruta `/:slug` (sin marca ni personalización propias), cargar las canchas del negocio de ese slug (CAN-001) y mostrarlas con nombre, deporte, superficie, la marca "Techada" si `isIndoor` es verdadero y el precio por turno. Los slugs reservados (NEG-003) NO DEBEN resolverse como negocio: `/login`, `/reserva/:codigo`, `/mis-reservas` y `/admin` conservan sus páginas. Si el slug no corresponde a un negocio activo (404, NEG-005) DEBE mostrar un mensaje de negocio no encontrado en lugar del catálogo. DEBE ofrecer un filtro por deporte en el cliente con las opciones `ALL`, `FUTBOL_5`, `FUTBOL_7`, `PADEL` y `TENIS`, y NO DEBE enviar ese filtro al servidor. La grilla de horarios y la reserva se rigen por `reservas`.

Motivo: el catálogo se consulta por negocio y la página vive en `/:slug` (D2).
(Previously: la página cargaba `GET /courts` sin negocio.)

#### Escenario: Filtrar por deporte
- Dadas canchas de fútbol 5 y de pádel cargadas
- Cuando el usuario elige `PADEL`
- Entonces solo se muestran las canchas con `sport = PADEL`, sin nueva llamada al catálogo

#### Escenario: Sin resultados
- Dado un deporte sin canchas
- Cuando el usuario lo elige
- Entonces la página muestra el estado vacío en lugar de la lista

#### Escenario: Página de un negocio
- Dado un negocio activo con slug `principal`
- Cuando el usuario abre `/principal`
- Entonces ve las canchas de ese negocio y ninguna de otro

#### Escenario: Negocio inexistente o inactivo
- Dado un slug de un negocio inexistente o inactivo
- Cuando el usuario abre `/<slug>`
- Entonces ve un mensaje de negocio no encontrado y ningún catálogo

#### Escenario: Rutas propias de la aplicación
- Dado un usuario
- Cuando abre `/login`, `/mis-reservas` o `/admin`
- Entonces ve la página correspondiente y no se intenta resolver ese texto como slug

## ELIMINADO

(Sin requisitos eliminados.)
