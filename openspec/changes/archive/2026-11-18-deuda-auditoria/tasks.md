# Tareas: deuda-auditoria

Copia en Engram: `sdd/deuda-auditoria/tasks`. Entradas: `proposal.md`, `design.md` y las delta specs `specs/canchas/spec.md` (CAN-015, CAN-010) y `specs/administracion/spec.md` (ADM-003).

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas de cambio estimadas (adiciones + eliminaciones) | ~375 (~125 de código y documentación, ~250 de pruebas) |
| 400-line budget risk | Medio: poco margen; si las pruebas crecen, se supera |
| Chained PRs recommended | No (el proyecto no usa PR; commits granulares en `desarrollo`) |
| Estrategia de entrega | `exception-ok`; cadena: ninguna (entrega única) |
| Decision needed before apply | No. `size:exception` aceptado por el usuario si se supera el presupuesto |

Mitigación: usar `it.each` en los casos repetitivos (fechas inválidas y las tres rutas con `id` mal formado).

## Convenciones de ejecución

- TDD estricto en el backend. Corredor: `cd backend && npm test` (vitest). Tipos: `cd backend && npx tsc --noEmit`.
- Las pruebas nuevas son HTTP (supertest contra `app`) con `prisma` simulado (`vi.hoisted` + `vi.mock("../src/core/config/prisma.js")`, import dinámico de `app` después del mock, `vi.stubEnv("JWT_SECRET", ...)`, token con `jwt.sign`). Ninguna necesita PostgreSQL. Patrón de referencia: `backend/tests/validacionReservas.test.ts`.
- Nombres de `describe` e `it` en español, citando el ID del requisito. Sin `any`.
- Cada unidad de trabajo (UT) es un commit en `desarrollo`, hecho a mano por el usuario. No se commitea desde la fase apply sin su orden.
- Se registra el RED observado; si no se observó, no se declara.
- Nunca leer ni modificar `.env`.

## Fallas ambientales conocidas

`npm test` tiene 5 fallas que requieren PostgreSQL (Docker Desktop apagado) y 18 pruebas omitidas (estado de la bitácora). Son aceptables; cualquier otra falla es nueva y bloquea. Antes de la UT-1, correr `npm test` una vez y registrar los nombres exactos de las 5 fallas como línea base.

## Orden y dependencias

```
UT-1 (mover auxiliares) ─► UT-2 (fechas, ítem 6) ─► UT-3 (id cancha, ítem 4) ─► UT-4 (PATCH, ítem 5) ─► UT-5 (tipado, ítem 1)
UT-6 (Dockerfile y docs, ítems 2, 3, 7): independiente, paralelizable con cualquiera.
T-7.1 (verificación final): al terminar todas.
```

- UT-2 y UT-3 dependen de UT-1 (usan el módulo compartido).
- UT-2 crea `metricasAdmin.test.ts`; UT-5 lo extiende (secuencial).
- UT-3 crea `validacionCanchas.test.ts`; UT-4 lo extiende (secuencial).
- UT-3/UT-4 y UT-2/UT-5 tocan `admin.controller.ts`/`admin.dto.ts`/`admin.service.ts` en puntos distintos; se recomienda secuencial para evitar conflictos, aunque las dos cadenas (métricas y canchas) podrían ir en paralelo.
- UT-6 solo toca `backend/DockerFile` y `docs/`; no tiene dependencias de código.

---

## UT-1: Mover los auxiliares de validación a un módulo compartido (Decisión 2)

Commit sugerido: `refactor(validacion): mover uuidSchema y esFechaExistente a core/validacion`

- [x] **T-1.1 Línea base de pruebas.**
  - Archivos: ninguno.
  - Criterios: `cd backend && npm test` ejecutado; se registran las 5 fallas ambientales (nombres) y los totales como referencia. `validacionReservas.test.ts` en verde.
  - Checks: `npm test`.
- [x] **T-1.2 Crear `backend/src/core/validacion/esquemas.ts` y actualizar `booking.dto.ts`.**
  - Archivos: `backend/src/core/validacion/esquemas.ts` (crear), `backend/src/modules/bookings/booking.dto.ts` (modificar).
  - Criterios (Decisión 2): `uuidSchema(campo)` y `esFechaExistente(fecha)` se mueven sin cambios desde `booking.dto.ts:8-18`; `booking.dto.ts` los importa y conserva `fechaSchema`, `idReservaSchema` y sus mensajes. Sin duplicación.
  - TDD: RED no aplica (refactor puro). La red de seguridad es `validacionReservas.test.ts` sin cambios. GREEN: esa prueba y toda la suite igual que la línea base. REFACTOR: revisar importaciones con extensión `.js` según el proyecto.
  - Checks: `npm test` (igual que la línea base), `npx tsc --noEmit`.

## UT-2: Fechas de métricas existentes (ítem 6, ADM-003, Decisión 5)

Commit sugerido: `fix(admin): rechazar con 400 las fechas inexistentes en las métricas`

- [x] **T-2.1 RED: crear `backend/tests/metricasAdmin.test.ts` con las pruebas de ADM-003.**
  - Archivos: `backend/tests/metricasAdmin.test.ts` (crear; simulado de `booking.findMany`; token `ADMIN`).
  - Pruebas: `it.each` con `2026-02-31` (startDate), `2026-13-01` (endDate), `2026-02-32` (startDate) y `2026-02-29` (startDate): 400 con el campo esperado en `errors` y `findMany` sin llamar. Formato `01/08/2026`: 400 y `errors` contiene `{ field: "startDate", message: "Formato YYYY-MM-DD" }` (usar `toContainEqual`, no igualdad exacta). Aceptación: `2028-02-29..2028-03-31` y `2026-08-01..2026-08-31` responden 200 (`period.from` "2028-02-29"). Rango invertido responde 200 con contadores en cero.
  - RED esperado: `2026-02-31` y `2026-02-29` responden 200 (desborde); `2026-13-01` y `2026-02-32` llegan a `findMany`. Registrar el fallo observado.
  - Checks: `npm test -- metricasAdmin`.
- [x] **T-2.2 GREEN: `fechaMetricaSchema` con `esFechaExistente` en `admin.dto.ts`.**
  - Archivos: `backend/src/modules/admin/admin.dto.ts`.
  - Criterios (ADM-003, Decisión 5): regex `^\d{4}-\d{2}-\d{2}$` con mensaje "Formato YYYY-MM-DD" más `.refine(esFechaExistente, "La fecha no existe")`; `metricsQuerySchema` usa el esquema en `startDate` y `endDate`. Sin `abort`.
  - Checks: `npm test -- metricasAdmin` en verde, `npx tsc --noEmit`.
- [x] **T-2.3 REFACTOR.** Limpiar con las pruebas en verde; correr la suite completa. Checks: `npm test`, `npx tsc --noEmit`.

## UT-3: Validación del `id` de cancha (ítem 4, CAN-015, Decisión 3)

Commit sugerido: `fix(canchas): responder 400 ante un id de cancha que no es UUID`

- [x] **T-3.1 RED: crear `backend/tests/validacionCanchas.test.ts` con las pruebas de CAN-015.**
  - Archivos: `backend/tests/validacionCanchas.test.ts` (crear; simulado de `court.findUnique` y `court.update`).
  - Pruebas: `it.each` sobre `GET /api/v1/courts/abc`, `GET /api/v1/courts/abc/availability?date=2026-12-01` y `PATCH /api/v1/admin/courts/abc` (con `ADMIN`, cuerpo `{ name: "Cancha 1" }`): 400, `errors` contiene el campo `id` y `findUnique` no se llama. `PATCH` con `USER` e `id` `abc`: 403. UUID válido inexistente en `GET /courts/:id`: 404 con "La cancha solicitada no existe o se encuentra inactiva" (regresión, pasa antes y después).
  - RED esperado: el `id` mal formado llega a `findUnique` (el simulado devuelve `undefined`): se observa 404 y una llamada a `findUnique`, no 400.
  - Checks: `npm test -- validacionCanchas`.
- [x] **T-3.2 GREEN: `idCanchaSchema` y su uso en los controladores.**
  - Archivos: `backend/src/modules/courts/court.dto.ts`, `backend/src/modules/courts/court.controller.ts`, `backend/src/modules/admin/admin.controller.ts`.
  - Criterios (CAN-015, Decisión 3): `idCanchaSchema = z.object({ id: uuidSchema("El ID de la cancha") })` en `court.dto.ts`. `getById` y `getAvailability` usan `idCanchaSchema.parse(req.params)` (el `id` se valida antes que la consulta `date`); `updateCourt` hace lo mismo antes de parsear el cuerpo, importando de `../courts/court.dto.js`. El `ZodError` llega por `next(error)` al `errorHandler` (sin cambios). 403 para `USER` antes de validar.
  - Checks: `npm test -- validacionCanchas` en verde, `npx tsc --noEmit`.
- [x] **T-3.3 REFACTOR.** Revisar duplicación en los controladores; correr la suite completa. Checks: `npm test`, `npx tsc --noEmit`.

## UT-4: `PATCH` de cancha sin valores por defecto (ítem 5, CAN-010, Decisión 4)

Commit sugerido: `fix(canchas): no aplicar valores por defecto en el PATCH de cancha`

- [x] **T-4.1 RED: agregar las pruebas de CAN-010 a `validacionCanchas.test.ts`.**
  - Archivos: `backend/tests/validacionCanchas.test.ts`. El simulado de `court.findUnique` devuelve una cancha con `isActive: false` e `isIndoor: true` y `court.update` devuelve el registro.
  - Pruebas (todas con `ADMIN` y UUID válido): `PATCH { name: "Cancha Central" }` hace que `court.update` reciba `data` igual a `{ name: "Cancha Central" }` y responde 200. `{}` produce `data` igual a `{}`. `{ isActive: true, isIndoor: true }` y `{ isIndoor: false }` se envían tal cual. `{ pricePerSlot: 0 }` responde 400 con el campo `pricePerSlot`. UUID inexistente responde 404 "Cancha no encontrada" (regresión).
  - RED esperado: `data` contiene `isIndoor: false` e `isActive: true` agregados por el `.default()`.
  - Checks: `npm test -- validacionCanchas`.
- [x] **T-4.2 GREEN: esquema base sin defaults en `admin.dto.ts`.**
  - Archivos: `backend/src/modules/admin/admin.dto.ts`.
  - Criterios (CAN-010, Decisión 4): `canchaBaseSchema` con las reglas de CAN-009 una sola vez; `createCourtSchema = canchaBaseSchema.extend({ isIndoor: default(false), isActive: default(true) })`; `updateCourtSchema = canchaBaseSchema.partial()`. `CreateCourtDTO` conserva `isIndoor` e `isActive` obligatorios; `UpdateCourtDTO` parcial. `admin.service.ts` no cambia. Las pruebas de alta existentes (si las hay) siguen en verde.
  - Checks: `npm test -- validacionCanchas` en verde, `npx tsc --noEmit`.
- [x] **T-4.3 REFACTOR.** Limpiar; suite completa. Checks: `npm test`, `npx tsc --noEmit`.

## UT-5: Tipado de `getMetrics` sin `any` (ítem 1, ADM-002, Decisión 1)

Commit sugerido: `refactor(admin): tipar getMetrics por inferencia de Prisma y sumar con Decimal`

- [x] **T-5.1 RED: agregar la prueba de ADM-002 a `metricasAdmin.test.ts`.**
  - Archivos: `backend/tests/metricasAdmin.test.ts`.
  - Prueba: `findMany` simulado con reservas `CONFIRMED`, `CANCELLED` y `PENDING`, con `totalPrice` como `new Prisma.Decimal("0.10")` y `new Prisma.Decimal("0.20")` en las confirmadas. Verifica `summary` (contadores y `totalRevenueARS` igual a `0.3`) y `details` (`court`, `sport`, `status` y `price` numérico). Dejar un comentario que indique que el detalle es de caracterización.
  - RED esperado: `totalRevenueARS` da `0.30000000000000004` con la suma por `Number`. El resto del detalle pasa antes y después (caracterización).
  - Checks: `npm test -- metricasAdmin`.
- [x] **T-5.2 GREEN: eliminar `BookingMetricItem` y la conversión; suma con `Prisma.Decimal`.**
  - Archivos: `backend/src/modules/admin/admin.service.ts`.
  - Criterios (Decisión 1): se quitan la interfaz (`:9-24`) y `as unknown as BookingMetricItem[]` (`:79`); se usa el tipo inferido de `findMany`. `totalRevenue = confirmedBookings.reduce((acc, b) => acc.plus(b.totalPrice), new Prisma.Decimal(0)).toNumber()`; el detalle usa `b.totalPrice.toNumber()`. La forma JSON no cambia.
  - Checks: `npm test -- metricasAdmin` en verde, `npx tsc --noEmit`.
- [x] **T-5.3 REFACTOR y verificación de ausencia de `any`.**
  - Criterios: búsqueda con `rg -n "\bany\b|as unknown as" backend/src` sin coincidencias en código (comentarios aparte). Suite completa en verde salvo las fallas ambientales.
  - Checks: `npm test`, `npx tsc --noEmit`, `rg`.
  - Decisión resuelta (2026-11-18): el usuario aprobó la suma con `Prisma.Decimal`. T-5.1 mantiene su RED.

## UT-6: Dockerfile, rotación de `JWT_SECRET` y hoja de ruta (ítems 2, 3, 7; Decisiones 6 y 7)

Commit sugerido: `docs(operacion): documentar rotación de JWT_SECRET, endurecer el build y actualizar la hoja de ruta`

Sin pruebas automatizadas (no hay comportamiento probado). Paralelizable con cualquier otra UT.

- [x] **T-6.1 Quitar `|| true` del Dockerfile.**
  - Archivos: `backend/DockerFile` (línea 8 pasa a `RUN npm run build`).
  - Criterios: el archivo no contiene `|| true`; `CMD ["npm", "run", "dev"]` queda intacto (fuera de alcance, A7).
  - Checks: `rg -n "\|\| true" backend/DockerFile` sin coincidencias; `cd backend && npx tsc -p .` sin errores; `docker build` cuando haya Docker (opcional, no bloquea).
- [x] **T-6.2 Sección "Rotación de `JWT_SECRET`".**
  - Archivos: `docs/operacion/variables-entorno.md`.
  - Criterios (Decisión 6): los cinco pasos (generar secreto con `node -e` de `node:crypto`; reemplazarlo a mano en `backend/.env` y en el `.env` de la raíz; reiniciar; impacto: se invalidan los tokens y las sesiones deben reiniciarse, tokens de 15 minutos, horario de baja actividad; el valor anterior sigue en el historial de git y nunca se vuelve a un secreto anterior). Sin valores reales ni comandos que lean `.env`.
- [x] **T-6.3 Actualizar `despliegue.md`.**
  - Archivos: `docs/operacion/despliegue.md`.
  - Criterios: la línea 5 deja de mencionar `|| true` como deuda; el tema "Gestión de secretos y rotación de `JWT_SECRET`" enlaza al procedimiento y conserva como pendiente solo la gestión de secretos en producción.
- [x] **T-6.4 Actualizar la fila 2 de la hoja de ruta.**
  - Archivos: `docs/producto/hoja-de-ruta.md`.
  - Criterios (Decisión 7): refleja el alcance real (tipado de métricas, `|| true`, rotación de `JWT_SECRET`, 400 con UUID mal formado en canchas, `PATCH` sin defaults, fechas de métricas inexistentes); indica que el UTC de `AdminDashboard` y el registro del `userId` ya estaban resueltos y que A3 se deriva a `politica-cobro` (fila 6) y `reserva-invitado`.
  - Checks de la UT: relectura de los tres documentos y de los enlaces entre ellos.

---

## Verificación final

- [x] **T-7.1 Verificación completa del backend.**
  - Comandos (en `backend/`):
    - `npm test`: sin fallas nuevas respecto de la línea base de T-1.1. Fallas conocidas aceptables: las 5 pruebas que requieren PostgreSQL (Docker Desktop apagado); 18 omitidas.
    - `npx tsc --noEmit`: sin errores.
    - `npm run build`: termina sin errores.
  - Criterios de éxito de la propuesta: `rg -n "\bany\b|as unknown as" backend/src` sin código afectado; `backend/DockerFile` sin `|| true`; los escenarios de CAN-015, CAN-010 y ADM-003 cubiertos por pruebas en verde; fila 2 de la hoja de ruta actualizada.
  - Registrar el resultado observado de cada comando; no declarar lo que no se corrió.

## Tabla de trazabilidad

| Requisito / decisión | Tareas |
|---|---|
| ADM-003 (Decisión 5) | T-2.1, T-2.2, T-2.3 |
| CAN-015 (Decisión 3) | T-3.1, T-3.2, T-3.3 |
| CAN-010 (Decisión 4) | T-4.1, T-4.2, T-4.3 |
| ADM-002 / ítem 1 (Decisión 1) | T-5.1, T-5.2, T-5.3 |
| Decisión 2 (módulo compartido) | T-1.2 |
| Ítems 2, 3, 7 (Decisiones 6, 7) | T-6.1 a T-6.4 |
