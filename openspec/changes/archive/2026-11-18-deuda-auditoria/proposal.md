# Propuesta: deuda-auditoria

Copia en Engram: `sdd/deuda-auditoria/proposal`. Exploración: `openspec/changes/deuda-auditoria/exploration.md`. Auditoría: `docs/historial/auditoria-seguridad.md` y `docs/historial/decisiones-auditoria.md`. Hoja de ruta: cambio N.º 2.

## Intención

La auditoría de seguridad dejó deuda pendiente y las specs base de `canchas` y `administracion` registraron defectos verificados en el código actual:

- Queda un `any` y una conversión forzada (`as unknown as`) en `admin.service.ts`, en contra de la regla "cero `any`" de `AGENTS.md`.
- El Dockerfile del backend ignora los errores de compilación (`|| true`), aunque hoy `npx tsc -p .` termina sin errores.
- El valor de `JWT_SECRET` figura en el historial de git y no hay un procedimiento documentado para rotarlo.
- Un `id` de cancha mal formado produce 500 en lugar de 400 (columnas `@db.Uuid`).
- Un `PATCH` de cancha sin `isIndoor` ni `isActive` los restablece a los valores por defecto y reactiva en silencio una cancha desactivada (observación 8 de `canchas`, verificado con Zod 4.4.3).
- Una fecha imposible en las métricas (`2026-02-31`) se desborda al mes siguiente en lugar de rechazarse (observación 9 de `administracion`).

Además, la fila 2 de la hoja de ruta está desactualizada: el UTC de `AdminDashboard` y el registro del `userId` ya están corregidos, y el punto A3 corresponde a otros cambios.

**Por qué ahora:** es deuda acotada, de bajo riesgo y con evidencia verificada. `reserva-invitado` toca los mismos archivos (`admin/`, `bookings/`), así que conviene cerrarla antes para no mezclar correcciones con funcionalidad nueva.

## Decisiones tomadas

| N.º | Decisión | Origen |
|---|---|---|
| D1 | El punto A3 queda fuera: la parte (a), reserva con cuenta `CONFIRMED` antes del pago, pasa a `politica-cobro` (cambio 6); la parte (b), rechazo de pago, la resuelve `reserva-invitado` (D1 de esa propuesta). | Usuario (alcance aprobado) y exploración |
| D2 | El mapeo de `P2025` de Prisma a 404 en `errorHandler` **no** se incluye. La carrera entre `findUnique` y `update` es improbable, un mapeo global afecta a todos los módulos y los mensajes de "no encontrado" difieren por dominio (observación 12 de `canchas`). Se registra como observación para un cambio posterior. | Propuesta (delegado por el usuario a esta fase) |
| D3 | La validación del `id` de cancha reutiliza el patrón de `idReservaSchema` (`uuidSchema` en `booking.dto.ts`): error de validación 400 con el formato del manejador global. | Usuario (alcance aprobado) |
| D4 | `esFechaExistente` se reutiliza, no se duplica: se exporta desde `booking.dto.ts` o se mueve a un módulo compartido. La ubicación la decide la fase de diseño. | Exploración |
| D5 | La rotación de `JWT_SECRET` es solo documentación; la ejecuta el usuario a mano. Nunca se lee ni se modifica `.env`. | Usuario (alcance aprobado) |

## Alcance

### Dentro del alcance

1. **Tipado de métricas:** quitar `totalPrice: any` (`backend/src/modules/admin/admin.service.ts:15`) y la conversión `as unknown as BookingMetricItem[]` (`:79`), con un tipo derivado de Prisma (`Prisma.Decimal` o `Prisma.BookingGetPayload`). Prueba unitaria de `getMetrics` con Prisma simulado. Sin cambio de comportamiento observable.
2. **Dockerfile:** quitar `|| true` de `backend/DockerFile:8`, para que un error de compilación haga fallar la imagen.
3. **Rotación de `JWT_SECRET`:** procedimiento en `docs/operacion/` (sección nueva en `variables-entorno.md` o en `despliegue.md`, a decidir en diseño): generar un secreto nuevo, reemplazarlo en el entorno, reiniciar el backend y aceptar que las sesiones activas se invalidan (tokens de 15 minutos, sin renovación).
4. **Validación del `id` de cancha:** responder 400 en lugar de 500 con un `id` que no es UUID en `PATCH /api/v1/admin/courts/:id` (`admin.controller.ts:32`), `GET /api/v1/courts/:id` y `GET /api/v1/courts/:id/availability` (`court.controller.ts`, `getById` y `getAvailability`). Pruebas con Prisma simulado.
5. **`PATCH` de cancha sin valores por defecto:** el esquema de modificación (`updateCourtSchema`, hoy `createCourtSchema.partial()` en `admin.dto.ts:13`) no debe completar `isIndoor` ni `isActive` cuando no vienen en el cuerpo; un `PATCH` solo cambia los campos enviados. Prueba que lo demuestre.
6. **Fechas de métricas existentes:** el esquema de consulta de métricas rechaza con 400 las fechas con formato válido que no existen (`2026-02-31`, `2026-13-01`), reutilizando `esFechaExistente`. Prueba con fechas imposibles y fechas válidas límite (`2028-02-29`).
7. **Hoja de ruta:** actualizar la fila 2 de `docs/producto/hoja-de-ruta.md`: UTC de `AdminDashboard` y log de `userId` ya resueltos; el "UUID inexistente" pasa a "UUID mal formado"; A3 se deriva a `politica-cobro` (fila 6) y a `reserva-invitado`.

### Fuera del alcance

- Punto A3 completo (D1).
- Mapeo de `P2025` a 404 en `errorHandler` (D2).
- Verificar el `complexId` en el `PATCH` de canchas.
- Convertir `backend/tests/rutasAdminReservas.test.ts` a UTF-8 (observación 2 de `administracion`); diff ruidoso, va aparte.
- `CMD npm run dev` en la etapa final del Dockerfile (A7).
- Métricas que suman reservas `MERCADOPAGO` no acreditadas (observación 7 de `administracion`; depende de A3).
- Problemas de interfaz del panel de administración (observaciones 9 a 14 de `administracion` y 9 y 10 de `canchas`).
- La rotación efectiva de `JWT_SECRET` (acción manual del usuario).

## Capacidades

> Contrato con la fase de specs. Las delta specs van en `openspec/changes/deuda-auditoria/specs/<dominio>/spec.md`, según `convencion-specs`.

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `canchas`:
  - MODIFICADO: CAN-010 (un `PATCH` solo modifica los campos enviados; `isIndoor` e `isActive` omitidos conservan su valor), CAN-004 y CAN-007 (un `id` que no es UUID responde 400 con error de validación). La fase de specs PUEDE expresar la validación del `id` como un requisito AGREGADO común a las tres rutas en lugar de modificar cada uno.
  - Resuelve las observaciones 7 y 8.
- `administracion`:
  - MODIFICADO: ADM-003 (además del formato, la fecha debe existir; una fecha imposible responde 400).
  - Resuelve las observaciones 8 (sin requisito afectado: es tipado interno) y 9.
- Sin delta spec: el Dockerfile, la documentación de la rotación de `JWT_SECRET` y la hoja de ruta no cambian comportamiento especificado.

## Enfoque

- **TDD estricto en el backend:** cada corrección empieza con una prueba que falla (vitest, Prisma simulado, mismo patrón que `validacionReservas.test.ts`); ninguna requiere PostgreSQL.
- **Validación en el controlador con Zod:** el `id` se valida con un esquema de parámetros antes de llamar al servicio, igual que `cancel` con `idReservaSchema`. El controlador sigue delgado; el servicio no cambia.
- **Esquema de modificación propio:** se define el esquema del `PATCH` sin `.default()` en `isIndoor` e `isActive` (por ejemplo, un esquema base sin valores por defecto del que derivan el alta, con defaults, y la modificación, parcial). La forma exacta queda para diseño.
- **Tipado sin conversiones:** el tipo del detalle de métricas se deriva de la consulta de Prisma; si el `select` cambia, `tsc` lo detecta.
- **Documentación operativa:** procedimiento paso a paso, sin valores reales ni comandos que lean `.env`.

## Entregas

Presupuesto de revisión de ~400 líneas. Estimación total ~250 a 300 líneas, dentro del presupuesto: no hace falta dividir en varias entregas, aunque la fase de tareas puede agrupar los ítems en unidades de trabajo con sus pruebas. Los commits se hacen en `desarrollo`.

| Ítem | Líneas estimadas |
|---|---|
| 1. Tipado de métricas y prueba | ~50 |
| 2. Dockerfile | ~1 |
| 3. Procedimiento de rotación | ~20 |
| 4. Validación del `id` de cancha y pruebas | ~60 a 80 |
| 5. `PATCH` sin valores por defecto y prueba | ~40 |
| 6. Fechas de métricas existentes y prueba | ~40 |
| 7. Hoja de ruta | ~2 |

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/src/modules/admin/admin.service.ts` | Modificado | Tipo del detalle de métricas sin `any` ni conversión. |
| `backend/src/modules/admin/admin.dto.ts` | Modificado | Esquema del `PATCH` sin valores por defecto; fechas de métricas existentes. |
| `backend/src/modules/admin/admin.controller.ts` | Modificado | Validación del `id` en `PATCH /admin/courts/:id`. |
| `backend/src/modules/courts/court.controller.ts` (y `court.dto.ts`) | Modificado | Validación del `id` en `getById` y `getAvailability`. |
| `backend/src/modules/bookings/booking.dto.ts` | Modificado | `esFechaExistente` exportado o movido a un módulo compartido. |
| `backend/tests/` | Nuevo | Pruebas de `getMetrics`, validación del `id`, `PATCH` parcial y fechas de métricas. |
| `backend/DockerFile` | Modificado | Sin `\|\| true` en el build. |
| `docs/operacion/` | Modificado | Procedimiento de rotación de `JWT_SECRET`. |
| `docs/producto/hoja-de-ruta.md` | Modificado | Texto de la fila 2. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| `docker build` falla sin `\|\| true` y no se puede probar sin Docker | Baja | `npx tsc -p .` en `backend/` está limpio (2026-11-18); verificar con `docker build` cuando haya Docker disponible. |
| Un cliente dependía del 500 o de que el `PATCH` reactivara la cancha | Baja | El frontend no usa `PATCH` ni `GET /courts/:id`; el nuevo comportamiento coincide con lo que CAN-010 ya promete. |
| Mover `esFechaExistente` rompe la validación de reservas | Baja | Las pruebas de `validacionReservas` existentes cubren el comportamiento actual. |
| La rotación de `JWT_SECRET` cierra las sesiones activas | Alta (esperado) | Documentarlo en el procedimiento y hacerlo en un horario de baja actividad. |
| Conflicto con `reserva-invitado` en `admin/` | Media | Este cambio va primero y es pequeño. |
| Pruebas que necesitan PostgreSQL siguen fallando sin Docker | Alta | Las pruebas nuevas usan Prisma simulado; las 5 existentes que requieren base se aceptan como falla conocida. |

## Plan de reversa

- **Por ítem:** cada unidad de trabajo es un commit independiente en `desarrollo`; se revierte con `git revert` de su commit. No hay dependencias entre ítems salvo que el ítem 6 use el `esFechaExistente` exportado.
- **Sin migraciones:** el cambio no toca `schema.prisma` ni la base; no hace falta SQL de reversa.
- **Dockerfile:** si el build falla en el despliegue, revertir la línea restaura el comportamiento anterior mientras se corrige el error de compilación.
- **Rotación de `JWT_SECRET`:** es irreversible por diseño (volver al secreto anterior lo reexpondría); ante un problema se genera otro secreto nuevo.

## Dependencias

- Specs base de `canchas` y `administracion` en `openspec/specs/` (generadas por `specs-base`, aún sin commitear).
- Docker para verificar `docker build` (opcional; no bloquea el cambio).

## Criterios de éxito

- [ ] `backend/src` no contiene `any` ni `as unknown as`; `npx tsc --noEmit` sin errores.
- [ ] `getMetrics` tiene una prueba unitaria con Prisma simulado que verifica resumen y detalle.
- [ ] `backend/DockerFile` no contiene `|| true`.
- [ ] `docs/operacion/` describe la rotación de `JWT_SECRET` y su impacto en las sesiones.
- [ ] `PATCH /admin/courts/:id`, `GET /courts/:id` y `GET /courts/:id/availability` con un `id` que no es UUID responden 400, no 500.
- [ ] Un `PATCH` con solo `{ "name": "..." }` sobre una cancha inactiva la deja inactiva y conserva `isIndoor`.
- [ ] `GET /admin/metrics?startDate=2026-02-31&endDate=2026-03-31` responde 400; `2028-02-29` se acepta.
- [ ] La fila 2 de la hoja de ruta refleja el alcance real.
- [ ] `cd backend && npm test` sin fallas nuevas (salvo las 5 pruebas que requieren PostgreSQL si no hay base).
