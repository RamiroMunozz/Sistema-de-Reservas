# Exploración: deuda-auditoria

Cambio N.º 2 de `docs/producto/hoja-de-ruta.md`. Verificado contra el código actual de la rama `desarrollo` (2026-11-18). Copia en Engram: `sdd/deuda-auditoria/explore`.

## Estado por ítem

| N.º | Ítem | Estado | Evidencia | Esfuerzo y pruebas |
|---|---|---|---|---|
| 1 | `any` y conversión forzada en `admin.service.ts` | Vigente | `backend/src/modules/admin/admin.service.ts:15` (`totalPrice: any`) y `:79` (`as unknown as BookingMetricItem[]`). Es el único `any` que queda en `backend/src`. | ~10 líneas: tipar con `Prisma.Decimal` o derivar el tipo con `Prisma.BookingGetPayload` y quitar la conversión. Prueba unitaria de `getMetrics` con Prisma simulado (~40 líneas). Hoy solo `integration.test.ts` cubre ADM-001 y requiere PostgreSQL. |
| 2 | UTC en `AdminDashboard.tsx:815` | Ya corregido | `frontend/src/pages/AdminDashboard.tsx:816-827` usa `timeZone: "UTC"`, `getUTCHours()` y `getUTCMinutes()`. | Ninguno. |
| 3 | Registro del `userId` en `booking.service.ts` | Ya corregido | El servicio no tiene `console.*`. Los demás `console.*` de `backend/src` no registran `userId`. | Ninguno. |
| 4 | `\|\| true` en el Dockerfile | Vigente | `backend/DockerFile:8` (`RUN npm run build \|\| true`). `decisiones-auditoria.md:47` lo dejó pendiente porque el build fallaba. Al 2026-11-18, `npx tsc -p .` en `backend/` termina sin errores. | 1 línea. No se puede probar `docker build` sin Docker. El `CMD npm run dev` del runner (A7) queda fuera de alcance. |
| 5 | Rotar `JWT_SECRET` | Operativo, no es código | El código ya falla sin el secreto (`backend/src/core/config/security.ts:13-16`, prueba `secretosJwt.test.ts`). `decisiones-auditoria.md:51` deja pendiente rotar el valor de `backend/.env`, que figura en el historial de git. | Procedimiento en `docs/operacion/` (~20 líneas). La rotación real la hace el usuario a mano: invalida las sesiones activas (tokens de 15 minutos, sin renovación). |
| 6 | 500 con un UUID inexistente | Parcial | Un UUID válido pero inexistente ya devuelve 404 (`admin.service.ts:50-56`, `booking.service.ts:107-109`). `cancel` valida el formato con `idReservaSchema` (`booking.controller.ts:58`). **Sigue el 500** con un id mal formado en `PATCH /admin/courts/:id` (`admin.controller.ts:32`) y en `court.controller.ts:31,45` (`getById` y `getAvailability`), porque las columnas son `@db.Uuid`. Además, la carrera entre `findUnique` y `update` (P2025) no está mapeada. | ~60-90 líneas: esquema `idCanchaSchema` con el mismo patrón que `idReservaSchema`, y opcionalmente el mapeo de P2025 en `errorHandler`. Pruebas con Prisma simulado. El texto de la hoja de ruta ("UUID inexistente") está desactualizado. |
| 7 | A3 (reserva confirmada antes del pago y rechazo de pago) | Fuera de este cambio | `booking.service.ts:81` y `:267` crean la reserva `CONFIRMED`. Webhook en `payment.service.ts`. | Ver la sección siguiente. |

## Frontera de A3 con `reserva-invitado`

- `reserva-invitado` (D1, PAG-016) resuelve el rechazo de pago para todas las reservas: un pago rechazado nunca cancela una reserva. También resuelve el estado `PENDING` con vencimiento a los 15 minutos para los invitados.
- Esa propuesta deja explícito que el flujo con sesión sigue en `CONFIRMED` y lo deriva a `deuda-auditoria` o `politica-cobro`.
- Para el usuario autenticado, A3 tiene dos partes: (a) la reserva nace `CONFIRMED` antes del pago, y (b) el rechazo cancela una reserva `CONFIRMED`. La parte (b) la absorbe `reserva-invitado`.
- **Recomendación:** `deuda-auditoria` no toca A3. Cambiar el estado inicial de las reservas con cuenta es una decisión de producto y afecta el webhook que rediseña `reserva-invitado`. La parte (a) pasa a `politica-cobro` (cambio 6), y hay que corregir el texto de la hoja de ruta.

## Adiciones candidatas (fuera de la hoja de ruta)

- **Recomendadas:**
  - **Observación 8 de `canchas`:** `updateCourtSchema = createCourtSchema.partial()` (`admin.dto.ts:13`) restablece `isIndoor=false` e `isActive=true` en cada `PATCH`, así que reactiva en silencio una cancha desactivada. Verificado con Zod 4.4.3. ~40 líneas con prueba.
  - **Observación 9 de `administracion`:** una fecha imposible como `2026-02-31` se desborda al mes siguiente en las métricas. La función `esFechaExistente` de `booking.dto.ts:11-23` ya existe; hay que reutilizarla en `metricsQuerySchema`. ~40 líneas con prueba.
- **Opcionales:**
  - Verificar el `complexId` en el `PATCH` de canchas (~10 líneas).
  - Convertir `rutasAdminReservas.test.ts` a UTF-8. Conviene hacerlo aparte, porque el diff sería ruidoso.
- **No incluir:**
  - Las métricas que suman pagos de Mercado Pago no acreditados, porque dependen de A3.
  - La paginación, el orden de los detalles y los problemas de interfaz del panel.

## Estimación

- **Alcance de la hoja de ruta** (ítems 1, 4, 5 y 6): ~150 a 180 líneas.
- **Con las dos adiciones recomendadas:** ~250 a 300 líneas. Queda bajo el presupuesto de 400.
- Las pruebas son de backend, con Prisma simulado (mismo patrón que `validacionReservas.test.ts`), así que no requieren PostgreSQL.

## Riesgos

- La hoja de ruta está desactualizada en los ítems 2, 3 y 6.
- `docker build` sin `|| true` no se pudo probar sin Docker.
- `reserva-invitado` toca los mismos archivos. Este cambio va primero.
- La rotación de `JWT_SECRET` es manual e invalida las sesiones activas. No se automatiza.
