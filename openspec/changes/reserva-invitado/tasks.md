# Tareas: reserva-invitado

Copia en Engram: `sdd/reserva-invitado/tasks`. Entradas: `proposal.md`, `design.md` y las delta specs `specs/reservas/spec.md`, `specs/pagos/spec.md`, `specs/administracion/spec.md` y `specs/canchas/spec.md` (47 requisitos).

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas de cambio estimadas (adiciones + eliminaciones) | ~3.550 en total (pruebas incluidas), repartidas en 11 entregas tras las divisiones propuestas |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (como cadena de entregas; el proyecto no usa PR: son lotes de commits en `desarrollo`) |
| Suggested split | UT-1 → UT-2 → UT-3 → UT-4 → UT-5a → UT-5b → UT-6 → UT-7 → UT-8 → UT-9a → UT-9b |
| Delivery strategy | ask-on-risk, con excepción de tamaño solo para la entrega 8 (decisión del usuario) |
| Chain strategy | size-exception (solo UT-8); el resto son entregas secuenciales en `desarrollo`, sin PR |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Estimación por entrega

| Entrega | Contenido | Líneas estimadas | Estado frente a 400 |
|---|---|---|---|
| UT-1 | Esquema, migraciones A y B, `EXPIRED`, vencimiento y barrido | ~400 | En el límite |
| UT-2 | Filtros de lectura y recaudación | ~260 | Dentro |
| UT-3 | Adaptador MP, PAG-004, cancelación compartida, preferencia vigente | ~410 | Apenas sobre el límite |
| UT-4 | `POST /public/bookings` | ~400 | En el límite |
| UT-5a | Webhook: registro idempotente en `BookingPayment` y ramas de confirmación (1, 2, 3, 6, 7 y rama 9 con turno libre) | ~220 | Dentro (división aprobada de la entrega 5) |
| UT-5b | Webhook: ramas con motivo de reembolso (4, 5, 8 y rama 9 con turno ocupado `SLOT_TAKEN`), `COMPLETED` (10) y reescritura de `webhookPago.test.ts` (líneas 179-190) | ~240 | Dentro (división aprobada de la entrega 5) |
| UT-6 | Rutas por token, `estadoSena.ts`, reintento, limitador de consulta | ~380 | Dentro |
| UT-7 | Vistas de administrador con pagos, `depositPercent`, reembolso por pago | ~400 | En el límite |
| UT-8 | Frontend público | ~420 | Sobre el límite: **excepción de tamaño registrada** |
| UT-9a | Panel: invitados, estado "Vencida" y enlace `wa.me` | ~200 | Dentro (división aprobada de la entrega 9) |
| UT-9b | Panel: lista de pagos a reembolsar con motivo, botón por pago y formulario de `depositPercent` | ~240 | Dentro (división aprobada de la entrega 9) |

Decisiones del usuario sobre las entregas que pasaban 400 líneas:

- Entrega 5 partida en UT-5a y UT-5b, y entrega 9 partida en UT-9a y UT-9b, tal como se describe en la tabla.
- **UT-8 sigue entera con excepción de tamaño (`size-exception`).** Motivo: una sola pantalla cohesiva, sin lógica de dinero.
- Estrategia efectiva: `ask-on-risk` con excepción solo para UT-8. No queda decisión pendiente antes de apply.
- Vigilancia: UT-3 (~410) y UT-1, UT-4 y UT-7 (~400) están en el borde de una estimación aproximada y **no** tienen excepción. Si durante apply una de ellas supera claramente 400, se detiene y se consulta antes de continuar.

### Suggested Work Units

| Unidad | Objetivo | Entrega (lote de commits) | Comando de prueba focalizado | Arnés de ejecución | Límite de reversa |
|---|---|---|---|---|---|
| UT-0 | Línea base y verificaciones de entorno | Sin commit de código | `cd backend && npm test` | Base descartable y sandbox de Mercado Pago | N/A (solo verificación) |
| UT-1 | Esquema, migraciones, `EXPIRED`, barrido | 1 | `npm test -- vencimiento barridoVencidas migracionReservaInvitado` | Migraciones A y B en base descartable (`DATABASE_URL_PRUEBA`) | Revertir el lote y aplicar el SQL de reversa de la decisión 1 |
| UT-2 | Filtros de lectura y recaudación | 2 | `npm test -- filtrosReserva metricasAdmin disponibilidad` | `GET` de disponibilidad con una `PENDING` vencida no barrida | Revertir `filtrosReserva.ts` y sus usos |
| UT-3 | Adaptador, cancelación, preferencia vigente | 3 | `npm test -- cancelacionReserva preferenciaPago linkDePago` | Sandbox de MP: preferencia expirada no se paga | Revertir adaptador y `cancelacionReserva.ts` |
| UT-4 | Creación de reserva de invitado | 4 | `npm test -- reservaInvitadoCrear limitadorPublico` | `curl` a `POST /api/v1/public/bookings` con MP sandbox | Quitar `modules/public` y la ruta en `app.ts` |
| UT-5a | Webhook: registro idempotente y confirmación | 5a | `npm test -- webhookPago` | Pago de prueba en sandbox contra el webhook local | Revertir `payment.service.ts` y `webhookPago.test.ts` |
| UT-5b | Webhook: motivos de reembolso y `COMPLETED` | 5b | `npm test -- webhookPago` | Pago duplicado y pago tras cancelar en sandbox | Revertir solo las ramas 4, 5, 8, 10 y `SLOT_TAKEN` |
| UT-6 | Rutas por token y reintento | 6 | `npm test -- estadoSena rutasPublicasToken` | `GET`, `PATCH cancel` y `POST payment` con un token real | Quitar las tres rutas por token |
| UT-7 | Vistas de admin, `depositPercent`, reembolso | 7 | `npm test -- reembolsoPago depositPercent rutasAdminReservas` | Reembolso real en sandbox de un pago de prueba | Quitar la ruta de reembolso y `depositPercent` |
| UT-8 | Frontend público | 8 | `cd frontend && npx tsc --noEmit && npm run lint` | Flujo manual (chrome-devtools) con MP sandbox | Revertir `ReservaInvitadoPage.tsx`, ruta y formulario |
| UT-9a | Panel: invitados, "Vencida" y `wa.me` | 9a | `cd frontend && npx tsc --noEmit && npm run lint` | Verificación manual del panel | Revertir `whatsapp.ts` y los cambios del panel |
| UT-9b | Panel: pagos y `depositPercent` | 9b | `cd frontend && npx tsc --noEmit && npm run lint` | Verificación manual del reembolso | Revertir la lista de pagos y el control de seña |

## Convenciones de ejecución

- TDD estricto en el backend. Corredor: `cd backend && npm test` (Vitest). Tipos: `cd backend && npx tsc --noEmit`. Compilación: `cd backend && npm run build`.
- Cada tarea de backend va en orden RED (prueba que falla, con el fallo observado), GREEN y REFACTOR. Si no se observó el RED, no se declara.
- Pruebas HTTP con supertest contra `app`, con `prisma` simulado (`vi.hoisted` + `vi.mock("../src/core/config/prisma.js")`, import dinámico de `app` después del mock) y Mercado Pago simulado por el adaptador. Referencia: `backend/tests/validacionReservas.test.ts`. Consultar los skills `testing-backend`, `prisma-migraciones` y `dominio-reservas`.
- Las pruebas que tocan la base usan `describe.skipIf(!process.env.DATABASE_URL_PRUEBA)` y **nunca** la base de desarrollo (`npm test` borra reservas).
- Frontend sin pruebas automatizadas hasta `calidad-ci`: cada tarea verifica con `cd frontend && npx tsc --noEmit`, el linter y una comprobación manual (chrome-devtools, con el sandbox de Mercado Pago).
- Sin `any`; fechas en UTC con `toISOString()`; todo en español. Nunca leer ni modificar `.env`.
- Cada unidad de trabajo es un lote de commits granulares en `desarrollo`, hecho a mano por el usuario (commits convencionales en español, sin atribución a IA). No se commitea desde apply sin su orden.
- Las rutas con `(read-only)` son solo de lectura.

## Fallas ambientales conocidas

`npm test` tiene 6 fallas que requieren PostgreSQL (Docker Desktop apagado) y 18 pruebas omitidas: 5 de `rutasAdminReservas.test.ts`, 1 de `secretosJwt.test.ts` ("acepta un token emitido por la aplicación") y la suite `integration.test.ts`. Son aceptables; cualquier otra falla es nueva y bloquea. T-0.1 fija los nombres exactos como línea base.

## Orden y dependencias

```
UT-0 (línea base + verificaciones de entorno, paralelizable con UT-1 salvo T-0.2/T-0.3)
UT-1 ─► UT-2 ─► UT-3 ─► UT-4 ─► UT-5a ─► UT-5b ─► UT-6 ─► UT-7 ─► UT-8 ─► UT-9a ─► UT-9b
UT-10 (documentación): T-10.1 y T-10.2 pueden ir en cualquier momento; T-10.3 al terminar UT-4.
UT-11 (verificación final): al terminar todo.
```

- UT-1 es la base de todo: esquema, `EXPIRED` y vencimiento.
- T-0.2 (migraciones en base descartable) debe estar resuelto antes de dar por buena la UT-1; T-0.3 (sandbox MP) antes de UT-3 y UT-5b.
- UT-3 define el adaptador y `cancelacionReserva`, que usan UT-4, UT-5 y UT-6.
- UT-5a y UT-5b comparten `payment.service.ts` y `webhookPago.test.ts`: van en secuencia.
- UT-8 y UT-9 dependen de los contratos de API de UT-4, UT-6 y UT-7.

---

## UT-0: Línea base y verificaciones de entorno abiertas

Sin commit de código. Resuelve las preguntas abiertas del diseño.

- [x] **T-0.1 Línea base de pruebas.**
  - Archivos: ninguno.
  - Criterios: `cd backend && npm test`, `npx tsc --noEmit` y `npm run build` ejecutados; se registran los nombres exactos de las 6 fallas ambientales y los totales (112 pasan, 18 omitidas, 6 fallan al 2026-11-18).
  - Checks: los tres comandos.
- [x] **T-0.2 Verificar en base descartable el plan de dos migraciones y las restricciones manuales** (pregunta abierta 1 del diseño).
  - Archivos: ninguno hasta tener resultado; el resultado se anota en `openspec/changes/reserva-invitado/verify-notes.md` (crear) y, si cambia el plan, se ajusta `design.md`.
  - Pasos, en una base PostgreSQL **descartable** (`DATABASE_URL_PRUEBA`):
    1. Confirmar que `ALTER TYPE ... ADD VALUE 'EXPIRED'` y una restricción con el literal `'EXPIRED'` en la misma transacción falla ("unsafe use of new value"), lo que justifica dos migraciones.
    2. Confirmar que `'OWNER_DISCRETION'` en el `CHECK` de la migración A es válido porque `RefundReason` se crea en la misma migración.
    3. Tras aplicar A y B, correr `npx prisma migrate dev` y comprobar que no propone borrar `bookings_sin_solapamiento`, `bookings_horario_valido`, `booking_payments_un_pago_valido` ni `booking_payments_motivo_coherente`.
  - Criterios: las tres comprobaciones registradas con el resultado observado. Si alguna falla, se detiene el apply y se vuelve a diseño.
  - Checks: salida de los comandos de Prisma y `psql` registrada.
- [ ] **T-0.3 Verificar en el sandbox de Mercado Pago** (pregunta abierta 2 del diseño). _Bloqueada: faltan credenciales de prueba de Mercado Pago._
  - Archivos: `openspec/changes/reserva-invitado/verify-notes.md`.
  - Comprobaciones, cada una con el resultado observado:
    1. Una preferencia expirada con `Preference.update` (`expires: true`, `expiration_date_to` en el pasado) **impide pagar** desde su `init_point`.
    2. El sufijo `Z` se acepta en `expiration_date_from` y `expiration_date_to`.
    3. Reenviar los `items` leídos con `Preference.get` no altera la preferencia.
    4. `PaymentRefund.create` **sin** `amount` reembolsa el pago completo.
    5. Comportamiento de la clave de idempotencia ante un fallo: si la respuesta fallida queda guardada, la clave necesita un componente por intento (se ajustaría `reembolsarPago` en UT-7).
  - Criterios: las cinco comprobaciones registradas. Cualquier resultado distinto del supuesto abre una tarea de ajuste en la UT afectada (UT-3 o UT-7) antes de implementarla.

---

## UT-1: Esquema, migraciones, `EXPIRED`, vencimiento y barrido (entrega 1)

Cortes aplicados (el cambio real pasó de 400 líneas; decisión del usuario: partir en commits coherentes): UT-1a `8202f04` (esquema, migraciones A y B, prueba de base descartable; 406+25) y UT-1b `7621aad` (vencimiento, barrido, transiciones de `EXPIRED`; 380+2).

Requisitos: RES-009, RES-014, RES-026, RES-027, RES-033, RES-035. Commit sugerido: `feat(reservas): agregar el estado EXPIRED, BookingPayment y el barrido de vencidas`

- [x] **T-1.1 Modificar `backend/prisma/schema.prisma`.**
  - Criterios (decisiones 2 y 11): `EXPIRED` en `BookingStatus`; enum `RefundReason`; modelo `BookingPayment`; campos de `Booking` (`userId` opcional, datos de invitado, `expiresAt`, `depositAmount`, `accessTokenHash @unique`, `mpPreferenceId`, `depositPaidAtCancel`, `payments`); `Complex.depositPercent Int @default(30)`; índices `@@index([status, expiresAt])` y `@@index([guestPhone, status])`; comentarios sobre las restricciones manuales. Sin `mpPaymentId`, `mpPaidAmount` ni `refundedAt` en `Booking`.
  - Checks: `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit` (los errores de tipos por `userId` opcional se resuelven en T-1.7).
- [x] **T-1.2 Crear la migración A `20261119120000_reserva_invitado`.**
  - Archivos: `backend/prisma/migrations/20261119120000_reserva_invitado/migration.sql`.
  - Criterios (decisión 1): generada con `npx prisma migrate dev --create-only --name reserva_invitado` y revisada a mano; contiene `ADD VALUE 'EXPIRED'`, columnas, `RefundReason`, `booking_payments` con clave foránea e índices, y al final `bookings_titular_valido`, `complexes_porcentaje_sena_valido`, `booking_payments_motivo_coherente` y `booking_payments_un_pago_valido`. **No** usa el literal `'EXPIRED'`. Se rechaza cualquier `DROP` propuesto por Prisma de las restricciones manuales.
  - Checks: aplicar en la base descartable (resultado de T-0.2).
- [x] **T-1.3 Crear la migración B `20261119120100_sin_solapamiento_excluye_vencidas`.**
  - Archivos: `backend/prisma/migrations/20261119120100_sin_solapamiento_excluye_vencidas/migration.sql`.
  - Criterios (decisión 1): `DROP` y `ADD CONSTRAINT "bookings_sin_solapamiento"` en **una sola sentencia** con `WHERE ("status" NOT IN ('CANCELLED', 'EXPIRED'))`; creada con `--create-only`.
  - Checks: aplicar A y B en la base descartable.
- [x] **T-1.4 RED: pruebas de base descartable.**
  - Archivos: `backend/tests/migracionReservaInvitado.test.ts` (crear, con `describe.skipIf(!process.env.DATABASE_URL_PRUEBA)`).
  - Pruebas: una `EXPIRED` no ocupa el turno y una nueva reserva en ese horario se acepta (RES-009); una `PENDING` sí lo ocupa; `bookings_titular_valido` rechaza `userId` y `guestPhone` ambos presentes o ambos nulos (RES-033); `booking_payments_motivo_coherente` acepta el ciclo válido → `OWNER_DISCRETION` → reembolsado y rechaza un pago no válido sin motivo o con `OWNER_DISCRETION`; `booking_payments_un_pago_valido` rechaza un segundo pago válido sin reembolso y acepta uno nuevo tras un reembolso; `mpPaymentId` único; `complexes_porcentaje_sena_valido` rechaza 0 y 101.
  - RED esperado: sin migraciones aplicadas o sin las restricciones, las pruebas fallan. Registrar el fallo.
  - Checks: `npm test -- migracionReservaInvitado` con `DATABASE_URL_PRUEBA` apuntando a la base descartable.
- [x] **T-1.5 RED: pruebas del barrido y del vencimiento.**
  - Archivos: `backend/tests/vencimiento.test.ts` y `backend/tests/barridoVencidas.test.ts` (crear).
  - Pruebas: `liberarReservasVencidas` llama a `booking.updateMany` con `where { courtId, status: PENDING, expiresAt: { lte } }` y `data { status: EXPIRED }` (RES-026); el barrido toma el bloqueo de cada cancha con vencidas, un error en una cancha se registra y no corta las demás, no hay pasadas superpuestas y el temporizador usa `unref()` (RES-027, con `vi.useFakeTimers`); `iniciarBarridoDeVencidas` captura errores por pasada.
  - RED esperado: los módulos no existen.
  - Checks: `npm test -- vencimiento barridoVencidas`.
- [x] **T-1.6 GREEN: vencimiento y barrido.**
  - Archivos: `backend/src/modules/bookings/vencimiento.ts` (crear), `backend/src/modules/bookings/barridoVencidas.ts` (crear), `backend/src/server.ts` (modificar: llamar a `iniciarBarridoDeVencidas()` después de `listen`, nunca desde `app.ts`).
  - Criterios (decisión 3): `liberarReservasVencidas(tx, courtId)`, `ejecutarBarridoDeVencidas()` con `distinct: ["courtId"]` y `conBloqueoDeCancha`, `iniciarBarridoDeVencidas(intervaloMs = 60_000)`.
  - Checks: `npm test -- vencimiento barridoVencidas` en verde.
- [x] **T-1.7 RED y GREEN: `EXPIRED` en las transiciones y ajuste de tipos (RES-014, RES-035).**
  - Archivos: `backend/tests/validacionReservas.test.ts` (modificar), `backend/src/modules/bookings/booking.service.ts` (modificar), `backend/src/modules/bookings/booking.dto.ts` (sin cambios de código).
  - Pruebas RED: `PATCH` de estado con `EXPIRED` responde 400 (`actualizarEstadoSchema` ya lo rechaza; la prueba lo fija); `puedeTransicionar` no permite salir de `EXPIRED` ni entrar a ella por la API; `CANCELLED` y `EXPIRED` son terminales. `puedeTransicionar` y `validarTurnoReservable` se exportan.
  - GREEN: `EXPIRED` en la tabla de transiciones; ajustar los tipos donde `userId` pasa a ser `string | null` (por ejemplo `cancelBooking`) sin usar `any`.
  - Checks: `npm test -- validacionReservas`, `npx tsc --noEmit`.
- [x] **T-1.8 REFACTOR y verificación de la UT-1.**
  - Criterios: limpiar con las pruebas en verde; suite completa sin fallas nuevas respecto de T-0.1; probar la **reversa** de la decisión 1 en la base descartable (exportar `booking_payments`, pasar `EXPIRED` a `CANCELLED`, recrear la restricción, eliminar tablas, enum, `CHECK` y columnas, devolver `user_id` a `NOT NULL`).
  - Checks: `npm test`, `npx tsc --noEmit`, `npm run build`.

## UT-2: Filtros de lectura y recaudación con pagos (entrega 2)

Commit `8995431` (296+6, sin partir). Las pruebas de agenda (RES-013) quedaron en `disponibilidad.test.ts` con `prisma` simulado, y no en `rutasAdminReservas.test.ts`, que corre contra la base real.

Requisitos: RES-007 (lectura), RES-012, RES-013 (filtro), CAN-006, ADM-004, ADM-005. Commit sugerido: `feat(reservas): leer con filtros compartidos que ignoran las vencidas`

- [x] **T-2.1 RED: pruebas de los filtros y de la lectura.**
  - Archivos: `backend/tests/filtrosReserva.test.ts` (crear), `backend/tests/disponibilidad.test.ts` (crear), `backend/tests/rutasAdminReservas.test.ts` (modificar).
  - Pruebas: `filtroOcupaTurno(ahora)` y `filtroNoVencida(ahora)` arman el `OR` con tres ramas y excluyen `CANCELLED`/`EXPIRED` o `EXPIRED` (incluida una `PENDING` con `expiresAt` nulo, que no se excluye); la disponibilidad (RES-012, CAN-006) libera un turno de `PENDING` vencida no barrida y de `EXPIRED`; la agenda (RES-013) no muestra vencidas como ocupadas.
  - RED esperado: los filtros no existen y las consultas actuales no los usan.
  - Checks: `npm test -- filtrosReserva disponibilidad`.
- [x] **T-2.2 GREEN: filtros compartidos y su uso.**
  - Archivos: `backend/src/modules/bookings/filtrosReserva.ts` (crear), `backend/src/modules/bookings/booking.service.ts` (modificar), `backend/src/modules/courts/court.service.ts` (modificar).
  - Criterios (decisión 4): `filtroOcupaTurno` en disponibilidad, agenda y verificación de turno libre.
  - Checks: pruebas de T-2.1 en verde, `npx tsc --noEmit`.
- [x] **T-2.3 RED: recaudación y métricas con pagos (ADM-004, ADM-005, decisión 12).**
  - Archivos: `backend/tests/metricasAdmin.test.ts` (modificar).
  - Pruebas: una reserva de invitado `CONFIRMED` aporta el `amount` de su pago válido no reembolsado; una confirmada a mano sin pago aporta 0; una con cuenta aporta `totalPrice`; las `EXPIRED` y las `PENDING` vencidas no cuentan (`filtroNoVencida`); la forma JSON no cambia; la consulta incluye `payments: { where: { isValid: true, refundedAt: null }, select: { amount: true } }`.
  - RED esperado: la recaudación suma `totalPrice` de todas.
  - Checks: `npm test -- metricasAdmin`.
- [x] **T-2.4 GREEN y REFACTOR: métricas.**
  - Archivos: `backend/src/modules/admin/admin.service.ts` (modificar).
  - Criterios: suma con `Prisma.Decimal` según la decisión 12.
  - Checks: `npm test`, `npx tsc --noEmit`.

## UT-3: Adaptador de Mercado Pago, PAG-004, cancelación y preferencia vigente (entrega 3)

Requisitos: PAG-004, PAG-005, PAG-006, PAG-025, RES-011, RES-015. Commit sugerido: `feat(pagos): adaptador de Mercado Pago, cancelación bajo bloqueo y preferencia vigente`

Depende de T-0.3 (sandbox). **Decisión del usuario:** se implementó sin esperar las comprobaciones 4 y 5 de T-0.3. `reembolsarPago` usa `PaymentRefund.create` sin `body.amount` y con una `idempotencyKey` simple (`reembolso-<id>`, decisión 5); queda condicionado a la comprobación 5 y se ajusta en UT-7 si el sandbox muestra otra cosa.

Hecho en 5 commits (el cambio real superó las 400 líneas, con cortes limpios): `9d7acdf` (adaptador), `db39e18` (servicio de pagos usa el adaptador), `567f390` (cancelación compartida y link de pago), `4299868` (cancelación y cambio de estado bajo el bloqueo) y el de PAG-004 y preferencia vigente.

Desviaciones:

- **`expiration_date_from` no se envía** (decisión del usuario): el reloj de la PC está adelantado respecto de Mercado Pago y la preferencia quedaría "disponible desde" el futuro. `crearPreferencia` envía solo `expires` y `expiration_date_to`, y solo con `venceEn`. Esto reemplaza el texto de T-3.1 y de la decisión 5.
- Las pruebas de RES-011 y RES-015 bajo el bloqueo están en `backend/tests/cancelacionBajoBloqueo.test.ts` (base simulada), y no en `rutasAdminReservas.test.ts`, que corre contra la base real y está guardado en una codificación que no es UTF-8.
- `reemplazarPreferenciaVigente` devuelve `Promise<void>` y lanza el 409 con 0 filas (el diseño decía `Promise<boolean>`, pero con 0 filas siempre lanza).
- `validacionReservas.test.ts` extendió su transacción simulada (`updateMany`, `findUniqueOrThrow`, `bookingPayment`) porque cancelar y cambiar estado ahora corren bajo el bloqueo.

- [x] **T-3.1 RED: pruebas del adaptador.**
  - Archivos: `backend/tests/adaptadorMercadoPago.test.ts` (crear).
  - Pruebas: `crearPreferencia` envía `expires`, `expiration_date_from` y `expiration_date_to` solo con `venceEn`; `expirarPreferencia` hace `Preference.get` y `Preference.update` reenviando los `items`; `obtenerPago` usa `Payment.get`; `reembolsarPago` llama `PaymentRefund.create` sin `body.amount` y con `requestOptions.idempotencyKey`; sin credenciales responde 503 (PAG-007).
  - RED esperado: el módulo no existe.
  - Checks: `npm test -- adaptadorMercadoPago`.
- [x] **T-3.2 GREEN: adaptador.**
  - Archivos: `backend/src/core/integraciones/mercadoPago.ts` (crear), `backend/src/modules/payments/payment.service.ts` (modificar para usar el adaptador).
  - Criterios (decisión 5). Si T-0.3 mostró que la clave de idempotencia necesita un componente por intento, se refleja aquí.
  - Checks: pruebas de T-3.1 en verde, `npx tsc --noEmit`, `webhookPago` y `preferenciaPago` siguen pasando.
- [x] **T-3.3 RED: cancelación compartida y `linkDePago`.**
  - Archivos: `backend/tests/cancelacionReserva.test.ts` y `backend/tests/linkDePago.test.ts` (crear).
  - Pruebas: `cancelarEnTransaccion` marca `OWNER_DISCRETION` en los pagos válidos sin reembolso, guarda `depositPaidAtCancel` verdadero solo si había alguno y pone `CANCELLED`; `invalidarLinkDePago(null)` no hace nada y un error del adaptador se registra sin propagarse; `reemplazarPreferenciaVigente` con 1 fila invalida la preferencia anterior y con 0 filas invalida la nueva y responde 409, con el mensaje "La reserva cambió mientras se generaba el pago. Intenta de nuevo." si la reserva sigue pagable (PAG-025).
  - RED esperado: módulos inexistentes.
  - Checks: `npm test -- cancelacionReserva linkDePago`.
- [x] **T-3.4 GREEN: cancelación y link de pago.**
  - Archivos: `backend/src/modules/bookings/cancelacionReserva.ts` (crear), `backend/src/modules/bookings/linkDePago.ts` (crear).
  - Criterios (decisión 6).
  - Checks: pruebas de T-3.3 en verde.
- [x] **T-3.5 RED: RES-011 y RES-015 bajo el bloqueo, PAG-004.**
  - Archivos: `backend/tests/rutasAdminReservas.test.ts` (modificar), `backend/tests/preferenciaPago.test.ts` (modificar).
  - Pruebas: la cancelación de una reserva `PENDING` vencida responde 409 (ya es `EXPIRED` al validar); `cancelBooking` y `updateBookingStatus` con `CANCELLED` ejecutan `liberarReservasVencidas` como primera operación del bloqueo y llaman `invalidarLinkDePago` **después** del commit; una cancelación no se revierte si falla Mercado Pago; PAG-004: crear la preferencia de una reserva `CANCELLED` responde 409 "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva.", y otros estados no pagables, "Esta reserva no se puede pagar."; las reservas con cuenta guardan `mpPreferenceId` con `reemplazarPreferenciaVigente` (PAG-025).
  - RED esperado: las rutas actuales no usan el bloqueo ni la preferencia vigente.
  - Checks: `npm test -- rutasAdminReservas preferenciaPago`.
- [x] **T-3.6 GREEN y REFACTOR.**
  - Archivos: `backend/src/modules/bookings/booking.service.ts`, `backend/src/modules/payments/payment.service.ts` (modificar).
  - Criterios: cancelación y cambio de estado bajo `conBloqueoDeCancha`; PAG-004 y PAG-025 en `payment.service.ts`.
  - Checks: `npm test` (sin fallas nuevas respecto de T-0.1), `npx tsc --noEmit`.

## UT-4: `POST /public/bookings` (entrega 4)

Requisitos: RES-006, RES-023 a RES-025, RES-030 a RES-032, PAG-020, PAG-022. Commit sugerido: `feat(reservas): crear reservas de invitado con seña por Mercado Pago`

- [x] **T-4.1 RED: utilidades puras.**
  - Archivos: `backend/tests/tokenAcceso.test.ts`, `backend/tests/sena.test.ts`, `backend/tests/trustProxy.test.ts` (crear).
  - Pruebas: `generarToken` devuelve 43 caracteres base64url y `hashearToken` el SHA-256 hexadecimal (64); `TOKEN_VALIDO` rechaza longitudes y caracteres inválidos; seña de 300.00 al 30 % = 90.00, de 3.32 (casos de redondeo `ROUND_HALF_UP`) y al 100 % (PAG-022); normalización de teléfono (quita espacios, guiones, paréntesis y `+`; 8 a 15 dígitos); `leerTrustProxy` devuelve `false` sin valor, el número indicado y nunca `true`.
  - Checks: `npm test -- tokenAcceso sena trustProxy` (RED por módulos inexistentes).
- [x] **T-4.2 GREEN: utilidades y DTO.**
  - Archivos: `backend/src/modules/public/tokenAcceso.ts` (crear), `backend/src/modules/public/public.dto.ts` (crear), `backend/src/core/validacion/esquemas.ts` (modificar: recibir `fechaHoraSchema` movido desde `booking.dto.ts`), `backend/src/modules/bookings/booking.dto.ts` (modificar: importar `fechaHoraSchema`).
  - Criterios (decisión 10 y contratos): `guestFirstName`/`guestLastName` con `trim` de 1 a 100; `guestEmail` opcional; cálculo de seña con `Prisma.Decimal`.
  - Checks: pruebas de T-4.1 en verde.
- [x] **T-4.3 RED: limitadores y tope por teléfono (RES-030, RES-031).**
  - Archivos: `backend/tests/limitadorPublico.test.ts` (crear).
  - Pruebas: con `vi.stubEnv` antes de `await import("../src/app.js")`, la solicitud número 11 a `POST /public/bookings` responde 429 (cuenta todas las solicitudes, no solo las exitosas); `limitadorConsultaPublica` aplica su propio máximo; `bloquearTelefono` toma `pg_advisory_xact_lock(2, hashtext(telefono))` después del bloqueo de cancha; con 2 `PENDING` vigentes del teléfono responde 429 con el mensaje del diseño (una vencida no cuenta).
  - Checks: `npm test -- limitadorPublico`.
- [x] **T-4.4 GREEN: limitadores y `trust proxy`.**
  - Archivos: `backend/src/core/middlewares/limitadorPublico.ts` (crear), `backend/src/modules/bookings/bloqueoCancha.ts` (modificar: `bloquearTelefono`), `backend/src/app.ts` (modificar: `trust proxy` y montaje de `/api/v1/public`).
  - Criterios (decisión 9): variables `LIMITE_CREACION_PUBLICA_MAXIMO`, `LIMITE_CREACION_PUBLICA_VENTANA_MS`, `LIMITE_CONSULTA_PUBLICA_MAXIMO`, `TOPE_PENDIENTES_POR_TELEFONO`, con valores por defecto.
  - Checks: pruebas de T-4.3 en verde.
- [x] **T-4.5 RED: creación de la reserva de invitado.**
  - Archivos: `backend/tests/reservaInvitadoCrear.test.ts` (crear).
  - Pruebas: 201 con `{ token, initPoint }` y reserva `PENDING` con `expiresAt`, `depositAmount` y `accessTokenHash` (el token en claro no se persiste); 400 ante datos inválidos (RES-023, RES-024); 409 ante solapamiento (RES-025/RES-007); 400 si el turno no es reservable; 503 sin credenciales de Mercado Pago **antes** de escribir (PAG-007); si `crearPreferencia` falla, la reserva pasa a `CANCELLED` bajo el bloqueo y se responde 5xx sin token (PAG-020); `venceEn` es `expiresAt`; `back_urls` apuntan a `/reserva/<token>`; la primera operación del bloqueo es `liberarReservasVencidas` (RES-026); RES-032 y RES-006 según la delta spec.
  - RED esperado: ruta inexistente (404).
  - Checks: `npm test -- reservaInvitadoCrear`.
- [x] **T-4.6 GREEN y REFACTOR.**
  - Archivos: `backend/src/modules/public/reservaInvitado.service.ts`, `public.controller.ts`, `public.routes.ts` (crear).
  - Criterios (decisiones 8 y 9, flujo de creación): controlador solo HTTP y Zod; servicio con Prisma y reglas.
  - Checks: `npm test` (sin fallas nuevas), `npx tsc --noEmit`, `npm run build`.
- [x] **T-4.7 Verificación en base descartable de la concurrencia de RES-007 y RES-031.**
  - Archivos: `backend/tests/migracionReservaInvitado.test.ts` (modificar, con `skipIf`).
  - Pruebas: dos solicitudes simultáneas por el mismo turno dejan una sola reserva activa; dos solicitudes simultáneas del mismo teléfono no superan el tope.
  - Checks: `npm test -- migracionReservaInvitado` con `DATABASE_URL_PRUEBA`.

## UT-5a: Webhook, registro idempotente y ramas de confirmación (entrega 5, primera parte)

Requisitos: PAG-012, PAG-013, PAG-014, PAG-016 (ramas 1, 2, 3, 6, 7 y la rama 9 con turno libre de la decisión 7). Commit sugerido: `feat(pagos): registrar pagos aprobados en BookingPayment y confirmar reservas`

- [x] **T-5a.1 RED: reescribir `backend/tests/webhookPago.test.ts` para las ramas de confirmación.**
  - Archivos: `backend/tests/webhookPago.test.ts` (modificar). Transacción simulada con `booking` y `bookingPayment` (`findUnique`, `findFirst`, `create`, `updateMany`, `count`).
  - Pruebas: rama 1, `mpPaymentId` ya existente: no escribe nada (PAG-013, idempotencia); rama 2, reserva inexistente: advertencia y sin fila; rama 3, monto ausente: se relee con `obtenerPago` una vez y, si sigue sin monto, advertencia y sin fila; rama 6, `PENDING` vigente o vencida no barrida: fila `isValid: true`, reserva `CONFIRMED` con `MERCADOPAGO` mediante `updateMany` condicional al estado leído, sin `liberarReservasVencidas` previo; rama 7, `CONFIRMED` (por ejemplo `CASH`) sin pago válido: fila `isValid: true` y `paymentMethod` `MERCADOPAGO`; rama 9 con turno libre (`EXPIRED`): `liberarReservasVencidas`, conteo de solapadas con `filtroOcupaTurno` igual a 0, fila `isValid: true` y reserva `CONFIRMED` con `MERCADOPAGO`; un pago distinto de `approved` no escribe (PAG-016); toda advertencia incluye reserva y pago con "requiere revisión manual".
  - RED esperado: el webhook actual no escribe `BookingPayment`.
  - Checks: `npm test -- webhookPago`.
- [x] **T-5a.2 GREEN y REFACTOR: `registrarPagoAprobado` (ramas 1, 2, 3, 6, 7 y 9 con turno libre).**
  - Archivos: `backend/src/modules/payments/payment.service.ts` (modificar).
  - Criterios (decisión 7): lectura de `courtId` fuera del bloqueo; relectura de reserva y pago válido dentro de `conBloqueoDeCancha`; la firma, el filtro de eventos y la validación de `external_reference` se conservan.
  - Checks: `npm test -- webhookPago` en verde para estas ramas, `npx tsc --noEmit`.

## UT-5b: Webhook, motivos de reembolso, `COMPLETED` y reescritura de pruebas (entrega 5, segunda parte)

Requisitos: PAG-012 a PAG-016 (ramas 4, 5, 8, 10 y la rama 9 con turno ocupado). Commit sugerido: `feat(pagos): clasificar pagos con motivo de reembolso en el webhook`

- [x] **T-5b.1 RED: reescribir `backend/tests/webhookPago.test.ts` para las ramas de reembolso.**
  - Archivos: `backend/tests/webhookPago.test.ts` (modificar).
  - Pruebas: rama 4, monto distinto de `depositAmount ?? totalPrice` (con `Prisma.Decimal`) en **cada** estado, incluido `COMPLETED` y con un pago válido existente: fila `isValid: false` con `AMOUNT_MISMATCH` y la `PENDING` sigue `PENDING`; rama 5, ya hay un pago válido sin reembolso: `DUPLICATE_PAYMENT`, y un pago válido ya reembolsado no bloquea uno nuevo; rama 8, `CANCELLED`: `PAID_AFTER_CANCEL` sin reactivar; rama 9 con turno ocupado (`EXPIRED`): `SLOT_TAKEN` sin cambio de estado; rama 10, `COMPLETED` sin pago válido vigente: fila `isValid: true` sin motivo y sin cambio de estado (con las reglas 4 y 5 también en `COMPLETED`); respaldo: si la restricción reporta solapamiento (`ConflictError`, transacción revertida), una segunda transacción bajo el mismo bloqueo inserta la fila `SLOT_TAKEN`; el orden de evaluación respeta la tabla de la decisión 7.
  - **Reescribir las líneas 179 a 190** de `webhookPago.test.ts`: la prueba actual que espera que `CANCELLED` se reactive pasa a esperar que la reserva siga `CANCELLED` con una fila `PAID_AFTER_CANCEL` y sin `updateMany` de estado (PAG-012).
  - RED esperado: el código de UT-5a no clasifica estos casos.
  - Checks: `npm test -- webhookPago`.
- [x] **T-5b.2 GREEN y REFACTOR: ramas 4, 5, 8, 10 y rama 9 con turno ocupado.**
  - Archivos: `backend/src/modules/payments/payment.service.ts` (modificar).
  - Criterios (decisión 7): `liberarReservasVencidas` y conteo de solapadas con `filtroOcupaTurno` solo en la rama 9; el motivo se persiste al clasificar.
  - Checks: `npm test -- webhookPago` completo en verde, `npm test`, `npx tsc --noEmit`.
- [x] **T-5b.3 Verificación en base descartable: webhook contra cancelación.**
  - Archivos: `backend/tests/migracionReservaInvitado.test.ts` (modificar, con `skipIf`).
  - Pruebas: un pago aprobado y una cancelación simultáneos no dejan la reserva reactivada ni sin fila de pago.
  - Checks: `npm test -- migracionReservaInvitado` con `DATABASE_URL_PRUEBA`.

## UT-6: Rutas por token, `estadoSena.ts`, reintento y limitador de consulta (entrega 6)

Requisitos: RES-028, RES-029, PAG-021, PAG-023. Commit sugerido: `feat(reservas): consultar, cancelar y reintentar el pago por token`

- [ ] **T-6.1 RED: `estadoSena.ts`.**
  - Archivos: `backend/tests/estadoSena.test.ts` (crear).
  - Pruebas: `estadoEfectivo` informa `EXPIRED` para una `PENDING` con `expiresAt <= ahora`; `pagoValidoVigente`; `derivarEstadoSena` (nulo sin `depositAmount`; `PAID`; `REFUNDED`; `PENDING` con un pago `AMOUNT_MISMATCH`); `derivarReembolsoPendiente` (`REQUIRED`, `AT_DISCRETION`, `null`, mezclas de motivos); `devolucionACriterioDelCanchero` (RES-028).
  - Checks: `npm test -- estadoSena`.
- [ ] **T-6.2 GREEN: `estadoSena.ts`.**
  - Archivos: `backend/src/modules/bookings/estadoSena.ts` (crear).
  - Criterios: contratos de la sección "Interfaces y contratos" del diseño.
  - Checks: pruebas de T-6.1 en verde.
- [ ] **T-6.3 RED: rutas por token.**
  - Archivos: `backend/tests/rutasPublicasToken.test.ts` (crear).
  - Pruebas: `GET /public/bookings/:token` devuelve la vista pública en lista blanca (sin pagos ni `courtId` internos; `status` efectivo; `refundAtOwnerDiscretion`); token con formato inválido o inexistente: 404 idéntico "Reserva no encontrada." sin consultar la base (formato inválido); `PATCH .../cancel`: libera vencidas primero, valida bajo el bloqueo, usa `cancelarEnTransaccion`, invalida el link después del commit y su `refundAtOwnerDiscretion` es el `depositPaidAtCancel` (RES-029); 409 si no es cancelable; `POST .../payment`: 409 si no está `PENDING` vigente o si ya tiene un pago válido, pero **no** si el pago previo es `AMOUNT_MISMATCH`; usa `reemplazarPreferenciaVigente` y devuelve `{ initPoint }` (PAG-021); las tres rutas usan `limitadorConsultaPublica`; PAG-023.
  - RED esperado: rutas inexistentes.
  - Checks: `npm test -- rutasPublicasToken`.
- [ ] **T-6.4 GREEN, REFACTOR y concurrencia.**
  - Archivos: `backend/src/modules/public/reservaInvitado.service.ts`, `public.controller.ts`, `public.routes.ts` (modificar).
  - Criterios (decisiones 6, 8 y 10); concurrencia de RES-029 verificada en `backend/tests/migracionReservaInvitado.test.ts` (modificar, `skipIf`).
  - Checks: `npm test`, `npx tsc --noEmit`, `npm run build`.

## UT-7: Vistas de administrador, `depositPercent` y reembolso por pago (entrega 7)

Requisitos: RES-013 (campos), ADM-008, ADM-015, PAG-024. Commit sugerido: `feat(admin): pagos por reserva, porcentaje de seña y reembolso por pago`

Depende de T-0.3 (idempotencia y reembolso total).

- [ ] **T-7.1 RED: vista de administrador con `payments`.**
  - Archivos: `backend/tests/rutasAdminReservas.test.ts` (modificar).
  - Pruebas: la lista y el detalle de reservas incluyen `payments` (`VistaPagoAdmin` con fechas ISO UTC y `amount` numérico), `depositStatus` y `refundDue` (RES-013, ADM-008); las reservas con cuenta tienen `depositStatus` nulo; sin fuga de campos como `accessTokenHash`.
  - RED esperado: la vista actual no incluye pagos.
  - Checks: `npm test -- rutasAdminReservas`.
- [ ] **T-7.2 GREEN: vistas de administrador.**
  - Archivos: `backend/src/modules/bookings/booking.service.ts` (modificar), `backend/src/modules/admin/admin.service.ts` (modificar si aplica).
  - Criterios: mapeo explícito en lista blanca; `estadoSena.ts` calcula los derivados.
  - Checks: pruebas de T-7.1 en verde.
- [ ] **T-7.3 RED: `depositPercent` (ADM-015).**
  - Archivos: `backend/tests/depositPercent.test.ts` (crear).
  - Pruebas: `GET` y `PATCH /api/v1/admin/complexes/:id/deposit-percent` con `ADMIN` responden 200 `{ id, depositPercent }`; `USER` recibe 403 y sin token 401; el esquema `z.number().int().min(1).max(100)` rechaza 0, 101, 30.5 y texto; id no UUID: 400; complejo inexistente: 404.
  - RED esperado: rutas inexistentes.
  - Checks: `npm test -- depositPercent`.
- [ ] **T-7.4 GREEN: `depositPercent`.**
  - Archivos: `backend/src/modules/admin/admin.dto.ts`, `admin.controller.ts`, `admin.service.ts` y su archivo de rutas bajo `backend/src/modules/admin/` (modificar).
  - Criterios (decisión 8).
  - Checks: pruebas de T-7.3 en verde.
- [ ] **T-7.5 RED: reembolso por pago (PAG-024).**
  - Archivos: `backend/tests/reembolsoPago.test.ts` (crear).
  - Pruebas: `POST /api/v1/payments/admin/payments/:paymentId/refund`: 401 sin token, 403 con `USER`, 400 si `:paymentId` no es UUID, 404 si la fila no existe, 409 si `refundReason` es nulo o `refundedAt` no es nulo (sin llamar a Mercado Pago), 200 con `refundedAt` fijado y la reserva en vista de administrador con sus pagos; 502 "No se pudo procesar el reembolso con Mercado Pago." con `refundedAt` nulo y sin detalle interno; la clave de idempotencia es `reembolso-<bookingPaymentId>` (por pago); `updateMany where { id, refundedAt: null }` evita el doble reembolso; un pago válido sin motivo no es reembolsable.
  - RED esperado: ruta inexistente.
  - Checks: `npm test -- reembolsoPago`.
- [ ] **T-7.6 GREEN y REFACTOR.**
  - Archivos: `backend/src/modules/payments/payment.service.ts`, `payment.controller.ts`, `payments.routes.ts`, `payment.dto.ts` (modificar).
  - Criterios (decisión 11): `PaymentService.reembolsarPago(idPago)`.
  - Checks: `npm test`, `npx tsc --noEmit`, `npm run build`.
- [ ] **T-7.7 Verificación en sandbox del reembolso real.**
  - Archivos: `openspec/changes/reserva-invitado/verify-notes.md` (modificar).
  - Criterios: con un pago de prueba, el reembolso por la ruta devuelve el total y un segundo intento no reembolsa dos veces; registrar el resultado observado.

## UT-8: Frontend público (entrega 8)

Requisitos: RES-020, RES-034. **Excepción de tamaño registrada** (~420 líneas): una sola pantalla cohesiva, sin lógica de dinero. Commit sugerido: `feat(frontend): reserva de invitado y página de seguimiento por token`

Sin pruebas automatizadas. Cada tarea verifica con `cd frontend && npx tsc --noEmit` y el linter (`npm run lint`).

- [ ] **T-8.1 Tipos.**
  - Archivos: `frontend/src/types/index.ts`.
  - Criterios: `EXPIRED` en el estado, `userId: string | null`, datos de invitado, `BookingPayment`, `RefundReason`, vista pública; sin `any`.
  - Checks: `npx tsc --noEmit`.
- [ ] **T-8.2 Formulario de invitado (RES-020).**
  - Archivos: `frontend/src/pages/BookingsPage.tsx`.
  - Criterios: sin sesión, formulario con nombre, apellido, teléfono y correo opcional; `POST /api/v1/public/bookings`; redirección a `initPoint`; manejo de 409, 429 y 503; fechas con métodos UTC; sin `setState` síncrono en el cuerpo de `useEffect`.
  - Checks: `npx tsc --noEmit`, `npm run lint`; comprobación manual con el sandbox.
- [ ] **T-8.3 Página de seguimiento (RES-034) y ruta.**
  - Archivos: `frontend/src/pages/ReservaInvitadoPage.tsx` (crear), `frontend/src/App.tsx` (modificar: ruta `/reserva/:codigo`).
  - Criterios: muestra estado efectivo, horario en UTC, seña, vencimiento y la nota de devolución a criterio del canchero; acciones de cancelar y de reintentar el pago según estado; 404 amable ante un token inexistente.
  - Checks: `npx tsc --noEmit`, `npm run lint`; comprobación manual del retorno desde Mercado Pago (`back_urls`).
- [ ] **T-8.4 Verificación manual del flujo público.**
  - Criterios: flujo completo en el sandbox (crear, pagar, volver, cancelar, reintentar) con chrome-devtools; registrar lo observado.

## UT-9a: Panel, invitados, estado "Vencida" y `wa.me` (entrega 9, primera parte)

Requisitos: RES-022, ADM-016. Commit sugerido: `feat(frontend): mostrar al invitado en el panel y enlace de WhatsApp`

- [ ] **T-9a.1 Utilidad `wa.me` (ADM-016).**
  - Archivos: `frontend/src/utils/whatsapp.ts` (crear).
  - Criterios: arma `https://wa.me/<dígitos>?text=<texto codificado>` con el teléfono normalizado; sin `any`.
  - Checks: `npx tsc --noEmit`, `npm run lint`.
- [ ] **T-9a.2 Presentación del invitado en el panel (RES-022).**
  - Archivos: `frontend/src/pages/AdminDashboard.tsx`.
  - Criterios: nombre, teléfono y correo del invitado en la agenda y en la lista; botón de WhatsApp; estado `EXPIRED` mostrado como "Vencida"; horarios con métodos UTC.
  - Checks: `npx tsc --noEmit`, `npm run lint`; comprobación manual.

## UT-9b: Panel, lista de pagos a reembolsar y formulario de `depositPercent` (entrega 9, segunda parte)

Requisitos: ADM-017, ADM-018. Commit sugerido: `feat(frontend): reembolso por pago y porcentaje de seña en el panel`

- [ ] **T-9b.1 Lista de pagos a reembolsar (ADM-017).**
  - Archivos: `frontend/src/pages/AdminDashboard.tsx`.
  - Criterios: por reserva, lista de pagos con motivo (etiquetas de la tabla del diseño) y un botón por pago que llama a `POST /api/v1/payments/admin/payments/:paymentId/refund`; los pagos ya reembolsados se muestran como tales; manejo del 502.
  - Checks: `npx tsc --noEmit`, `npm run lint`; comprobación manual.
- [ ] **T-9b.2 Control del porcentaje de seña (ADM-018).**
  - Archivos: `frontend/src/pages/AdminDashboard.tsx`.
  - Criterios: lectura y guardado de `depositPercent` (entero de 1 a 100) con el id del complejo de la primera cancha; mensajes de error.
  - Checks: `npx tsc --noEmit`, `npm run lint`; comprobación manual.

## UT-10: Documentación y ajustes de artefactos

Commit sugerido: `docs(reserva-invitado): glosario, skill de dominio, variables de entorno y propuesta`

- [x] **T-10.1 Glosario.**
  - Archivos: `docs/producto/glosario.md`.
  - Criterios: agregar `EXPIRED` y `BookingPayment` (con `RefundReason`).
- [x] **T-10.2 Skill de dominio.**
  - Archivos: `.claude/skills/dominio-reservas/SKILL.md`.
  - Criterios: agregar `EXPIRED` (estado terminal que libera el turno) y `BookingPayment`.
- [x] **T-10.3 Variables de entorno.**
  - Archivos: `docs/operacion/variables-entorno.md`.
  - Criterios: documentar `TRUST_PROXY`, `LIMITE_CREACION_PUBLICA_MAXIMO`, `LIMITE_CREACION_PUBLICA_VENTANA_MS`, `LIMITE_CONSULTA_PUBLICA_MAXIMO` y `TOPE_PENDIENTES_POR_TELEFONO`, con sus valores por defecto; sin valores reales ni lectura de `.env`.
- [x] **T-10.4 Corregir la propuesta.**
  - Archivos: `openspec/changes/reserva-invitado/proposal.md`.
  - Criterios: indicar que `administracion` ya tenía una spec base y que se agrega `canchas` (CAN-006); alinear la decisión D3 con `EXPIRED` según el diseño.
- [ ] **T-10.5 Hoja de ruta.**
  - Archivos: `docs/producto/hoja-de-ruta.md`.
  - Criterios: reflejar el alcance real de `reserva-invitado` en su fila.

---

## Verificación final

- [ ] **T-11.1 Verificación completa.**
  - Comandos (en `backend/`): `npm test` sin fallas nuevas respecto de T-0.1 (las 6 ambientales siguen siendo las únicas) y con las pruebas de base descartable en verde con `DATABASE_URL_PRUEBA`; `npx tsc --noEmit`; `npm run build`. En `frontend/`: `npx tsc --noEmit`, `npm run lint` y `npm run build`.
  - Criterios: los escenarios de las cuatro delta specs cubiertos por pruebas en verde o por verificación manual registrada; `rg -n "\bany\b|as unknown as" backend/src` sin código nuevo afectado; verificaciones de T-0.2, T-0.3 y T-7.7 registradas en `verify-notes.md`.
  - Registrar el resultado observado de cada comando; no declarar lo que no se corrió.

## Tabla de trazabilidad

| Requisito / decisión | Tareas |
|---|---|
| RES-009, RES-033 (restricciones) | T-0.2, T-1.2, T-1.3, T-1.4 |
| RES-014, RES-035 (`EXPIRED`, transiciones) | T-1.7 |
| RES-026, RES-027 (vencimiento y barrido) | T-1.5, T-1.6 |
| RES-007 (lectura), RES-012, RES-013 (filtro), CAN-006 | T-2.1, T-2.2 |
| ADM-004, ADM-005 (decisión 12) | T-2.3, T-2.4 |
| PAG-004, PAG-005, PAG-006, PAG-025 | T-3.1 a T-3.6 |
| RES-011, RES-015 | T-3.5, T-3.6 |
| RES-006, RES-023 a RES-025, RES-030 a RES-032, PAG-020, PAG-022 | T-4.1 a T-4.7 |
| PAG-012 a PAG-016 (decisión 7) | T-5a.1, T-5a.2, T-5b.1 a T-5b.3 |
| RES-028, RES-029, PAG-021, PAG-023 | T-6.1 a T-6.4 |
| RES-013 (campos), ADM-008 | T-7.1, T-7.2 |
| ADM-015 | T-7.3, T-7.4, T-9b.2 |
| PAG-024 | T-7.5, T-7.6, T-7.7 |
| RES-020, RES-034 | T-8.1 a T-8.4 |
| RES-022, ADM-016 | T-9a.1, T-9a.2 |
| ADM-017, ADM-018 | T-9b.1, T-9b.2 |
| Preguntas abiertas del diseño | T-0.2, T-0.3, T-7.7 |
| Documentación y propuesta | T-10.1 a T-10.5 |
