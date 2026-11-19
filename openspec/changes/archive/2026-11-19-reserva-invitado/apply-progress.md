# Progreso de apply: reserva-invitado

Modo: TDD estricto (Vitest, `cd backend && npm test`). Base de pruebas: `reservas_prueba` (puerto 5434); nunca la de desarrollo. Rama `desarrollo`.

## Estado

- UT-0: T-0.1, T-0.2 y T-0.3 hechas. T-0.3 se cerró el 2026-11-19: la comprobación 5 mostró que la clave de idempotencia guarda la respuesta fallida, lo que abre un ajuste en UT-7 (ver `verify-notes.md`).
- UT-1: T-1.1 a T-1.8 hechas y commiteadas en dos cortes (el cambio real era de 813 líneas): UT-1a `8202f04` y UT-1b `7621aad`.
- UT-2: T-2.1 a T-2.4 hechas y commiteadas: `8995431`.
- UT-3: T-3.1 a T-3.6 hechas y commiteadas en 5 cortes (ver abajo). Se implementó sin esperar T-0.3 (comprobaciones 4 y 5), por decisión del usuario.
- UT-4: T-4.1 a T-4.7 hechas y commiteadas en 4 cortes (ver abajo).
- UT-5a: T-5a.1 y T-5a.2 hechas y commiteadas en un solo commit.
- UT-5b: T-5b.1 a T-5b.3 hechas y commiteadas: `be9eda5`.
- UT-6: T-6.1 a T-6.4 hechas, sin commitear (los hace el usuario).
- UT-7: T-7.1 a T-7.6 hechas, sin commitear (los hace el usuario). T-7.7 (sandbox con un pago real) queda para el usuario.
- UT-8: T-8.1 a T-8.3 y T-8.5 a T-8.7 hechas, sin commitear; T-8.4 (flujo manual) del orquestador.
- UT-9a: T-9a.1 y T-9a.2 hechas, sin commitear; la comprobación manual del panel queda para el orquestador. UT-9b en adelante: pendientes.
- UT-9b: T-9b.1 y T-9b.2 hechas, sin commitear; la comprobación manual (incluido el reembolso real, T-7.7) queda para el orquestador.
- Regla vigente (decisión del usuario): si una unidad pasa ~400 líneas, partirla en commits coherentes de ~400 o menos, sin consultar; frenar solo si no hay corte limpio.

## Evidencia del ciclo TDD

| Tarea | Prueba | RED observado | GREEN | REFACTOR |
|---|---|---|---|---|
| T-1.4 (T-1.1 a T-1.3) | `tests/migracionReservaInvitado.test.ts` | 18 de 18 fallan: `column "guest_phone" of relation "bookings" does not exist` y `relation "booking_payments" does not exist` | 18 de 18 pasan tras aplicar las migraciones A y B | Sin cambios (SQL directo, sin lógica que limpiar) |
| T-1.5 y T-1.6 | `tests/vencimiento.test.ts`, `tests/barridoVencidas.test.ts` | Suites sin cargar: `Cannot find module .../vencimiento.js` y `.../barridoVencidas.js` | 12 de 12 pasan | Sin cambios |
| T-1.7 | `tests/validacionReservas.test.ts` (modificada) | 12 fallan: `puedeTransicionar is not a function` y 500 en lugar de 409 al salir de `EXPIRED` | 56 de 56 pasan (con `preferenciaPago`: 69) | Se reutiliza `puedeTransicionar` en `updateBookingStatus` |

| T-2.1 y T-2.2 | `tests/filtrosReserva.test.ts`, `tests/disponibilidad.test.ts` | Suites sin cargar: `Cannot find module .../filtrosReserva.js` | 11 de 11 pasan | Import reubicado en `court.service.ts` |
| T-2.3 y T-2.4 | `tests/metricasAdmin.test.ts` (modificada) | 4 fallan: la consulta no usa `filtroNoVencida` ni trae `payments`, y la recaudación suma `totalPrice` del invitado | 15 de 15 pasan | Sin cambios |
| T-3.1 y T-3.2 | `tests/adaptadorMercadoPago.test.ts` | Suite sin cargar: `Cannot find module '/src/core/integraciones/mercadoPago.js'` | 1.ª corrida: 2 fallan (`obtenerPago` y `reembolsarPago` lanzaban de forma síncrona sin credenciales); tras volverlas `async`: 3 archivos (`adaptadorMercadoPago`, `webhookPago`, `preferenciaPago`) 45 de 45 pasan | `payment.service.ts` deja de usar el SDK: lo hace el adaptador |
| T-3.3 y T-3.4 | `tests/cancelacionReserva.test.ts`, `tests/linkDePago.test.ts` | 2 suites sin cargar: `Cannot find module .../cancelacionReserva.js` y `.../linkDePago.js` | 18 de 18 pasan | Tipado de la condición en la prueba (`Prisma.BookingWhereInput`); `invalidarLinkDePago` usa `!idPreferencia` |
| T-3.5 y T-3.6 | `tests/cancelacionBajoBloqueo.test.ts` (nueva), `tests/preferenciaPago.test.ts` (modificada) | 14 fallan: 403/500 porque cancelar y cambiar estado no usaban el bloqueo ni `cancelarEnTransaccion`, el 409 de `CANCELLED` traía el mensaje general, y no se guardaba ni vencía la preferencia | 101 de 101 pasan en los 4 archivos afectados (`cancelacionBajoBloqueo`, `preferenciaPago`, `validacionReservas`, `linkDePago`), tras extender la transacción simulada de `validacionReservas.test.ts` | Sin cambios |
| T-4.1 y T-4.2 | `tests/tokenAcceso.test.ts`, `sena.test.ts`, `trustProxy.test.ts`, `datosInvitado.test.ts` | 4 suites sin cargar: `Cannot find module .../tokenAcceso.js` (y `trustProxy.js`, `sena.js`, `public.dto.js`) | 4 archivos más `validacionReservas` (por el `fechaHoraSchema` movido): 88 de 88 pasan | Sin cambios |
| T-4.3 y T-4.4 | `tests/limitadorPublico.test.ts` | 16 de 16 fallan: `Cannot find module /src/core/middlewares/limitadorPublico.js` | 1.ª corrida: 9 fallan con 500 (la prueba mezclaba dos registros de módulos tras `vi.resetModules`, y `AppError` no coincidía); tras importar también `errorHandler` dentro del mismo registro: 16 de 16 pasan | Sin cambios |
| T-4.5 y T-4.6 | `tests/reservaInvitadoCrear.test.ts`, `tests/limitadorCreacionRuta.test.ts` | 28 de 29 fallan: 404 en `POST /api/v1/public/bookings` (una pasa por la aserción de que no escribe) | 1.ª corrida: 17 fallan con 429 (la propia app compartida agotaba el límite de 10); tras subir `LIMITE_CREACION_PUBLICA_MAXIMO` antes de importar la app, 1 fallaba (`monto` NaN: el servicio leía `depositAmount` de la fila devuelta, que el simulado no trae); tras usar la seña calculada: 29 de 29 pasan | Sin cambios |
| T-4.7 | `tests/migracionReservaInvitado.test.ts` (modificada, base descartable) | Verificación de una implementación ya existente, sin RED por módulo faltante. Sensibilidad comprobada: con `TOPE_PENDIENTES_POR_TELEFONO=100` la prueba del teléfono falla (4 reservas en lugar de 2) | 20 de 20 pasan | Sin cambios |

| T-5a.1 y T-5a.2 | `tests/webhookPago.test.ts` (reescrita) | 13 de 23 fallan: el webhook no escribía `BookingPayment` (`crearPago` sin llamar, `updateMany` con `TRANSFER`, rechazos que cancelaban) | 1.ª corrida: 22 de 23 (la regex de la advertencia asumía el orden reserva-pago; el mensaje dice pago y luego reserva, se corrigió la prueba); luego 23 de 23 | `registrarPagoAprobado` partido en `reactivarSiElTurnoEstaLibre`, `releerMonto` y `advertirRevisionManual` |
| T-5b.1 y T-5b.2 | `tests/webhookPago.test.ts` (ramas de reembolso agregadas) | 16 de 40 fallan (rama 4 en cada estado, 5, 8, 9 ocupado, respaldo `ConflictError` y rama 10: el código de UT-5a solo advertía). Nota: el GREEN se escribió antes de las pruebas; el RED se observó restaurando `payment.service.ts` a HEAD con las pruebas nuevas y volviendo a poner la implementación | 40 de 40 pasan a la primera | `registrarPagoAprobado` queda como envoltorio del respaldo; la clasificación vive en `clasificarPago` y `registrarNoValido` |
| T-5b.3 | `tests/migracionReservaInvitado.test.ts` (modificada, base descartable) | Verificación de una implementación ya existente, sin RED por módulo faltante | 5 repeticiones del webhook contra la cancelación: reserva `CANCELLED` y una sola fila de pago; 25 de 25 en el archivo | Sin cambios |
| T-6.1 y T-6.2 | `tests/estadoSena.test.ts` | Suite sin cargar: `Cannot find module ./estadoSena.js` | 25 de 25 pasan a la primera | Tipos de `amount` y `depositAmount` aceptan `Decimal` o número |
| T-6.3 y T-6.4 | `tests/rutasPublicasToken.test.ts` (36 pruebas) | 35 de 36 fallan: 404 en las tres rutas por token (pasaba solo la de formato inválido) | 1.ª corrida: 12 fallan por errores de la prueba (el cuerpo del error usa `detail`, no `message`; una sobrescritura de `marcarPagos` ocultaba un evento; `instance` difiere entre rutas); corregidas: 36 de 36 pasan | Sin cambios |
| T-6.4 (concurrencia RES-029) | `tests/migracionReservaInvitado.test.ts` (modificada, base descartable) | Verificación de una implementación ya existente, sin RED por módulo faltante | Dos cancelaciones simultáneas por token: una 200 y otra 409, reserva `CANCELLED`, `depositPaidAtCancel` verdadero y un único pago `OWNER_DISCRETION`; 23 de 23 en el archivo | Sin cambios |
| T-7.1 y T-7.2 | `tests/rutasAdminReservas.test.ts` (describe nuevo, base descartable, 7 pruebas) | 6 de 7 fallan: `payments`, `depositStatus` y `refundDue` indefinidos, una PENDING vencida figura `PENDING` y la vista filtra `accessTokenHash`; pasa solo la de usuario nulo del invitado | 20 de 20 en el archivo (13 previas + 7) | `vistaAdmin.ts` (lista blanca) usado por `/admin/all` y `/admin/daily` |
| T-7.3 y T-7.4 | `tests/depositPercent.test.ts` (21 pruebas, prisma simulado) | 15 de 21 fallan (404: rutas inexistentes); las 6 que pasan son 401/403 por middleware y 404 de complejo inexistente, que pasan por la ausencia de ruta | 21 de 21 | Sin cambios |
| T-7.5 y T-7.6 | `tests/reembolsoPago.test.ts` (22 pruebas, prisma y adaptador simulados) | 21 de 22 fallan (404: ruta inexistente); pasa solo la de pago inexistente (404 por ausencia de ruta) | 22 de 22 a la primera | Reembolso extraído a `reembolsarEnMercadoPago` (privado) para aislar el 502 |

Triangulación: el barrido y el vencimiento tienen casos con dos canchas, error de una cancha, pasada superpuesta y error de pasada; las restricciones tienen casos válidos e inválidos de cada una.

## Verificación al cierre de cada commit (variables de la base descartable)

| Commit | `tsc --noEmit` | `npm test` | `npm run build` |
|---|---|---|---|
| UT-1a `8202f04` | sin errores | 150 pasan, 4 fallan (solo `integration.test.ts`, ambiental) | sin errores (verificado en el estado final de UT-1) |
| UT-1b `7621aad` | sin errores | 175 pasan, 4 fallan (solo `integration.test.ts`) | sin errores |
| UT-2 `8995431` | sin errores | 192 pasan, 4 fallan (solo `integration.test.ts`) | sin errores |
| UT-3 (5 commits, estado final) | sin errores | 18 archivos, 246 pasan, 0 fallan (la base descartable ya tiene semilla) | sin errores |
| UT-4 (4 commits, estado final) | sin errores | 25 archivos, 325 pasan, 0 fallan | sin errores |
| UT-5a | sin errores | 25 archivos, 330 pasan, 0 fallan (una corrida previa dio 1 falla intermitente en `rutasAdminReservas` "GET /admin/all"; no se repitió y el archivo pasa 13 de 13 sin mis cambios) | sin errores |
| UT-5b | sin errores | 25 archivos, 352 pasan; 1 falla intermitente en `rutasAdminReservas` "GET /admin/all" en 3 de 6 corridas completas (el archivo pasa 13 de 13 aislado; ver riesgos) | sin errores |
| UT-6 | sin errores | 27 archivos, 412 pasan, 0 fallan (la base descartable ya tiene semilla) | sin errores |
| UT-7 | sin errores | 29 archivos, 462 pasan, 0 fallan | sin errores |

`npx prisma migrate status`: `localhost:5434`, "Database schema is up to date!" (5 migraciones).

## Desviaciones y riesgos

- `prisma migrate dev --create-only` no funciona en terminal no interactiva: la migración A se generó con `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` (mismo SQL) y se completó a mano.
- `npx prisma generate` falla con `EPERM` al renombrar `query_engine-windows.dll.node` (otro proceso Node lo tiene abierto). El JS y los tipos del cliente sí se regeneraron (`tsc` y las pruebas ven los modelos nuevos); el motor binario es el mismo. Conviene cerrar el servidor de desarrollo y correr `npx prisma generate` otra vez.
- `liberarReservasVencidas` recibe un tercer parámetro opcional `ahora` (por defecto `new Date()`) para poder probarla; el diseño solo mostraba `(tx, courtId)`.
- Se quitó la desalineación que `prisma format` metió en los modelos no relacionados para no ensuciar el diff.
- UT-3: `expiration_date_from` no se envía (decisión del usuario, reloj de la PC adelantado respecto de Mercado Pago); el texto de T-3.1 y de la decisión 5 lo incluía.
- UT-3: `reembolsarPago` queda condicionado a la comprobación 5 de T-0.3 (pago aprobado de prueba): `PaymentRefund.create` sin `body.amount` y con `idempotencyKey` simple. Si el sandbox exige otra cosa (por ejemplo un componente por intento), se ajusta en UT-7.
- UT-3: las pruebas de RES-011 y RES-015 se escribieron en `cancelacionBajoBloqueo.test.ts` (prisma simulado), no en `rutasAdminReservas.test.ts` (contra la base real, codificación no UTF-8).
- UT-3: `reemplazarPreferenciaVigente` devuelve `Promise<void>` (lanza el 409 con 0 filas); el diseño decía `Promise<boolean>`.
- UT-3: la cancelación del jugador y el cambio de estado del administrador leen `courtId` fuera del bloqueo y, dentro, `liberarReservasVencidas` y la relectura; `cancelBooking` agrega el 409 "La reserva venció y no se puede cancelar." para `EXPIRED`. Ambas devuelven la reserva releída después de cancelar (`findUniqueOrThrow`).
- UT-3: el 409 de PAG-004 vive en `mensajeReservaNoPagable` (`linkDePago.ts`), compartido con el 409 de `reemplazarPreferenciaVigente`.
- UT-4: `leerTrustProxy` vive en `src/core/config/trustProxy.ts`, `calcularSena` en `src/modules/public/sena.ts` y `leerEnteroPositivo` en `src/core/config/entorno.ts` (el diseño y tasks.md no fijaban ubicación). Un `TRUST_PROXY` inválido (por ejemplo `true`, `abc` o `-1`) vale `false`.
- UT-4: `bloquearTelefono` toma el bloqueo y además cuenta las PENDING vigentes y responde 429 (el diseño las describía como pasos seguidos dentro del mismo bloqueo). El tope se lee de `TOPE_PENDIENTES_POR_TELEFONO` en cada llamada; los límites de IP se leen al cargar el módulo.
- UT-4: pruebas extra no listadas: `datosInvitado.test.ts` (DTO y teléfono) y `limitadorCreacionRuta.test.ts` (límite por IP sobre la ruta real; separado de `limitadorPublico.test.ts` para poder commitear los limitadores antes de que exista la ruta).
- UT-4: el servicio verifica `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` con `obtenerVariableMercadoPago` antes de escribir (503, PAG-007). `BACKEND_URL` ausente lanza un `Error` común en `crearPreferencia`: se compensa y responde 502 (RES-032 lo cubre como "falla de configuración").
- UT-4: la falla de `crearPreferencia` (o de guardar `mpPreferenceId`) responde 502 "No se pudo generar el link de pago. Intenta de nuevo." salvo un `AppError` (por ejemplo 503), que se propaga. La compensación pasa la reserva a `CANCELLED` con `depositPaidAtCancel: false` (PAG-023) solo si sigue `PENDING`. Si la preferencia se creó pero no se pudo guardar, se invalida (mejor esfuerzo); el diseño no lo preveía.
- UT-4: el porcentaje de seña se lee con `prisma.complex.findUniqueOrThrow` tras validar el turno (no se amplió `validarTurnoReservable`).
- UT-4: el 201 devuelve `initPoint` (no `sandboxInitPoint`).
- UT-4 (invalidar una preferencia creada pero no guardada, mejor esfuerzo): Decisión del usuario: se mantiene.
- Las líneas de UT-1 superan el presupuesto: pruebas 525 líneas, migraciones 98, resto ~190.

## Commits (sin Co-Authored-By, sin push)

| Unidad | Hash | Cambio real |
|---|---|---|
| UT-1a | `8202f04` | 6 archivos, 406 adiciones y 25 eliminaciones |
| UT-1b | `7621aad` | 7 archivos, 380 adiciones y 2 eliminaciones |
| UT-2 | `8995431` | 7 archivos, 296 adiciones y 6 eliminaciones |

UT-3 (todo con TDD estricto, sin Co-Authored-By, sin push; el cambio real superó las 400 líneas y se partió en cortes limpios):

| Corte | Hash | Contenido |
|---|---|---|
| UT-3a | `9d7acdf` | adaptador de Mercado Pago y su prueba (archivos nuevos) |
| UT-3b | `db39e18` | `payment.service.ts` usa el adaptador |
| UT-3c | `567f390` | `cancelacionReserva.ts`, `linkDePago.ts` y sus pruebas |
| UT-3d | `4299868` | `booking.service.ts` bajo el bloqueo, `cancelacionBajoBloqueo.test.ts`, `validacionReservas.test.ts` |
| UT-3e | ver `git log` | PAG-004 y PAG-025 en `payment.service.ts`, `preferenciaPago.test.ts`, `tasks.md` y esta bitácora |

UT-4 (TDD estricto, sin Co-Authored-By, sin push; `seed.ts` sin tocar). Estimado ~400, real ~1.510 líneas (pruebas ~1.150): partido en 4 cortes limpios.

| Corte | Hash | Contenido |
|---|---|---|
| UT-4a | `8acf846` | `tokenAcceso`, `sena`, `trustProxy`, DTO de invitado, `fechaHoraSchema` movido a `esquemas.ts` y sus pruebas |
| UT-4b | `3978af1` | `limitadorPublico`, `bloquearTelefono`, `entorno.ts`, `trust proxy` en `app.ts` y `limitadorPublico.test.ts` |
| UT-4c | `013384e` | servicio, controlador y rutas de `POST /public/bookings`, montaje en `app.ts`, `reservaInvitadoCrear.test.ts` y `limitadorCreacionRuta.test.ts` (748 líneas: la unidad servicio + pruebas no tiene corte limpio) |
| UT-4d | ver `git log` | T-4.7 (concurrencia en base descartable), `tasks.md` y esta bitácora |

Para que UT-1a compilara se incluyó en él solo la línea `[BookingStatus.EXPIRED]: []` de `booking.service.ts` y el ajuste de tipo de `payment.service.ts`; el resto de `booking.service.ts` va en UT-1b.

UT-5a (TDD estricto, sin Co-Authored-By, sin push; `seed.ts` sin tocar): un commit, `payment.service.ts` (+164/-31) y `webhookPago.test.ts` (+191/-59).

## Desviaciones de UT-5a

- Los casos de UT-5b (rama 4 monto distinto, rama 5 pago duplicado, rama 8 `CANCELLED`, rama 9 con turno ocupado, rama 10 `COMPLETED`) no escriben fila ni cambian la reserva: solo emiten la advertencia "requiere revisión manual". Cambio respecto de antes: ya no se reactiva una `CANCELLED` ni un pago rechazado cancela reservas (PAG-016 lo exige).
- Se quitaron de `webhookPago.test.ts` las pruebas de `CANCELLED` y `COMPLETED`; UT-5b las reescribe (T-5b.1). La de "reserva inexistente" pasó a la rama 2.
- Rama 3: la relectura con `obtenerPago` ocurre dentro del bloqueo, como en la tabla del diseño.
- Rama 7: `updateMany` condicional solo cambia `paymentMethod`.
- Pruebas extra: la seña (`depositAmount`) como monto esperado y pagos `pending`/`in_process` sin escritura.

UT-5b (TDD estricto, sin Co-Authored-By, sin push, SIN commitear; el agente no modificó `backend/prisma/seed.ts`, que trae un arreglo del usuario pendiente de commit fuera de UT-5b): `payment.service.ts` (+~190/-~85), `webhookPago.test.ts` (+~160), `migracionReservaInvitado.test.ts` (+~80). Total ~406 adiciones y 79 eliminaciones en el árbol (incluye 3 líneas ajenas de `seed.ts`).

## Desviaciones de UT-5b

- La reescritura de las "líneas 179 a 190" ya estaba hecha en UT-5a (se quitó la prueba que reactivaba `CANCELLED`); UT-5b agrega la prueba de rama 8 (`PAID_AFTER_CANCEL`, sin `updateMany`).
- Respaldo `ConflictError`: solo se activa si el error salió de reactivar una `EXPIRED` (bandera interna); un solapamiento en otra rama se propaga (409). La segunda transacción reconfirma la idempotencia por `mpPaymentId` antes de insertar `SLOT_TAKEN`.
- Un pago sin monto tras la relectura (rama 3) sigue sin fila; `registrarNoValido` avisa si no hay monto (caso solo del respaldo).
- Prueba de concurrencia (ajustada tras la revisión R3): las 5 repeticiones que aceptaban cualquier orden se reemplazaron por dos casos deterministas. Una transacción "portero" retiene el bloqueo de la cancha, se espera en `pg_locks` a que la primera operación quede encolada, se lanza la segunda y se suelta (PostgreSQL atiende la cola en orden de llegada). Pago primero: `CANCELLED` con `{ is_valid: true, OWNER_DISCRETION }`. Cancelación primero: `CANCELLED` con `{ is_valid: false, PAID_AFTER_CANCEL }`. Comprobado con mutación (expectativas intercambiadas: los dos casos fallan).
- Ajustes tras la segunda revisión (3 advertencias, sin bloqueantes):
  - R4: el respaldo `SLOT_TAKEN` reutiliza el monto con el que se intentó reactivar la `EXPIRED` (`montoDeLaReactivacion`) y ya no vuelve a llamar a Mercado Pago bajo el bloqueo. TDD: RED con `obtenerPago` llamado 3 veces en lugar de 2; GREEN 41/41 en `webhookPago`.
  - R2: el `switch` sobre `reserva.status` tiene un `default` con guarda `never` que llama a `advertirRevisionManual`, para que un estado nuevo no pierda el pago en silencio.
  - R3: las pruebas deterministas usan `enOrden`, que suelta el bloqueo en un `finally` y espera todas las operaciones lanzadas con `Promise.allSettled`.
  - Checks: `npm test` 350/350 en dos corridas, `npx tsc --noEmit` y `npm run build` limpios.

## Riesgos nuevos

- Resuelto: `rutasAdminReservas` "GET /admin/all" fallaba de forma intermitente porque `migracionReservaInvitado.test.ts` insertaba reservas de invitado en la misma base en paralelo. Decisión del usuario: `fileParallelism: false` en `backend/vitest.config.ts`. Suite completa sin fallas en 6 corridas seguidas (~27 s cada una): 4 con 352/352 y, tras reemplazar la prueba de carrera, 2 con 349/349.

- Las pruebas de agenda (RES-013) usan `prisma` simulado en `disponibilidad.test.ts`; `rutasAdminReservas.test.ts` no se modificó (corre contra la base real). No hay prueba contra PostgreSQL del filtro con una `PENDING` vencida no barrida.
- `getAllBookingsForAdmin` no se tocó (muestra todas las reservas, también `EXPIRED`); la lista completa del panel las muestra con su estado.
- Los archivos de `openspec/` siguen sin commitear.

## Documentación (UT-10, sin commit)

- T-10.1 a T-10.4 hechas y releídas; T-10.5 (hoja de ruta) sigue pendiente y corresponde al archivo.
- `docs/producto/glosario.md`: `EXPIRED`, reserva de invitado, token de acceso, `BookingPayment`, `RefundReason`, `REQUIRED` y `AT_DISCRETION`; la seña remite a `depositPercent`.
- `.claude/skills/dominio-reservas/SKILL.md`: `EXPIRED` en el glosario y tabla de estados (ocupa o no el turno), `BookingPayment`, motivos de reembolso y la regla de que una `CANCELLED` nunca se reactiva.
- `docs/operacion/variables-entorno.md`: `TRUST_PROXY`, los tres límites públicos y `TOPE_PENDIENTES_POR_TELEFONO` con sus valores por defecto; `DATABASE_URL_PRUEBA` corregida (debe ser una base distinta y descartable); sección de la base `reservas_prueba` (puerto 5434) y de las credenciales de prueba de Mercado Pago.
- `proposal.md`: `administracion` ya tenía spec base (AGREGADO y MODIFICADO), se agrega `canchas` (CAN-006) y la decisión D3 queda marcada como reemplazada por el diseño.
- Pendiente fuera de alcance: `README.md` (línea 136) sigue diciendo que `DATABASE_URL_PRUEBA` debe tener el mismo valor que `DATABASE_URL`.
- Sin commit ni código tocado.


## UT-6 (TDD estricto, sin Co-Authored-By, sin push, SIN commitear)

- Archivos nuevos: `estadoSena.ts` (89 líneas), `vistaPublica.ts` (59), `estadoSena.test.ts` (239) y `rutasPublicasToken.test.ts` (585). Modificados: `reservaInvitado.service.ts` (+166), `public.controller.ts` (+26), `public.routes.ts` (+18/-1) y `migracionReservaInvitado.test.ts` (+65). Total ~1.250 líneas, de ellas ~830 de pruebas y ~490 de código.
- Desviaciones: `vistaPublica.ts` no figura en el diseño (el mapeo en lista blanca se extrajo para mantener el servicio legible); el 404 por formato inválido vive en el servicio (`buscarPorToken`), no en el controlador; el reintento exige también `expiresAt` y `depositAmount` no nulos (si no, 404). La relectura de `reemplazarPreferenciaVigente` comparte `findUnique` con la búsqueda por token en las pruebas simuladas.
- Riesgo de tamaño: la unidad pasa de ~380 estimadas a ~1.250 líneas reales, por la cobertura de pruebas. Corte limpio sugerido: `estadoSena` + su prueba (~330) y rutas por token (resto).


## UT-7 (TDD estricto, sin Co-Authored-By, sin push, SIN commitear)

- Archivos nuevos: `bookings/vistaAdmin.ts` (96), `depositPercent.test.ts` (185) y `reembolsoPago.test.ts` (352). Modificados: `booking.service.ts` (+11/-24), `admin.{dto,service,controller,routes}.ts` (+72/-1), `payment.{dto,service,controller}.ts` y `payments.routes.ts` (+93/-1), `rutasAdminReservas.test.ts` (+254/-1). Total ~1.090 líneas, de ellas ~790 de pruebas y ~300 de código; estimadas ~400. Cortes de commit limpios: (a) vistas de administrador, (b) `depositPercent`, (c) reembolso por pago.
- Ajuste de T-0.3 aplicado: clave de idempotencia por intento `reembolso-<bookingPaymentId>-<uuid>` (`crypto.randomUUID()`); antes de reembolsar se consulta `obtenerPago` y, si figura `refunded`, solo se fija `refundedAt`; `updateMany where { id, refundedAt: null }`; 502 "No se pudo procesar el reembolso con Mercado Pago." sin detalle (el error real va al log del servidor); la falla de la consulta previa también responde 502.
- Desviaciones:
  - `vistaAdmin.ts` no figura en el diseño ni en T-7.2 (se agregó para compartir el mapeo entre la lista, la agenda y el reembolso).
  - `totalPrice` y `depositAmount` salen como número en la vista de administrador (antes `totalPrice` salía como cadena por el `Decimal` de Prisma); el frontend ya acepta `string | number`.
  - `/admin/all` y `/admin/daily` devuelven el estado efectivo (una PENDING vencida figura `EXPIRED`, ADM-008).
  - La respuesta del reembolso es la reserva en vista de administrador con sus pagos (decisión 8 y T-7.5); la spec PAG-024 dice "el pago actualizado": el pago actualizado figura dentro de `payments`.
  - Un reembolso aceptado por Mercado Pago cuyo `updateMany` afecta 0 filas (otro pedido ya lo registró) responde 200 sin pisar `refundedAt`.
  - `rutasAdminReservas.test.ts` tenía dos bytes en Windows-1252 (la "á" de un título): se pasaron a UTF-8 para poder editarlo.
  - El `PATCH /bookings/admin/:id/status` (`updateBookingStatus`) y `POST /admin/create` siguen devolviendo la fila de Prisma completa (incluye `accessTokenHash` de una reserva de invitado); no estaba en el alcance de ADM-008. Queda como candidato a una pasada de lista blanca.
- Pruebas de la vista de administrador contra la base descartable (`skipIf` sin `DATABASE_URL_PRUEBA`); `depositPercent` y reembolso con `prisma` y Mercado Pago simulados.
- T-7.7 (reembolso real en sandbox) pendiente del usuario.


## UT-8 (frontend sin pruebas automatizadas, sin Co-Authored-By, sin push, SIN commitear)

- T-8.1, T-8.2 y T-8.3 hechas; T-8.4 (flujo manual con chrome-devtools y sandbox de MP) queda para el orquestador.
- Modo: sin TDD (el frontend no tiene pruebas hasta `calidad-ci`); verificación por `tsc`, `lint` y `build`, los tres limpios.
- Archivos: `frontend/src/types/index.ts` (+68/-2: `BookingStatus` completo, `EstadoSena`, `RefundReason`, `BookingPayment`, `userId: string | null`, datos de invitado, `VistaPublicaReserva`), `frontend/src/pages/BookingsPage.tsx` (+147/-2: formulario de invitado sin sesión), `frontend/src/pages/ReservaInvitadoPage.tsx` (nuevo, 389), `frontend/src/utils/mensajeDeError.ts` (nuevo, 28), `frontend/src/App.tsx` (+2: ruta `/reserva/:codigo`). Total ~640 líneas frente a ~420 estimadas; cubierto por la excepción de tamaño de UT-8.
- Desviaciones: `utils/mensajeDeError.ts` no figura en el diseño (comparte la extracción de `detail`/`message` y de los errores por campo del 400); la pantalla se vuelve a consultar cada 20 s mientras la reserva está `PENDING` (para ver la confirmación del webhook tras volver de Mercado Pago; 45 consultas en 15 min, bajo el límite de 60); la confirmación de cancelar usa `window.confirm`; el monto de la seña no se muestra en el formulario (lo calcula el servidor), solo el precio del turno; `MyBookingsPage` conserva su tipo local y no se tocó.
- Rollback: revertir `ReservaInvitadoPage.tsx`, `mensajeDeError.ts`, la ruta en `App.tsx`, el formulario en `BookingsPage.tsx` y los tipos nuevos.

## Ajustes T-8.5 a T-8.7 (por la verificación manual T-8.4, sin Co-Authored-By, sin push, SIN commitear)

- T-8.5, T-8.6 y T-8.7 hechas; T-8.4 sigue abierta hasta repetir "volver" y "reintentar" (orquestador).
- T-8.5 y T-8.6 con TDD estricto (`backend/tests/adaptadorMercadoPago.test.ts`, SDK simulado, `Date` fijado con `vi.useFakeTimers({ toFake: ["Date"] })`).
  - RED: `npx vitest run tests/adaptadorMercadoPago.test.ts` dio 2 fallas de 15: `expiration_date_to` recibido `2026-12-01T12:00:00.000Z` en vez de `11:00:00.000Z`, y `auto_return` ausente con retorno `https`. La prueba de `http` (sin `auto_return`) ya pasaba porque el código nunca lo enviaba; queda como protección.
  - GREEN: 15/15.
- T-8.7 sin pruebas automatizadas: `BookingsPage.tsx` navega a `/reserva/<token>` con `state: { initPoint }` (tipo `EstadoNavegacionReserva` en `types/index.ts`); `ReservaInvitadoPage.tsx` valida el `state` con un guard (`unknown`, sin `any`), usa ese `initPoint` en "Pagar la seña" sin llamar al reintento y muestra el recuadro "Guardá este enlace antes de pagar" con el enlace completo y "Copiar enlace". Sin `state` (recarga) usa el reintento.
- Archivos: `backend/src/core/integraciones/mercadoPago.ts` (+9/-3), `backend/tests/adaptadorMercadoPago.test.ts` (+19/-4), `frontend/src/pages/BookingsPage.tsx` (+12/-3), `frontend/src/pages/ReservaInvitadoPage.tsx` (+64/-1), `frontend/src/types/index.ts` (+5).
- Verificación: `npm test` backend con base descartable 29 archivos y 463 pruebas pasan; `tsc --noEmit` y `npm run build` de backend y frontend limpios; `npm run lint` del frontend limpio.
- Desvío: el tipo `EstadoNavegacionReserva` no figura en el diseño (compartido entre las dos páginas).
- Rollback: revertir los cambios de estos cinco archivos.

## UT-9a (frontend sin pruebas automatizadas, sin Co-Authored-By, sin push, SIN commitear)

- T-9a.1 y T-9a.2 hechas. Sin ciclo TDD: el frontend no tiene pruebas hasta `calidad-ci`; verificación por `tsc`, `lint` y `build`.
- Archivos: `frontend/src/utils/whatsapp.ts` (nuevo, ~44: `normalizarTelefono`, `formatearTurnoUTC`, `armarEnlaceWhatsApp` -> `https://wa.me/<dígitos>?text=<codificado>`, `null` sin dígitos), `frontend/src/pages/AdminDashboard.tsx` (+158/-19: tipo `AdminBooking` con `BookingStatus`, `user` nulo y datos de invitado; etiquetas "Invitado" y de seña; `BotonWhatsApp`; grilla y lista con nombre, teléfono, correo, seña y turno UTC; `EXPIRED` mostrada como "Vencida" y sin botón "Cancelar" en la lista; `EXPIRED` excluida de la grilla).
- Verificación: `cd frontend && npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm run build` exit 0 (1880 módulos).
- Desvíos: en la grilla, la reserva de invitado muestra la marca "Invitado" en lugar de la etiqueta de método de pago (los invitados se guardan con `paymentMethod` CASH y se vería "Efectivo", engañoso). El botón de WhatsApp se ofrece también en la lista. Mensaje de WhatsApp en español, con la hora indicada como UTC.
- Rollback: borrar `whatsapp.ts` y revertir `AdminDashboard.tsx`.

## UT-9b (frontend sin pruebas automatizadas, sin Co-Authored-By, sin push, SIN commitear)

- T-9b.1 y T-9b.2 hechas. Sin ciclo TDD: el frontend no tiene pruebas hasta `calidad-ci`; verificación por `tsc`, `lint` y `build`.
- Archivo: `frontend/src/pages/AdminDashboard.tsx` (~+280 sobre UT-9a; el diff acumulado de la rama de trabajo es +438/-19). Cambios:
  - `ListaPagos` por reserva en la pestaña "Todas las reservas": monto, id de pago de Mercado Pago, etiqueta del motivo (tabla del diseño), "Reembolsado el <fecha UTC>" o "Pago válido"; botón "Reembolsar" solo para pagos con `refundReason` y sin `refundedAt`.
  - `handleRefundPayment`: `window.confirm` con monto e id, `POST /payments/admin/payments/:id/refund`, reemplaza la reserva con la vista devuelta, aviso de éxito o de error con `mensajeDeError` (detail/message del servidor, incluye el 409 y el 502); un solo reembolso a la vez.
  - Marca "Reembolso pendiente" (`REQUIRED`) o "Reembolso a criterio" (`AT_DISCRETION`) según `refundDue`.
  - Pestaña "Canchas": formulario "Porcentaje de seña" con `GET/PATCH /admin/complexes/:id/deposit-percent`; el id del complejo es el `complexId` de la primera cancha (el estado `complexId` ya existente); valida entero 1 a 100 antes de enviar; ante error muestra el mensaje del servidor y restaura el valor anterior.
- Verificación: `npx tsc -b --noEmit` exit 0; `npm run lint` exit 0; `npm run build` exit 0 (1880 módulos).
- Desvíos: la lista de pagos solo está en la pestaña "Todas las reservas" (la grilla diaria no la muestra); el porcentaje de seña va en la pestaña "Canchas" y no en una pestaña nueva; `refundDue` se muestra como marca en la tarjeta de la reserva; sin complejo (sin canchas) el campo queda deshabilitado.
- Rollback: revertir los cambios de UT-9b en `AdminDashboard.tsx` (`ListaPagos`, `handleRefundPayment`, formulario de seña, efecto 4).

## UT-12 (T-12.1 y T-12.2, TDD estricto, sin Co-Authored-By, sin push, SIN commitear)

| Tarea | Prueba (RED primero) | RED observado | GREEN | Refactor |
|---|---|---|---|---|
| T-12.1 (C1) | `tests/liberarAlCrearReserva.test.ts` (prisma simulado, 2 pruebas) y `tests/liberarAlCrearReservaBase.test.ts` (base descartable, 2 pruebas) | Simulado: el orden era `bloqueo, crear` sin `liberar`. Base: 409 en lugar de 201 con una PENDING de invitado vencida sin barrer (POST /bookings y POST /bookings/admin/create) | 4 de 4 | Ninguno |
| T-12.2 (W1) | `tests/respuestasListaBlanca.test.ts` (prisma simulado, 3 pruebas, reserva de invitado) | PATCH admin y cancelación del jugador devolvían `accessTokenHash` y `mpPreferenceId`; el PATCH no pedía `payments` | 3 de 3 | Ninguno |

- `booking.service.ts`: `createBooking` y `createAdminBooking` llaman `liberarReservasVencidas` como primera operación bajo el bloqueo; `updateBookingStatus` lee con `incluirParaVistaAdmin` y responde `armarVistaAdmin(...)` (estado efectivo, `depositStatus`, `refundDue`, `payments`); `cancelBooking` responde `armarVistaJugador(...)`.
- `vistaJugador.ts` (nuevo): lista blanca de 10 campos de la reserva del jugador.
- Pruebas existentes ajustadas: el simulado de `findUniqueOrThrow` en `validacionReservas.test.ts` y `cancelacionBajoBloqueo.test.ts` devuelve ahora una reserva completa (cancha, titular y pagos), porque el PATCH de administrador arma la vista.
- Frontend: sin cambios; `AdminDashboard.tsx` no usa el cuerpo de la respuesta del PATCH (solo espera que no falle).
- Verificación: `npm test` 32 archivos, 470 pasan, 0 fallan (con `DATABASE_URL` y `DATABASE_URL_PRUEBA` de la base descartable); `npx tsc --noEmit` y `npm run build` sin errores.
- Desvío: el cuerpo de `PATCH /bookings/:id/cancel` pierde `depositPaidAtCancel`, `guest*`, `expiresAt` y `depositAmount` (un jugador con cuenta no los usa); el frontend no lee ese cuerpo.
