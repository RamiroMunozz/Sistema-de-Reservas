# Diseño: reserva-invitado

Copia en Engram: `sdd/reserva-invitado/design`. Entradas: `proposal.md`, `exploration.md` y las delta specs (`specs/reservas`, `specs/pagos`, `specs/administracion` y `specs/canchas`), que se alinean en paralelo con las decisiones de este diseño. Decisiones del usuario: Engram `producto/reserva-invitado-specs` y `producto/reserva-invitado`, y `docs/producto/decisiones.md` (DP-04 y DP-09 a DP-14). Verificado contra el código de `desarrollo` (2026-11-18): Prisma 5.22, `mercadopago` 3.6 (tipos leídos en `backend/node_modules/mercadopago/dist`), `express-rate-limit` 8.7, Express 5, Zod 4.4 y Vitest 4.

> **Cambios respecto de la propuesta:**
>
> - La decisión D3 de la propuesta (sin estado `EXPIRED`) quedó reemplazada: el vencimiento produce el estado `EXPIRED` (RES-035) y una reserva `CANCELLED` nunca se reactiva (PAG-012).
> - Por decisión del usuario, los pagos de Mercado Pago se registran en una tabla propia, `BookingPayment`. Así ningún pago aprobado queda solo en el log de consola (decisión 11).

## Enfoque técnico

- **Estado `EXPIRED` en la base:** se agrega el valor al enum `BookingStatus` y se recrea `bookings_sin_solapamiento` excluyendo `CANCELLED` y `EXPIRED`, en dos migraciones (decisión 1). El nombre de la restricción no cambia, así que `reservaSolapada.ts` sigue funcionando.
- **Vencimiento bajo el bloqueo:** `liberarReservasVencidas(tx, courtId)` pasa a `EXPIRED` las `PENDING` vencidas de una cancha. Corre como primera operación dentro de `conBloqueoDeCancha` en toda escritura que lee o cambia estados. El barrido de 60 segundos toma el bloqueo de cada cancha (decisión 3).
- **Lecturas coherentes antes del barrido:** los filtros compartidos `filtroOcupaTurno(ahora)` y `filtroNoVencida(ahora)` dan una sola definición para todas las lecturas. El estado efectivo y los derivados de la seña se calculan con funciones puras (decisión 4).
- **Pagos como entidad propia:** cada pago aprobado notificado por Mercado Pago crea una fila de `BookingPayment`. La fila se clasifica en el instante del webhook (`isValid` y `refundReason`) y se reembolsa de a un pago (decisiones 7 y 11).
- **Mercado Pago detrás de un adaptador** en `backend/src/core/integraciones/mercadoPago.ts` (decisión 5).
- **Cancelación única y preferencia vigente única** (decisión 6):
  - la cancelación pasa los pagos válidos a `OWNER_DISCRETION` y, después del commit, invalida el link de pago como mejor esfuerzo;
  - crear una preferencia nueva guarda su id y expira la anterior.
- **API pública separada** en `backend/src/modules/public/`, con limitadores propios (decisiones 8 y 9).
- **Capas según `AGENTS.md`:**
  - los controladores manejan `req`, `res`, Zod y los códigos de estado;
  - los servicios contienen las reglas y el acceso a Prisma;
  - no se usa `any`;
  - las fechas van en UTC con `toISOString()`.
- **Multi-tenant (ADR 0002):** nada de lo nuevo impide el aislamiento futuro.
  - `depositPercent` vive en `Complex`, que en el futuro dependerá del negocio.
  - La ruta de configuración recibe el id del complejo, para poder verificar su pertenencia más adelante.
  - El adaptador de Mercado Pago es la costura para las credenciales por negocio (cambio 5).

## Decisiones de arquitectura

### Decisión 1: `EXPIRED` en dos migraciones, con la restricción recreada en una sola sentencia

**Elección:**

- **Migración A** `20261119120000_reserva_invitado`, generada con `npx prisma migrate dev --create-only --name reserva_invitado` y revisada a mano. Contiene:
  - `ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED'`;
  - `user_id` opcional y las columnas nuevas de `bookings` y `complexes`;
  - el enum `RefundReason` y la tabla `booking_payments` con su clave foránea e índices;
  - agregados a mano al final, los `CHECK` y la exclusión de la decisión 11.

  **No usa** el literal `'EXPIRED'`. Sí usa `'OWNER_DISCRETION'`, lo que es válido porque `RefundReason` se **crea** en la misma migración: la restricción de PostgreSQL afecta solo a los valores agregados con `ADD VALUE`, no a los de un tipo creado en esa transacción.
- **Migración B** `20261119120100_sin_solapamiento_excluye_vencidas`, creada vacía con `--create-only` y escrita a mano:

```sql
-- Prisma no representa esta restricción. Se recrea en una sola sentencia:
-- el bloqueo ACCESS EXCLUSIVE dura toda la sentencia y no hay ventana sin restricción.
ALTER TABLE "bookings"
  DROP CONSTRAINT "bookings_sin_solapamiento",
  ADD CONSTRAINT "bookings_sin_solapamiento"
  EXCLUDE USING gist (
    "court_id" WITH =,
    tstzrange("start_time", "end_time") WITH &&
  )
  WHERE ("status" NOT IN ('CANCELLED', 'EXPIRED'));
```

**Alternativas consideradas:**

- Una sola migración. Se descarta: PostgreSQL rechaza usar un valor agregado con `ADD VALUE` en la misma transacción ("unsafe use of new value"), y el predicado con `'EXPIRED'` es un uso. **Supuesto a validar** en la base descartable, porque Context7 no devolvió documentación de Prisma 5.
- `DROP` y `ADD` en sentencias o migraciones separadas. Se descarta: deja una ventana sin restricción, que RES-009 prohíbe.
- Recrear el enum. Se descarta: reescribe la tabla y obliga igual a recrear la restricción.

**Justificación:** entre A y B rige la restricción anterior, que es más estricta. Todavía no hay filas `EXPIRED`, porque el código que las produce se despliega después de las dos migraciones. La revisión manual rechaza cualquier `DROP` que proponga Prisma de `bookings_sin_solapamiento`, `bookings_horario_valido` o de las restricciones manuales nuevas (skill `prisma-migraciones`).

**Datos existentes:** no hay datos de pago que migrar. La columna `bookings.mp_payment_id` nunca existió en la base: el esquema actual (`backend/prisma/schema.prisma`, modelo `Booking`) no la tiene, y el webhook actual no guarda el id del pago (observación 5 de `pagos`). Las reservas confirmadas antes de este cambio por Mercado Pago (con `paymentMethod` `TRANSFER`) quedan sin filas de pago. Son todas reservas con cuenta, cuyo `depositStatus` es nulo.

**Reversa:**

- La reversa es SQL probado en base descartable.
- Pasa las filas `EXPIRED` a `CANCELLED` y recrea la restricción con `status <> 'CANCELLED'` en una sola sentencia.
- Elimina `booking_payments`, el enum `RefundReason`, los `CHECK` y las columnas nuevas.
- Vuelve `user_id` a `NOT NULL` después de cancelar o asignar las reservas de invitado.
- **Antes de eliminar `booking_payments`, exporta sus filas**, porque contienen pagos reales.
- El valor `EXPIRED` queda en el tipo sin uso, lo que es inocuo: PostgreSQL no permite quitar un valor de enum.

### Decisión 2: nombres definitivos de columnas y campos

**Elección:**

| Campo Prisma | Columna | Tipo | Uso |
|---|---|---|---|
| `Booking.userId` | `user_id` | `Uuid?` | Nulo en reservas de invitado. |
| `Booking.guestFirstName` y `guestLastName` | `guest_first_name` y `guest_last_name` | `VarChar(100)?` | RES-024. |
| `Booking.guestPhone` | `guest_phone` | `VarChar(15)?` | Solo dígitos, de 8 a 15. |
| `Booking.guestEmail` | `guest_email` | `VarChar(255)?` | Opcional. |
| `Booking.expiresAt` | `expires_at` | `Timestamptz?` | Nulo en reservas con cuenta y de administrador. |
| `Booking.depositAmount` | `deposit_amount` | `Decimal(10, 2)?` | Nulo en reservas con cuenta (PAG-022). |
| `Booking.accessTokenHash` | `access_token_hash` | `Char(64)? @unique` | SHA-256 en hexadecimal. |
| `Booking.mpPreferenceId` | `mp_preference_id` | `VarChar(100)?` | Preferencia vigente (PAG-025). |
| `Booking.depositPaidAtCancel` | `deposit_paid_at_cancel` | `Boolean?` | Al cancelar: `true` si había un pago válido no reembolsado. |
| `Booking.payments` | relación | `BookingPayment[]` | Pagos aprobados (decisión 11). |
| `Complex.depositPercent` | `deposit_percent` | `Int @default(30)` | De 1 a 100 (ADM-015). |

`Booking` **no** tiene `mpPaymentId`, `mpPaidAmount` ni `refundedAt`: esos datos viven en `BookingPayment` (decisión 11).

- Índices: `@@index([status, expiresAt])` (vencimiento) y `@@index([guestPhone, status])` (tope por teléfono).
- `CHECK` manuales, comentados sobre los modelos:
  - `bookings_titular_valido`: `(user_id IS NOT NULL AND guest_phone IS NULL) OR (user_id IS NULL AND guest_phone IS NOT NULL)` (RES-033);
  - `complexes_porcentaje_sena_valido`: `deposit_percent BETWEEN 1 AND 100`.
- Derivados de la reserva, sin columna: `depositStatus`, `refundDue` y `refundAtOwnerDiscretion` (decisión 4).

**Justificación:** el modelo `Booking` está en inglés y `AGENTS.md` conserva los identificadores existentes; los nombres coinciden con los de las specs. El `CHECK` de titular como XOR cubre las dos reglas de RES-033.

### Decisión 3: vencimiento dentro del bloqueo de cada cancha y barrido por cancha

**Elección:**

- `liberarReservasVencidas(tx, courtId)` en `backend/src/modules/bookings/vencimiento.ts`: ejecuta `tx.booking.updateMany({ where: { courtId, status: PENDING, expiresAt: { lte: ahora } }, data: { status: EXPIRED } })`.
- Corre como primera operación dentro de `conBloqueoDeCancha` en:
  - la creación de invitado (RES-026);
  - la creación de jugador (`createBooking`) y la de administrador (`createAdminBooking`), para que una `PENDING` vencida sin barrer no dé 409 (RES-026, RES-007; hallazgo C1 de la verificación);
  - `cancelBooking` (RES-011) y `updateBookingStatus` (RES-015);
  - la cancelación por token (RES-029) y el reintento de pago (PAG-021);
  - la rama `EXPIRED` del webhook.

  Así una `PENDING` vencida ya es `EXPIRED` cuando se valida la transición, y los 409 de RES-011, RES-029 y RES-035 salen de la tabla de transiciones.
- `ejecutarBarridoDeVencidas()` en `barridoVencidas.ts`: busca las canchas con `PENDING` vencidas (`distinct: ["courtId"]`) y, por cada una, ejecuta `conBloqueoDeCancha(courtId, tx => liberarReservasVencidas(tx, courtId))`. El error de una cancha se registra y no corta las demás.
- `iniciarBarridoDeVencidas(intervaloMs = 60_000)`: `setInterval` con `unref()`, sin pasadas superpuestas, con captura de errores por pasada (RES-027). Se llama desde `server.ts` después de `listen`, nunca desde `app.ts`.

**Alternativas consideradas:**

- Un `updateMany` global sin bloqueo. Se descarta: correría en carrera con el webhook, que lee y escribe bajo el bloqueo.
- `node-cron`. Se descarta: es una dependencia innecesaria.
- Filtrar solo en las lecturas. Se descarta: la restricción de la base seguiría ocupando el turno.

**Justificación:** todas las escrituras de una cancha comparten el mismo `pg_advisory_xact_lock`, y el barrido es idempotente aunque corran varias instancias del servidor.

### Decisión 4: filtros compartidos y derivados en funciones puras

**Elección:**

`backend/src/modules/bookings/filtrosReserva.ts`:

```ts
const noVencidaPendiente = (ahora: Date): Prisma.BookingWhereInput[] => [
  { status: { not: BookingStatus.PENDING } },
  { expiresAt: null },
  { expiresAt: { gt: ahora } },
];

export const filtroOcupaTurno = (ahora: Date): Prisma.BookingWhereInput => ({
  status: { notIn: [BookingStatus.CANCELLED, BookingStatus.EXPIRED] },
  OR: noVencidaPendiente(ahora),
});

export const filtroNoVencida = (ahora: Date): Prisma.BookingWhereInput => ({
  status: { not: BookingStatus.EXPIRED },
  OR: noVencidaPendiente(ahora),
});
```

- `filtroOcupaTurno` lo usan la disponibilidad (RES-012 y CAN-006), la agenda (RES-013) y la verificación de turno libre del webhook.
- `filtroNoVencida` lo usan las métricas (ADM-004 y ADM-005).

`backend/src/modules/bookings/estadoSena.ts` (funciones puras sobre la reserva y sus pagos):

- `estadoEfectivo(reserva, ahora)`: una `PENDING` con `expiresAt` menor o igual a `ahora` se informa como `EXPIRED`.
- `pagoValidoVigente(pagos)`: el pago con `isValid` y sin `refundedAt`, o `null`.
- `derivarEstadoSena(reserva, pagos)`, nulo si no hay `depositAmount`:
  - `PAID` si hay un pago válido no reembolsado;
  - `REFUNDED` si hay un pago válido y está reembolsado;
  - `PENDING` en otro caso (incluido un pago `AMOUNT_MISMATCH`).
- `derivarReembolsoPendiente(pagos)`, a partir de los pagos con `refundReason` y sin `refundedAt`:
  - `REQUIRED` si alguno tiene un motivo distinto de `OWNER_DISCRETION`;
  - `AT_DISCRETION` si todos son `OWNER_DISCRETION`;
  - `null` si no hay ninguno.
- `devolucionACriterioDelCanchero(reserva, pagos, ahora)`: `true` si el estado efectivo es `PENDING` o `CONFIRMED` y `derivarEstadoSena` es `PAID` (RES-028).

**Alternativas consideradas:** `NOT: { status: PENDING, expiresAt: { lte } }`. Se descarta: con `expires_at` nulo, la lógica de tres valores de SQL excluye por error las `PENDING` sin vencimiento. El `OR` explícito evita ese error.

### Decisión 5: adaptador de Mercado Pago en `core/integraciones`

**Elección:** `backend/src/core/integraciones/mercadoPago.ts`:

- `crearPreferencia(datos)`: `Preference.create`. Con `venceEn`, envía `expires: true`, `expiration_date_from` y `expiration_date_to`; esas propiedades están verificadas en `PreferenceRequest` del SDK instalado.
- `expirarPreferencia(id)`: `Preference.get` y luego `Preference.update({ id, updatePreferenceRequest: { items, expires: true, expiration_date_to: ahora menos una hora } })`. Se usa un instante en el pasado con margen porque con `ahora` el efecto depende del reloj del servidor: en T-8.4, con el reloj local 53 s adelantado, el link viejo se pudo pagar durante ese lapso. En el SDK instalado, `items` es obligatorio en el tipo `PreferenceRequest`, por eso se reenvían los ítems leídos.
- `obtenerPago(id)`: `Payment.get`.
- `reembolsarPago(mpPaymentId, claveIdempotencia)`: `PaymentRefund.create({ payment_id, requestOptions: { idempotencyKey } })`. Sin `body.amount`, reembolsa el saldo completo de ese pago, que es su `amount`. `PaymentRefund` se exporta desde la raíz del paquete y `Options.idempotencyKey` existe en el SDK instalado.
- Conserva el 503 de PAG-007 (`obtenerVariableMercadoPago`).

**Justificación:**

- `payments` ya depende de `bookings` (`bloqueoCancha`); con el SDK en `core`, `bookings` no necesita depender de `payments`, y se evita un ciclo entre módulos.
- Es un único punto para simular en las pruebas y para las credenciales por negocio.

### Decisión 6: cancelación compartida y preferencia vigente única

**Elección:**

`backend/src/modules/bookings/cancelacionReserva.ts`:

```ts
export const cancelarEnTransaccion = async (
  tx: Prisma.TransactionClient,
  idReserva: string,
): Promise<{ depositPaidAtCancel: boolean }> => {
  // El pago válido no reembolsado queda a criterio del canchero (DP-11).
  const marcados = await tx.bookingPayment.updateMany({
    where: { bookingId: idReserva, isValid: true, refundedAt: null },
    data: { refundReason: RefundReason.OWNER_DISCRETION },
  });
  const depositPaidAtCancel = marcados.count > 0;
  await tx.booking.update({
    where: { id: idReserva },
    data: { status: BookingStatus.CANCELLED, depositPaidAtCancel },
  });
  return { depositPaidAtCancel };
};
```

`backend/src/modules/bookings/linkDePago.ts`:

- `invalidarLinkDePago(idPreferencia: string | null)`: no hace nada si recibe `null`. Si no, llama a `expirarPreferencia`; ante un error, lo registra con `console.error` y nunca lo propaga.
- `reemplazarPreferenciaVigente({ idReserva, idAnterior, idNueva, condicion }): Promise<boolean>` lo usan la preferencia con cuenta y el reintento por token:
  1. Se crea la preferencia nueva fuera de toda transacción.
  2. `updateMany where { id, mpPreferenceId: idAnterior, ...condicion }` con `mpPreferenceId: idNueva`. Es un "comparar y reemplazar": afecta 0 filas si otro pedido ya cambió la preferencia o si la reserva dejó de ser pagable.
  3. Con 1 fila: después de la escritura, `invalidarLinkDePago(idAnterior)`.
  4. Con 0 filas: `invalidarLinkDePago(idNueva)`, se relee la reserva y se responde 409 con el mensaje de su estado. Si la reserva sigue pagable (carrera entre dos pedidos), el mensaje es "La reserva cambió mientras se generaba el pago. Intenta de nuevo.".

Secuencia de los tres caminos de cancelación (RES-011, RES-015 con `CANCELLED` y RES-029):

1. Se lee `courtId` fuera de la transacción.
2. Dentro del bloqueo: `liberarReservasVencidas`, relectura, validación de dueño, token o transición, y `cancelarEnTransaccion`.
3. Después del commit: `invalidarLinkDePago(mpPreferenceId)`.

**Alternativas consideradas:** llamar a Mercado Pago dentro de la transacción. Se descarta: retiene el bloqueo durante una llamada de red, y un fallo revertiría la cancelación, algo que PAG-025 prohíbe. Lanzar la invalidación sin esperarla: se descarta porque las pruebas no la podrían observar.

**Justificación:** nunca queda una preferencia pagable sin guardar en la reserva, y la cancelación se confirma en la base antes de hablar con Mercado Pago.

### Decisión 7: webhook idempotente por `mpPaymentId` que registra todo pago aprobado

**Elección:** `processWebhook` conserva la firma, el filtro de eventos y la validación de `external_reference`. Un pago con estado distinto de `approved` no escribe nada (PAG-016). Para `approved`, `registrarPagoAprobado(idReserva, idPago, monto)` lee `courtId` fuera del bloqueo y, dentro de `conBloqueoDeCancha`, relee la reserva y su pago válido. Luego decide en este orden:

| Orden | Condición | Fila de `BookingPayment` | Efecto sobre la reserva |
|---|---|---|---|
| 1 | Ya existe una fila con ese `mpPaymentId` | Ninguna | Ninguno: idempotencia (PAG-013). |
| 2 | La reserva no existe | Ninguna: el pago no es de este sistema | Advertencia de consola. |
| 3 | `transaction_amount` ausente | Se relee el pago una vez con `obtenerPago`. Si sigue sin monto, no se crea la fila | Advertencia de datos inválidos de Mercado Pago. |
| 4 | Monto distinto de `depositAmount ?? totalPrice` (`Prisma.Decimal`), en **cualquier** estado, incluso `COMPLETED` y aunque ya exista un pago válido | `isValid: false`, `AMOUNT_MISMATCH` | Ninguno; una `PENDING` sigue `PENDING` y vence normal. |
| 5 | Ya hay un pago válido **sin reembolso** | `isValid: false`, `DUPLICATE_PAYMENT` | Ninguno. Un pago válido ya reembolsado no cuenta y no bloquea un nuevo pago válido. |
| 6 | `PENDING` (vigente o vencida no barrida) | `isValid: true` | `CONFIRMED` y `MERCADOPAGO` (`updateMany` condicional al estado leído). |
| 7 | `CONFIRMED` sin pago válido (por ejemplo, `CASH` o confirmada a mano) | `isValid: true` | `paymentMethod` `MERCADOPAGO` (PAG-013). |
| 8 | `CANCELLED` | `isValid: false`, `PAID_AFTER_CANCEL` | Ninguno; nunca se reactiva. |
| 9 | `EXPIRED` | Según el turno | `liberarReservasVencidas` y `count` de las solapadas con `filtroOcupaTurno`. Turno libre: fila `isValid: true` y la reserva pasa a `CONFIRMED` con `MERCADOPAGO`. Turno ocupado: fila `isValid: false` con `SLOT_TAKEN`, sin cambio de estado. |
| 10 | `COMPLETED` sin pago válido vigente | `isValid: true`, sin motivo (cubre la reserva) | Ninguno: el estado nunca cambia. |

- En `COMPLETED` aplican las mismas reglas 4 y 5 que en los demás estados, y nunca cambia el estado.
- **Pago sin monto (rama 3):** no se registra la fila, porque `amount` es obligatorio. Es el hecho que permite clasificar el pago y saber qué se cobró, y un pago sin monto es un dato inválido de Mercado Pago que se debe revisar a mano.

- La rama 6 no ejecuta `liberarReservasVencidas` antes de leer, porque pasaría a `EXPIRED` la misma reserva que el pago debe confirmar.
- Si en la rama 9 la restricción de la base reporta igual un solapamiento (`ConflictError`, con la transacción revertida), una segunda transacción bajo el mismo bloqueo inserta la fila `SLOT_TAKEN`.
- Toda advertencia del webhook incluye la reserva y el pago, con el texto "requiere revisión manual".

**Alternativas consideradas:** guardar el pago en columnas de `Booking`. Se descarta por decisión del usuario: una reserva solo podía registrar un pago, y el segundo quedaba solo en el log.

**Justificación:** resuelve las observaciones 2, 4, 5 y 7 de `pagos`. Que la clasificación ocurra bajo el bloqueo garantiza que el motivo refleje el estado de la reserva en el instante del pago.

### Decisión 8: rutas nuevas

| Método y ruta | Requisitos | Acceso | Respuesta |
|---|---|---|---|
| `POST /api/v1/public/bookings` | RES-023 a RES-025, RES-030 a RES-032 y PAG-020 | Público, `limitadorCreacionPublica` | 201 `{ token, initPoint }` |
| `GET /api/v1/public/bookings/:token` | RES-028 | Público, `limitadorConsultaPublica` | 200, vista pública |
| `PATCH /api/v1/public/bookings/:token/cancel` | RES-029 | Público, `limitadorConsultaPublica` | 200, vista pública |
| `POST /api/v1/public/bookings/:token/payment` | PAG-021 | Público, `limitadorConsultaPublica` | 200 `{ initPoint }` |
| `GET /api/v1/admin/complexes/:id/deposit-percent` | ADM-015 | `ADMIN` | 200 `{ id, depositPercent }` |
| `PATCH /api/v1/admin/complexes/:id/deposit-percent` | ADM-015 | `ADMIN` | 200 `{ id, depositPercent }` |
| `POST /api/v1/payments/admin/payments/:paymentId/refund` | PAG-024 | `authenticate` y `requireRole(["ADMIN"])` | 200 con la reserva en vista de administrador y sus pagos |

- `:paymentId` es el `id` (UUID) de `BookingPayment`, no el id de Mercado Pago; se valida con `uuidSchema`.
- El reintento es `POST` porque crea una preferencia nueva y no es idempotente. Responde 409 si la reserva no está `PENDING` vigente o **si ya tiene un pago válido**; un pago `AMOUNT_MISMATCH` previo no lo bloquea.
- `depositPercent` usa el esquema Zod `z.object({ depositPercent: z.number().int().min(1).max(100) })`. El id del complejo viene de la primera cancha, como ya hace el panel (`AdminDashboard.tsx:147`).

### Decisión 9: límites de abuso con `express-rate-limit` y bloqueo por teléfono

- `backend/src/core/middlewares/limitadorPublico.ts` exporta dos limitadores, con valores leídos de variables de entorno al cargar el módulo:
  - `limitadorCreacionPublica` cuenta todas las solicitudes (RES-030): `LIMITE_CREACION_PUBLICA_MAXIMO` (10) y `LIMITE_CREACION_PUBLICA_VENTANA_MS` (900000);
  - `limitadorConsultaPublica`: `LIMITE_CONSULTA_PUBLICA_MAXIMO` (60), con la misma ventana.
- `app.set("trust proxy", leerTrustProxy(process.env.TRUST_PROXY))`: sin definir vale `false`; un número indica los saltos de confianza. Nunca se acepta `true`.
- Tope por teléfono (RES-031): después del bloqueo de cancha, `pg_advisory_xact_lock(2, hashtext(telefono))`; luego se cuentan las `PENDING` vigentes del teléfono y, si alcanzan `TOPE_PENDIENTES_POR_TELEFONO` (2), se responde 429.
  - El espacio de claves de dos enteros es distinto del de la cancha.
  - El orden de los bloqueos es fijo, así que no hay deadlocks.
- El almacén en memoria del limitador basta para una sola instancia; Redis se descarta por ahora.

### Decisión 10: token de acceso y vistas

- `tokenAcceso.ts`:
  - `generarToken()` usa `randomBytes(32).toString("base64url")` y produce 43 caracteres;
  - `hashearToken()` devuelve el SHA-256 en hexadecimal;
  - `TOKEN_VALIDO = /^[A-Za-z0-9_-]{43}$/`.
- Un token con formato inválido recibe el mismo 404 genérico sin consultar la base.
- La vista pública y la de administrador se arman con un mapeo explícito de campos (lista blanca). `omit` de Prisma es preliminar en la versión 5.22.
- La vista pública no expone pagos. La de administrador incluye `payments` (decisión 11).

### Decisión 11: tabla `BookingPayment` con motivo persistido

**Elección:**

```prisma
enum RefundReason {
  AMOUNT_MISMATCH
  SLOT_TAKEN
  PAID_AFTER_CANCEL
  DUPLICATE_PAYMENT
  OWNER_DISCRETION
}

// La migración 20261119120000_reserva_invitado agrega restricciones que Prisma no
// representa: booking_payments_motivo_coherente y booking_payments_un_pago_valido.
model BookingPayment {
  id           String        @id @default(uuid()) @db.Uuid
  bookingId    String        @map("booking_id") @db.Uuid
  mpPaymentId  String        @unique @map("mp_payment_id") @db.VarChar(30)
  amount       Decimal       @db.Decimal(10, 2)
  isValid      Boolean       @map("is_valid")
  refundReason RefundReason? @map("refund_reason")
  refundedAt   DateTime?     @map("refunded_at") @db.Timestamptz()
  createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz()

  booking      Booking       @relation(fields: [bookingId], references: [id], onDelete: Restrict)

  @@index([bookingId])
  @@map("booking_payments")
}
```

Restricciones manuales de la migración A:

```sql
-- Un pago válido solo puede no tener motivo o estar a criterio del canchero;
-- un pago no válido siempre tiene un motivo de reembolso obligatorio.
ALTER TABLE "booking_payments"
  ADD CONSTRAINT "booking_payments_motivo_coherente"
  CHECK (
    ("is_valid" AND ("refund_reason" IS NULL OR "refund_reason" = 'OWNER_DISCRETION'))
    OR (NOT "is_valid" AND "refund_reason" IS NOT NULL AND "refund_reason" <> 'OWNER_DISCRETION')
  );

-- A lo sumo un pago válido vigente (sin reembolso) por reserva.
-- Un pago válido ya reembolsado no impide aceptar un nuevo pago válido.
ALTER TABLE "booking_payments"
  ADD CONSTRAINT "booking_payments_un_pago_valido"
  EXCLUDE USING btree ("booking_id" WITH =) WHERE ("is_valid" AND "refunded_at" IS NULL);
```

- **Coherencia del `CHECK` con el ciclo de un pago válido:** el `CHECK` no mira `refunded_at`, así que cada paso conserva una combinación permitida:
  1. se crea con `isValid` verdadero y sin motivo;
  2. al cancelar pasa a `OWNER_DISCRETION`;
  3. al reembolsar se fija `refundedAt`.

  En los tres pasos `isValid` sigue verdadero y el motivo es nulo u `OWNER_DISCRETION`. Al fijar `refundedAt`, la fila sale del predicado de la exclusión y libera el lugar para un nuevo pago válido.
- `cancelarEnTransaccion` solo marca los pagos válidos sin reembolso, y `pagoValidoVigente` también ignora los reembolsados. Las tres reglas (base de datos, webhook y derivados) usan la misma definición de "válido vigente".

- **El motivo se guarda, no se deriva.** `SLOT_TAKEN`, `PAID_AFTER_CANCEL` y `DUPLICATE_PAYMENT` dependen del estado de la reserva y de sus otros pagos **en el instante del webhook**; después ya no se pueden reconstruir. Por ejemplo, una reserva `CANCELLED` no permite saber si el pago llegó antes o después de la cancelación. `OWNER_DISCRETION` se escribe al cancelar (decisión 6). `isValid` se guarda por el mismo motivo: una vez cancelada la reserva, ya no se puede saber qué pago la confirmó.
- **Exclusión en lugar de índice único parcial:** Prisma 5 no representa índices parciales y, en una migración posterior, propondría borrar un índice que no conoce. Las restricciones de exclusión, como la `bookings_sin_solapamiento` existente, quedan fuera de su gestión. `EXCLUDE USING btree` con `=` no requiere `btree_gist`.
- **Reembolso por pago (PAG-024):** `PaymentService.reembolsarPago(idPago)`:
  - responde 404 si la fila no existe, y 409 si `refundReason` es nulo o `refundedAt` no es nulo (en ese caso no llama a Mercado Pago);
  - consulta antes el pago en Mercado Pago (`obtenerPago`): si ya figura `refunded` (un intento anterior reembolsó pero no llegó a registrarlo), no llama a `reembolsarPago` y solo fija `refundedAt`;
  - si no, llama al adaptador con una clave de idempotencia por intento, `reembolso-<bookingPaymentId>-<uuid>`. Mercado Pago guarda la respuesta fallida de una clave (T-0.3, comprobación 5), así que una clave fija por pago bloquearía para siempre el reembolso tras un primer fallo. El doble reembolso lo evitan el `updateMany` de abajo y el propio Mercado Pago, que rechaza un reembolso mayor al saldo no reembolsado;
  - si Mercado Pago acepta, ejecuta `updateMany where { id, refundedAt: null }` con `refundedAt` igual a ahora;
  - si falla, responde 502 "No se pudo procesar el reembolso con Mercado Pago.", sin detalle interno y con `refundedAt` nulo.

  Un pago válido sin motivo (la reserva sigue activa) no es reembolsable.

**Alternativas consideradas:**

- Columnas de pago en `Booking` (el diseño anterior). Se descarta por decisión del usuario: no registra más de un pago.
- Derivar `refundReason` a partir del estado actual. Se descarta por la pérdida de información descrita arriba.
- Un índice único parcial. Se descarta porque Prisma lo borraría.
- `PaymentRefund.total`. Se descarta: la instrucción del usuario fija `create`, y sin `amount` produce el mismo efecto.

**Justificación:** cada pago aprobado queda en la base con su motivo y se reembolsa de forma individual. La base garantiza la coherencia entre `isValid` y `refundReason`, y que haya a lo sumo un pago válido sin reembolso por reserva.

### Decisión 12: recaudación de las métricas

**Elección:** `totalRevenueARS` sigue sumando solo las reservas `CONFIRMED`, con `Prisma.Decimal`:

- una reserva de invitado (con `depositAmount`) aporta el `amount` de su pago válido no reembolsado; si fue confirmada a mano sin pago, aporta 0;
- una reserva con cuenta aporta `totalPrice`, como hoy, hasta `politica-cobro`.

La consulta incluye `payments: { where: { isValid: true, refundedAt: null }, select: { amount: true } }`. La forma JSON de la respuesta no cambia.

**Justificación:** la recaudación de un invitado es lo que efectivamente cobró online.

## Flujo de datos

Creación de invitado:

```
POST /public/bookings ─→ limitador ─→ controlador (Zod) ─→ ReservaInvitadoService.crear
  ├─ validarTurnoReservable + depositPercent; verificar configuración de Mercado Pago (503)
  ├─ conBloqueoDeCancha: liberar ─→ bloquearTelefono + tope (429) ─→ create PENDING ─→ EXCLUDE (409)
  ├─ crearPreferencia(seña, venceEn = expiresAt, back_urls /reserva/<token>)
  │     └─ falla ─→ conBloqueoDeCancha: PENDING → CANCELLED ─→ 5xx sin token
  ├─ guardar mpPreferenceId
  └─ 201 { token, initPoint }
```

Pago aprobado:

```
webhook ─→ firma ─→ obtenerPago ─→ approved ─→ conBloqueoDeCancha
   └─ ¿existe mpPaymentId? ─→ releer reserva y pago válido ─→ tabla de la decisión 7
        ─→ insertar BookingPayment (isValid, refundReason) [+ updateMany de la reserva]
```

Cancelación:

```
servicio ─→ conBloqueoDeCancha ─→ liberar ─→ releer + validar ─→ cancelarEnTransaccion
                                                (pago válido → OWNER_DISCRETION; depositPaidAtCancel)
        commit ─→ invalidarLinkDePago(mpPreferenceId)
```

Reembolso:

```
POST /payments/admin/payments/:paymentId/refund ─→ validar motivo y refundedAt ─→ PaymentRefund.create(idempotencyKey)
        ─→ refundedAt = ahora ─→ 200 con la reserva y sus pagos
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/prisma/schema.prisma` | Modificar | `EXPIRED`, `RefundReason`, `BookingPayment`, campos de la decisión 2, `user User?`, índices y comentarios de las restricciones manuales. |
| `backend/prisma/migrations/20261119120000_reserva_invitado/migration.sql` | Crear | Migración A. |
| `backend/prisma/migrations/20261119120100_sin_solapamiento_excluye_vencidas/migration.sql` | Crear | Migración B. |
| `backend/src/core/integraciones/mercadoPago.ts` | Crear | Adaptador del SDK. |
| `backend/src/core/middlewares/limitadorPublico.ts` | Crear | Limitadores públicos. |
| `backend/src/app.ts` | Modificar | `trust proxy` y rutas `/api/v1/public`. |
| `backend/src/server.ts` | Modificar | Arranque del barrido. |
| `backend/src/modules/bookings/vencimiento.ts`, `barridoVencidas.ts` y `filtrosReserva.ts` | Crear | Decisiones 3 y 4. |
| `backend/src/modules/bookings/estadoSena.ts` | Crear | Estado efectivo y derivados a partir de los pagos. |
| `backend/src/modules/bookings/cancelacionReserva.ts` y `linkDePago.ts` | Crear | Decisión 6. |
| `backend/src/modules/bookings/bloqueoCancha.ts` | Modificar | `bloquearTelefono`. |
| `backend/src/modules/bookings/booking.service.ts` | Modificar | `EXPIRED` en las transiciones; `puedeTransicionar` y `validarTurnoReservable` exportados; cancelación y cambio de estado bajo el bloqueo; filtros; vistas de administrador con `payments`. |
| `backend/src/modules/bookings/booking.dto.ts` | Sin cambios | `actualizarEstadoSchema` ya rechaza `EXPIRED` (RES-035); se cubre con una prueba. |
| `backend/src/modules/courts/court.service.ts` | Modificar | `filtroOcupaTurno` (CAN-006). |
| `backend/src/modules/admin/*` | Modificar | `filtroNoVencida` y recaudación (decisión 12); `depositPercent`. |
| `backend/src/modules/payments/payment.service.ts` | Modificar | Adaptador; PAG-004; `reemplazarPreferenciaVigente`; webhook (decisión 7); `reembolsarPago`. |
| `backend/src/modules/payments/payment.controller.ts`, `payments.routes.ts` y `payment.dto.ts` | Modificar | Ruta de reembolso por pago. |
| `backend/src/modules/public/*` | Crear | Rutas, controlador, DTO, `reservaInvitado.service.ts` y `tokenAcceso.ts`. |
| `backend/tests/*.test.ts` | Crear y modificar | Ver la estrategia de pruebas. |
| `frontend/src/types/index.ts` | Modificar | `EXPIRED`, `userId: string \| null`, datos de invitado, `BookingPayment`, `RefundReason` y vista pública. |
| `frontend/src/App.tsx` | Modificar | Ruta `/reserva/:codigo`. |
| `frontend/src/pages/BookingsPage.tsx` | Modificar | Formulario de invitado (RES-020). |
| `frontend/src/pages/ReservaInvitadoPage.tsx` | Crear | RES-034. |
| `frontend/src/utils/whatsapp.ts` | Crear | Enlace `wa.me` (ADM-016). |
| `frontend/src/pages/AdminDashboard.tsx` | Modificar | ADM-016, ADM-017 (lista de pagos a reembolsar por reserva, con motivo y un botón por pago), ADM-018 y RES-022. |
| `docs/operacion/variables-entorno.md` | Modificar | Variables nuevas. |

## Interfaces y contratos

```ts
// backend/src/modules/bookings/estadoSena.ts
export type EstadoSena = "PENDING" | "PAID" | "REFUNDED";
export type ReembolsoPendiente = "REQUIRED" | "AT_DISCRETION";
type PagoDeReserva = Pick<BookingPayment, "isValid" | "refundReason" | "refundedAt" | "amount">;

export const pagoValidoVigente = (pagos: PagoDeReserva[]): PagoDeReserva | null =>
  pagos.find((p) => p.isValid && p.refundedAt === null) ?? null;

export const derivarEstadoSena = (
  reserva: Pick<Booking, "depositAmount">,
  pagos: PagoDeReserva[],
): EstadoSena | null => {
  if (reserva.depositAmount === null) return null;
  if (pagoValidoVigente(pagos)) return "PAID";
  return pagos.some((p) => p.isValid) ? "REFUNDED" : "PENDING";
};

export const derivarReembolsoPendiente = (pagos: PagoDeReserva[]): ReembolsoPendiente | null => {
  const pendientes = pagos.filter((p) => p.refundReason !== null && p.refundedAt === null);
  if (pendientes.length === 0) return null;
  return pendientes.every((p) => p.refundReason === RefundReason.OWNER_DISCRETION)
    ? "AT_DISCRETION"
    : "REQUIRED";
};
```

```ts
// Vista de administrador (RES-013 y ADM-008): agrega a la reserva
interface VistaPagoAdmin {
  id: string;
  mpPaymentId: string;
  amount: number;
  isValid: boolean;
  refundReason: RefundReason | null;
  refundedAt: string | null;   // ISO UTC
  createdAt: string;
}
// payments: VistaPagoAdmin[]; depositStatus; refundDue

// Vista pública (RES-028): status efectivo, startTime, endTime, expiresAt, totalPrice,
// depositAmount, depositStatus, guestFirstName, refundAtOwnerDiscretion, court { name, sport }
```

- `refundAtOwnerDiscretion`:
  - en `GET`, se calcula con `devolucionACriterioDelCanchero`;
  - en la respuesta de la cancelación, es el `depositPaidAtCancel` devuelto por `cancelarEnTransaccion`.
- La entrada de creación (`public.dto.ts`):
  - `guestFirstName` y `guestLastName`: `trim`, de 1 a 100 caracteres;
  - `guestPhone`: se normaliza quitando espacios, guiones, paréntesis y un `+` inicial, y debe quedar con 8 a 15 dígitos;
  - `guestEmail`: correo válido, opcional;
  - `fechaHoraSchema` se mueve a `core/validacion/esquemas.ts`.
- Seña (PAG-022): `totalPrice.mul(depositPercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`.
- Mensajes:

  | Caso | Código | Mensaje |
  |---|---|---|
  | Reserva cancelada (PAG-004 y PAG-021) | 409 | "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva." |
  | Resto de los estados no pagables y reserva con pago válido | 409 | "Esta reserva no se puede pagar." |
  | Carrera al reemplazar la preferencia | 409 | "La reserva cambió mientras se generaba el pago. Intenta de nuevo." |
  | Token inexistente o inválido | 404 | "Reserva no encontrada." |
  | Tope por teléfono | 429 | "Este teléfono ya tiene reservas pendientes de pago. Completa el pago o espera a que venzan." |
  | Falla del reembolso | 502 | "No se pudo procesar el reembolso con Mercado Pago." |

- Etiquetas del panel por motivo:

  | Motivo | Etiqueta |
  |---|---|
  | `AMOUNT_MISMATCH` | "Reembolso obligatorio: monto no coincide" |
  | `SLOT_TAKEN` | "Reembolso obligatorio: pago sin turno" |
  | `PAID_AFTER_CANCEL` | "Reembolso obligatorio: pagó después de cancelar" |
  | `DUPLICATE_PAYMENT` | "Reembolso obligatorio: pago duplicado" |
  | `OWNER_DISCRETION` | "Seña sin reembolsar: a criterio del canchero" |

## Estrategia de pruebas

TDD estricto en el backend (`cd backend && npm test`). Las pruebas HTTP usan supertest contra `app`, con `prisma` simulado (`vi.mock("../src/core/config/prisma.js")`) y Mercado Pago simulado (adaptador o `mercadopago`).

| Capa | Qué probar | Cómo |
|---|---|---|
| Unitaria | `estadoSena.ts`: `depositStatus` con pagos válidos, reembolsados y `AMOUNT_MISMATCH`; `refundDue` con mezclas de motivos. También la seña (300.00, 3.32 y 100 %), la recaudación (invitado con y sin pago válido; cuenta con `totalPrice`), el teléfono, el token y `trust proxy` | Funciones puras. |
| Unitaria con temporizadores | Barrido (RES-027) | `vi.useFakeTimers`. |
| HTTP simulada | RES-023 a RES-035, PAG-004, PAG-020, PAG-021 (409 solo con un pago válido) y PAG-025; `reemplazarPreferenciaVigente` con 1 y 0 filas; la cancelación marca `OWNER_DISCRETION`; ADM-015 | Transacción simulada con `booking` y `bookingPayment` (`findUnique`, `findFirst`, `create`, `updateMany` y `count`). |
| HTTP simulada (webhook) | Las diez filas de la decisión 7: el idempotente no escribe; `AMOUNT_MISMATCH` en cada estado; `DUPLICATE_PAYMENT`; `PAID_AFTER_CANCEL`; `SLOT_TAKEN` y su respaldo ante `ConflictError`; rechazos sin escrituras | Reescribir `webhookPago.test.ts`. La prueba de las líneas 179 a 190 pasa a esperar `CANCELLED` con una fila `PAID_AFTER_CANCEL`. |
| HTTP simulada (reembolso) | 401, 403, 404, 409 (sin motivo o ya reembolsado), 200 con `refundedAt` y 502 con `refundedAt` nulo; la clave de idempotencia es por pago | Archivo nuevo. |
| HTTP simulada (límites) | RES-030 | `vi.stubEnv` antes de `await import("../src/app.js")`. |
| Base descartable | Migraciones A y B; restricciones `EXPIRED` (RES-009), `CHECK` de titular, `booking_payments_motivo_coherente` a lo largo del ciclo válido → `OWNER_DISCRETION` → reembolsado; un solo pago válido sin reembolso por reserva, con un nuevo pago válido aceptado después de un reembolso; `mpPaymentId` único; concurrencias de RES-007, RES-029, RES-031 y webhook contra cancelación; que un `migrate dev` posterior no proponga borrar las restricciones manuales | `describe.skipIf(!process.env.DATABASE_URL_PRUEBA)`; **nunca** contra la base de desarrollo. |
| Frontend | Sin pruebas automatizadas hasta `calidad-ci` | `lint`, `build` y verificación manual en el sandbox. |

Pruebas existentes que cambian: `webhookPago`, `preferenciaPago`, `validacionReservas`, `rutasAdminReservas`, `metricasAdmin` e `integration`.

## Matriz de amenazas

N/A: no hay enrutamiento de agentes, shell, subprocesos, automatización de VCS o PR, clasificación de ejecutables ni integración de procesos.

Las amenazas de la API pública se cubren con requisitos y pruebas:

- enumeración de tokens: 404 idéntico y limitador;
- fuga de datos: vistas en lista blanca;
- abuso: RES-030 y RES-031;
- falsificación de IP: `trust proxy` explícito;
- monto manipulado: el monto se lee de la base y se clasifica `AMOUNT_MISMATCH`;
- doble reembolso: la clave de idempotencia por pago y `updateMany where refundedAt: null`.

## Migración y despliegue

1. Respaldar la base y ejecutar `npx prisma migrate deploy`, que aplica A y B.
2. Desplegar el código después de las dos migraciones.
3. Configurar las variables nuevas, todas con valor por defecto: `TRUST_PROXY`, `LIMITE_CREACION_PUBLICA_MAXIMO`, `LIMITE_CREACION_PUBLICA_VENTANA_MS`, `LIMITE_CONSULTA_PUBLICA_MAXIMO` y `TOPE_PENDIENTES_POR_TELEFONO`. Documentarlas en `docs/operacion/variables-entorno.md`.
4. Datos existentes: ninguna reserva tiene `expiresAt` y no hay ids de pago guardados que migrar (decisión 1). Las `CANCELLED` previas quedan con `depositPaidAtCancel` nulo y sin pagos.

### Entregas

Estrategia `ask-on-risk`, con un presupuesto de ~400 líneas por entrega (agregadas más eliminadas, pruebas incluidas). Los commits los hace el usuario en `desarrollo`.

| N.º | Entrega | Requisitos | Pruebas | Líneas estimadas |
|---|---|---|---|---|
| 1 | Esquema (`BookingPayment`, `RefundReason` y campos de `Booking`), migraciones A y B con las restricciones manuales, `EXPIRED` en las transiciones, vencimiento, barrido, ajuste de tipos | RES-009, RES-014, RES-026, RES-027, RES-033, RES-035 | Barrido; 400 con `EXPIRED`; base descartable para las restricciones | ~400 |
| 2 | Filtros de lectura y recaudación con pagos | RES-007 (lectura), RES-012, RES-013 (filtro), CAN-006, ADM-004, ADM-005 | HTTP simuladas | ~260 |
| 3 | Adaptador, PAG-004, `reemplazarPreferenciaVigente` para reservas con cuenta, `cancelacionReserva` con `OWNER_DISCRETION`, RES-011 y RES-015 bajo el bloqueo, PAG-025 | PAG-004, PAG-005, PAG-006, PAG-025, RES-011, RES-015 | HTTP simuladas | ~410 |
| 4 | `POST /public/bookings` | RES-006, RES-023 a RES-025, RES-030 a RES-032, PAG-020, PAG-022 | HTTP simuladas, límites y base descartable | ~400 |
| 5 | Webhook con `BookingPayment` y las diez ramas | PAG-012 a PAG-016 | `webhookPago.test.ts` reescrito | ~440 |
| 6 | Rutas por token, `estadoSena.ts`, reintento con 409 solo ante un pago válido, limitador de consulta | RES-028, RES-029, PAG-021, PAG-023 | Unitarias y HTTP simuladas | ~380 |
| 7 | Vistas de administrador con `payments`, `depositPercent` y reembolso por pago | RES-013 (campos), ADM-008, ADM-015, PAG-024 | HTTP simuladas | ~400 |
| 8 | Frontend público | RES-020, RES-034 | `lint`, `build` y verificación manual | ~420 |
| 9 | Frontend del panel: invitado, `wa.me`, lista de pagos a reembolsar con motivo y botón por pago, `depositPercent` | RES-022, ADM-016, ADM-017, ADM-018 | `lint`, `build` y verificación manual | ~440 |

Total estimado: ~3.550 líneas.

- Las entregas 5 y 9 superan el presupuesto. Opciones de división:
  - en la 5, las ramas de confirmación por un lado y las ramas de reembolso con el respaldo de `SLOT_TAKEN` por otro;
  - en la 9, la presentación del invitado y `wa.me` por un lado, y los pagos, el reembolso y `depositPercent` por otro.
- Las entregas 1, 3, 4, 7 y 8 están en el límite.
- La fase de tareas decide las divisiones.

## Preguntas abiertas

- [ ] **Validar en base descartable** la necesidad de las dos migraciones, el uso de `'OWNER_DISCRETION'` en el `CHECK` de la migración A y que un `migrate dev` posterior no proponga borrar `booking_payments_un_pago_valido` ni `booking_payments_motivo_coherente`.
- [x] **Sandbox de Mercado Pago** (resuelta en T-0.3; la clave de idempotencia sí guarda las respuestas fallidas y pasó a ser por intento):
  - que la expiración por `update` impide pagar;
  - que acepta el sufijo `Z`;
  - que reenviar los `items` no altera la preferencia;
  - que `PaymentRefund.create` sin `amount` reembolsa el total;
  - si la clave de idempotencia guarda las respuestas fallidas. Si es así, la clave necesita un componente por intento.
- [ ] **Operación:** el limitador en memoria aplica el límite por instancia.
