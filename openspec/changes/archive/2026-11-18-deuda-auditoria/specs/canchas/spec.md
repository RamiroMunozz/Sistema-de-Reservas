# Delta spec: canchas (cambio `deuda-auditoria`)

Resuelve las observaciones 7 y 8 de `canchas`. Al archivar el cambio, esta delta se fusiona en `openspec/specs/canchas/spec.md`.

## AGREGADO

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

## MODIFICADO

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
