# Propuesta: reserva-invitado

Copia en Engram: `sdd/reserva-invitado/proposal`. Exploración: `openspec/changes/reserva-invitado/exploration.md`. Decisiones de producto: `docs/producto/decisiones.md` (DP-04 enmendada, DP-09 a DP-14). Hoja de ruta: cambio N.º 3.

## Intención

Hoy solo se puede reservar con una cuenta, y toda reserva nace `CONFIRMED` antes de cualquier pago (punto A3 de la auditoría). Quien inicia un pago por Mercado Pago ocupa el turno aunque nunca pague.

Este cambio permite reservar sin cuenta, con nombre, apellido y teléfono de WhatsApp. La reserva de invitado queda `PENDING` hasta que se aprueba la seña por Mercado Pago y libera el turno sola a los 15 minutos si no se paga. El invitado consulta y cancela su reserva desde un link privado, y el canchero gestiona las reservas de invitado desde el panel (contacto por `wa.me`, estado de la seña y reembolso manual).

**Por qué ahora:** la DP-14 fija que la reserva de invitado se implementa antes del multi-tenant, sobre el negocio único actual. Es la primera funcionalidad de producto que reduce la fricción del jugador y resuelve el punto A3 para las reservas de invitado.

## Decisiones tomadas

| N.º | Decisión | Origen |
|---|---|---|
| D1 | **Pago rechazado:** se ignora en todas las reservas, de invitado o con cuenta. Un rechazo nunca cancela una reserva, porque el usuario puede reintentar con otra tarjeta. La reserva de invitado sigue `PENDING` hasta que vence, a los 15 minutos. | Usuario (Q4 y confirmación del 2026-11-17) |
| D2 | **Seña:** porcentaje del precio del turno, configurable por el canchero en `Complex.depositPercent`. Valor por defecto 30; rango válido de 1 a 100. Con 100 se cobra online el precio completo. | Usuario (Q1) |
| D3 | **Vencimiento:** no se agrega un estado `EXPIRED`. Vencer es un UPDATE físico a `CANCELLED`. Un pago aprobado tardío reactiva la reserva si el turno sigue libre; si el turno está ocupado, se guarda el id del pago y la reserva queda marcada para reembolso manual en el panel. | Exploración (Q2) |
| D4 | **Estado del reembolso:** alcanza con `refundedAt`. El estado de la seña (pendiente, pagada, reembolsada) se deriva de los campos de la reserva. | Exploración (Q3) |
| D5 | **Medio de pago:** los pagos confirmados por Mercado Pago guardan `paymentMethod = MERCADOPAGO` en lugar de `TRANSFER`. | Exploración (Q5) |
| D6 | **SDK de Mercado Pago:** verificar `expires`, `expiration_date_to` y `PaymentRefund` es una tarea de la fase de diseño, con la documentación actual del SDK (context7). | Exploración (Q6) |

Consecuencia de D1: un pago `rejected` o `cancelled` deja de cancelar reservas `CONFIRMED` (hoy lo hace, observación 3 de `pagos`). La spec debe expresarlo como regla general del webhook: un pago `rejected` o `cancelled` nunca cancela una reserva, cualquiera sea su estado o su origen, y una `PENDING` de invitado se deja vencer.

## Alcance

### Dentro del alcance

1. **Esquema y migración:**
   - `Booking`: `userId` opcional; `guestFirstName`, `guestLastName`, `guestPhone` y `guestEmail` opcional; `expiresAt`, `depositAmount`, `refundedAt`, `mpPaymentId` y `accessTokenHash` único; índice `(status, expiresAt)`.
   - `Complex`: `depositPercent` (por defecto 30, entre 1 y 100).
   - Migración creada con `--create-only`, revisada a mano para conservar la restricción `bookings_sin_solapamiento`, con un `CHECK` de titular (cuenta o teléfono de invitado).
2. **Vencimiento:** cancelación de las `PENDING` vencidas dentro del bloqueo de cancha antes de crear reservas, un barrido periódico cada 60 segundos, y lecturas de ocupación, agenda y métricas que excluyen las `PENDING` vencidas. Una reserva sin `expiresAt` nunca vence.
3. **API pública `/api/v1/public`:**
   - `POST /public/bookings`: crea la reserva `PENDING` con vencimiento a 15 minutos y la preferencia de la seña; devuelve `{ token, initPoint }` y compensa cancelando la reserva si Mercado Pago falla.
   - `GET /public/bookings/:token`: consulta con campos públicos; 404 genérico si el token no existe.
   - `PATCH /public/bookings/:token/cancel`: cancelación bajo el bloqueo de cancha y con las transiciones permitidas.
   - Token aleatorio de 32 bytes en base64url; solo se persiste su SHA-256.
   - Límites de abuso: limitador por IP que cuenta todas las solicitudes, tope de reservas `PENDING` activas por teléfono y configuración de `trust proxy`.
4. **Pagos:**
   - Preferencia de seña para el invitado: cobra `depositAmount`, retorna a `/reserva/<token>` y vence junto con la reserva.
   - Webhook rediseñado: lectura y validación de la transición dentro del bloqueo, monto comparado contra `depositAmount` (o `totalPrice` si no hay seña), `mpPaymentId` guardado y usado para la idempotencia, `MERCADOPAGO` como medio de pago, pago tardío según D3 y pago rechazado según D1.
   - Reembolso de la seña iniciado por el canchero, con registro en `refundedAt`.
5. **Frontend:**
   - `BookingsPage`: formulario de invitado cuando no hay sesión; crea la reserva por la API pública y redirige a `initPoint`.
   - Página nueva `/reserva/:codigo`: estado, cuenta regresiva, botón de pago y de cancelación, con horarios en UTC.
   - `AdminDashboard`: marca de invitado y teléfono, estado de la seña, botón `wa.me`, botón de reembolso, marca de reembolso pendiente por pago tardío y ajuste de `depositPercent`.
   - Helper `utils/whatsapp.ts` y tipos con `userId: string | null`.
6. **Pruebas del backend** (TDD estricto): nuevas para cada entrega y ajuste de las existentes afectadas (`validacionReservas`, `webhookPago`, `preferenciaPago`, `concurrenciaReservas`, `integration`).

### Fuera del alcance

- Multi-tenant y credenciales de Mercado Pago por negocio (cambios 4 y 5; DP-14).
- Vincular reservas de invitado a una cuenta por teléfono (DP-04 enmendada).
- API de WhatsApp Business: solo enlaces `wa.me` (DP-13).
- Aplicar `CourtSchedule` al crear reservas. Es una brecha existente (observación 7 de `reservas`) que también afecta al invitado; se registra, no se corrige.
- Política de cobro completa por negocio (total online, seña o pago en el lugar): cambio 6, `politica-cobro`. Este cambio solo implementa la seña del invitado.
- Punto A3 para las reservas con cuenta: el flujo con sesión sigue creando reservas `CONFIRMED` antes del pago; queda para `deuda-auditoria` o `politica-cobro`.
- Reenvío del link privado por el canchero: el token se guarda hasheado y no se puede recuperar.
- Pruebas del frontend (cambio `calidad-ci`).

## Capacidades

> Contrato con la fase de specs. Las delta specs van en `openspec/changes/reserva-invitado/specs/<dominio>/spec.md`, con requisitos marcados `[OBJETIVO]` según `convencion-specs`.

### Capacidades nuevas

- `administracion`: no existe spec base todavía (la genera `specs-base`). La delta de este cambio solo contiene `## AGREGADO` con prefijo `ADM`:
  - configuración de `depositPercent` por el canchero, con validación de 1 a 100;
  - vista de reservas de invitado en el panel (titular invitado, teléfono, estado de la seña, enlace `wa.me`);
  - reembolso manual de la seña y marca de reembolso pendiente por pago tardío sin turno.

### Capacidades modificadas

- `reservas`:
  - AGREGADO: reserva de invitado por la API pública, vencimiento a los 15 minutos, consulta y cancelación por token, límites de abuso, página `/reserva/:codigo` y formulario de invitado.
  - MODIFICADO: RES-006 (estado inicial: `PENDING` para invitado), RES-007, RES-012 y RES-013 (ocupación y agenda excluyen `PENDING` vencidas; la agenda admite titular invitado), RES-011 (cancelación de cuenta bajo el bloqueo de cancha), RES-020 (formulario de invitado sin sesión), RES-022 (el panel muestra invitados).
- `pagos`:
  - AGREGADO: preferencia de seña del invitado, reembolso de la seña y registro de `mpPaymentId`.
  - MODIFICADO: PAG-005 y PAG-006 (monto y URLs de retorno de la seña), PAG-012 (validación de transición bajo el bloqueo y `MERCADOPAGO`), PAG-013 (idempotencia por `mpPaymentId`), PAG-014 (monto contra `depositAmount`), PAG-015 (pago tardío con turno ocupado queda marcado para reembolso), PAG-016 (un rechazo no cancela ninguna reserva).

### Observaciones de las specs base que resuelve

| Spec | Observación | Cómo |
|---|---|---|
| `reservas` | 1 (nacen `CONFIRMED`, A3) | Resuelta solo para invitados: nacen `PENDING`. |
| `reservas` | 2 (`cancelBooking` sin bloqueo) | La cancelación usa `conBloqueoDeCancha`. |
| `reservas` | 4 (pagos sin transiciones ni bloqueo) | El webhook valida transiciones dentro del bloqueo. |
| `pagos` | 1 (turno ocupado sin pagar) | Resuelta para invitados: la `PENDING` vence a los 15 minutos. |
| `pagos` | 2 (webhook sin transiciones; rechazo sin bloqueo) | Validación dentro del bloqueo; el rechazo deja de cancelar. |
| `pagos` | 3 (rechazo cancela `CONFIRMED`) | Un rechazo ya no cancela reservas. |
| `pagos` | 4 (`TRANSFER` en lugar de `MERCADOPAGO`) | Se guarda `MERCADOPAGO` (D5). |
| `pagos` | 5 (sin id de pago; idempotencia por estado) | Se guarda `mpPaymentId` y se usa para la idempotencia. |
| `pagos` | 7 (cobrado sin reserva, solo log) | Marca de reembolso en el panel y reembolso manual. |

Parcialmente: `pagos` 9 (se guarda el pago, no la preferencia) y `pagos` 14 (el invitado vuelve a `/reserva/<token>`, que muestra el estado). Siguen abiertas las observaciones 5, 6, 7 y 9 a 16 de `reservas`, y 6, 8, 10 a 13 y 15 a 17 de `pagos`.

## Enfoque

- **Vencimiento por cancelación física:** `liberarReservasVencidas(tx, courtId?)` corre dentro de `conBloqueoDeCancha` antes de crear reservas, y un barrido global corre cada 60 segundos en `server.ts`. Así la restricción `EXCLUDE` libera el turno sin modificarla. Se descartan un estado `EXPIRED` (obliga a recrear restricción, enum y transiciones) y el filtro solo en lecturas (no libera el turno en la base).
- **Reutilización:** `validarTurnoReservable` y las transiciones permitidas (se exporta `puedeTransicionar`) son compartidas entre la reserva con cuenta y la de invitado.
- **API pública separada** en `/api/v1/public` con su propio limitador, para no mezclar reglas de sesión con reglas de invitado. Controladores delgados; la lógica vive en servicios.
- **Token de acceso:** aleatorio, devuelto una sola vez y persistido como SHA-256.
- **Webhook:** todo cambio de estado ocurre dentro del bloqueo de cancha con lectura y validación en la misma transacción; el pago tardío y el rechazo siguen D1 y D3.
- **Frontend:** fechas en UTC y sin `setState` síncrono en efectos; tipos sin `any`.

## Entregas

Presupuesto de revisión de ~400 líneas por entrega. Estrategia `ask-on-risk`: las entregas 3, 5 y 6 rozan el presupuesto y la fase de tareas debe decidir si se dividen. **Los commits los hace el usuario**; cada entrega es una unidad de trabajo con sus pruebas, en la rama `desarrollo`.

| N.º | Entrega | Líneas estimadas |
|---|---|---|
| 1 | Esquema, migración, `liberarReservasVencidas`, filtros de ocupación, barrido y pruebas | ~300 |
| 2 | `POST /public/bookings` (DTO, servicio, limitador, token, `trust proxy`) y pruebas | ~320 |
| 3 | Preferencia de seña, `depositPercent`, webhook rediseñado y pruebas | ~420 |
| 4 | `GET` y `PATCH` por token, y pruebas | ~200 |
| 5 | Frontend público: formulario, página `/reserva/:codigo` y tipos | ~420 |
| 6 | Panel, `wa.me` y reembolso (backend y frontend) | ~420 |

Total estimado: ~2.080 líneas.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/prisma/schema.prisma` y `backend/prisma/migrations/` | Modificado y nuevo | Campos de invitado, seña, vencimiento, token y pago; `depositPercent`; `CHECK` de titular. |
| `backend/src/modules/bookings/` | Modificado | Vencimiento, filtros de ocupación, cancelación con bloqueo, `puedeTransicionar` exportado. |
| `backend/src/modules/public/` | Nuevo | Rutas, controlador, servicio y DTO de la API pública. |
| `backend/src/modules/payments/` | Modificado | Preferencia de seña, webhook rediseñado y reembolso. |
| `backend/src/modules/courts/court.service.ts` | Modificado | Disponibilidad excluye `PENDING` vencidas. |
| `backend/src/modules/admin/` | Modificado | `depositPercent`, métricas sin `PENDING` vencidas y reembolso. |
| `backend/src/core/middlewares/` y `backend/src/app.ts` | Modificado | Limitador público y `trust proxy`. |
| `backend/src/server.ts` | Modificado | Barrido periódico. |
| `backend/tests/` | Modificado y nuevo | Pruebas nuevas y ajuste de las existentes. |
| `frontend/src/pages/BookingsPage.tsx`, `AdminDashboard.tsx` | Modificado | Formulario de invitado y panel de invitados. |
| `frontend/src/pages/ReservaInvitadoPage.tsx`, `frontend/src/utils/whatsapp.ts` | Nuevo | Link privado y enlaces `wa.me`. |
| `frontend/src/types/index.ts` y rutas | Modificado | `userId` nulo y ruta `/reserva/:codigo`. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Ocupación abusiva de turnos con reservas `PENDING` | Media | Limitador que cuenta todas las solicitudes, tope por teléfono y vencimiento a 15 minutos. |
| Pago cobrado sin turno (pago tardío con turno ocupado) | Baja | Se guarda `mpPaymentId`, se marca para reembolso y se muestra en el panel. |
| Prisma propone borrar la restricción `EXCLUDE` en la migración | Media | `--create-only`, revisión manual y prueba de concurrencia contra base descartable. |
| `trust proxy` mal configurado anula el límite por IP | Media | Configuración explícita y documentada en `docs/operacion/`. |
| `userId` nulo rompe consumidores que asumen `booking.user` | Media | Tipos `string \| null`, `tsc` en backend y `npm run build` en frontend. |
| Campos del SDK (`expires`, `expiration_date_to`, `PaymentRefund`) distintos de lo supuesto | Media | Verificación en la fase de diseño (D6). |
| El invitado pierde el link y el canchero no puede reenviarlo | Media | Aceptado: el canchero lo contacta por `wa.me`; la vinculación por teléfono queda para después. |
| Entregas 3, 5 y 6 superan levemente las 400 líneas | Media | Decisión de división en la fase de tareas (`ask-on-risk`). |
| Pruebas con base no ejecutables sin PostgreSQL | Alta | Ejecutarlas contra una base descartable; nunca la de desarrollo. |
| Cambios sin commitear en `desarrollo` sobre archivos que este cambio toca (`booking.*`, `AdminDashboard.tsx`, `BookingsPage.tsx`) | Media | Integrarlos o descartarlos antes de la entrega 1. |

## Plan de reversa

- **Por entrega:** cada entrega es una unidad de trabajo independiente en `desarrollo`; se revierte con `git revert` de su commit, en orden inverso si varias dependen entre sí.
- **Migración:** acompañarla de un SQL de reversa probado en base descartable que elimine las columnas nuevas, el índice y el `CHECK`, y vuelva `user_id` a `NOT NULL`. Antes de revertir con datos reales, cancelar o asignar las reservas de invitado existentes, porque no tienen `user_id`. La restricción `bookings_sin_solapamiento` no se toca en ningún sentido.
- **Funcional sin revertir código:** retirar las rutas `/api/v1/public` y el formulario de invitado; el barrido de vencidas es inocuo sin reservas `PENDING` con `expiresAt`.
- **Webhook:** si el rediseño falla en producción, revertir la entrega 3 restaura el comportamiento de PAG-012 a PAG-016; los `mpPaymentId` ya guardados se conservan.

## Dependencias

- Specs base de `reservas` y `pagos` (`openspec/specs/`, generadas por `specs-base`, aún sin commitear). La spec base de `administracion` no existe todavía.
- Mercado Pago configurado (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `BACKEND_URL`, `FRONTEND_URL`) y credenciales de prueba para el sandbox.
- PostgreSQL descartable para las pruebas de concurrencia e integración.
- Documentación vigente del SDK `mercadopago` (context7) para la fase de diseño.

## Criterios de éxito

- [ ] Un invitado sin cuenta reserva con nombre, apellido y teléfono, paga la seña y la reserva pasa a `CONFIRMED` con `paymentMethod = MERCADOPAGO` y `mpPaymentId` guardado.
- [ ] Una reserva de invitado sin pagar libera el turno a los 15 minutos: otro pedido por el mismo turno responde 201 y la disponibilidad lo muestra libre.
- [ ] Un pago rechazado deja la reserva `PENDING` y el invitado puede reintentar antes del vencimiento.
- [ ] Un pago aprobado tardío reactiva la reserva si el turno está libre, o la marca para reembolso en el panel si está ocupado.
- [ ] La seña se calcula con `depositPercent` (30 por defecto); valores fuera de 1 a 100 se rechazan; con 100 se cobra el precio completo.
- [ ] El invitado consulta y cancela su reserva desde `/reserva/<código>`; un token inexistente responde 404 genérico.
- [ ] El canchero ve a los invitados con teléfono, estado de la seña y enlace `wa.me`, y registra el reembolso.
- [ ] Las notificaciones repetidas del mismo pago no generan efectos adicionales.
- [ ] Los límites de abuso rechazan el exceso de solicitudes por IP y de reservas `PENDING` por teléfono.
- [ ] Las pruebas de concurrencia siguen pasando: exactamente una reserva gana el turno, sin deadlocks.
- [ ] `cd backend && npm test` y `npx tsc --noEmit` sin errores nuevos (salvo las pruebas que requieren PostgreSQL si no hay base), y `npm run lint` y `npm run build` en el frontend sin errores.
