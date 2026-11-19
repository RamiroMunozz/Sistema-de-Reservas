# Progreso de apply: reserva-invitado

Modo: TDD estricto (Vitest, `cd backend && npm test`). Base de pruebas: `reservas_prueba` (puerto 5434); nunca la de desarrollo. Rama `desarrollo`.

## Estado

- UT-0: T-0.1 y T-0.2 hechas. T-0.3 bloqueada: faltan credenciales de prueba de Mercado Pago.
- UT-1: T-1.1 a T-1.8 hechas y commiteadas en dos cortes (el cambio real era de 813 líneas): UT-1a `8202f04` y UT-1b `7621aad`.
- UT-2: T-2.1 a T-2.4 hechas y commiteadas: `8995431`.
- UT-3: T-3.1 a T-3.6 hechas y commiteadas en 5 cortes (ver abajo). Se implementó sin esperar T-0.3 (comprobaciones 4 y 5), por decisión del usuario.
- UT-4: T-4.1 a T-4.7 hechas y commiteadas en 4 cortes (ver abajo).
- UT-5a: T-5a.1 y T-5a.2 hechas y commiteadas en un solo commit.
- UT-5b en adelante: pendientes.
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

## Riesgos nuevos

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

