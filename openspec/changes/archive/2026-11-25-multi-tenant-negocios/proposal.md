# Propuesta: multi-tenant-negocios

Copia en Engram: `sdd/multi-tenant-negocios/proposal`. Exploración: `openspec/changes/multi-tenant-negocios/exploration.md` (sección "Decisiones del usuario (2026-11-24)", que prevalece sobre las preguntas abiertas de la sección 8). Decisiones en Engram: `producto/multi-tenant-negocios`. Marco: ADR 0002. Hoja de ruta: cambio N.º 5.

## Intención

El sistema es single-tenant: no existe el concepto de negocio, los roles son `USER` y `ADMIN`, y varias operaciones actúan por id sin comprobar a quién pertenece el dato (S5 del `verify-report.md` de `reserva-invitado`). Con un segundo negocio en la misma instalación, un dueño podría ver o modificar reservas, canchas, seña, métricas y pagos de otro.

Este cambio introduce el negocio como unidad de aislamiento, los roles `SUPER_ADMIN`, `DUENO` y `JUGADOR`, la resolución del negocio por slug y la verificación de pertenencia en todos los servicios, sin cambiar la experiencia del negocio único actual, que pasa a ser "Negocio principal" (`principal`).

**Por qué ahora:** es el primer cambio de producto multi-tenant de la hoja de ruta y la base de N.º 6 a N.º 9. La red de seguridad (`calidad-ci-backend`, N.º 4) ya está en verde, y la deuda S5 quedó registrada para este cambio.

## Decisiones tomadas

Todas del usuario (2026-11-24); no se reabren.

| N.º | Decisión |
|---|---|
| D1 | Un negocio tiene uno o varios complejos (1:N). Aislamiento con el enfoque B: `negocioId` obligatorio en `Complex` y desnormalizado en `Booking`. |
| D2 | Slug mínimo: el backend resuelve el negocio por slug (`/api/v1/negocios/:slug/...`); el frontend tiene una ruta `/:slug` sin marca propia; hay slugs reservados. La marca es N.º 8. |
| D3 | Roles en español: `SUPER_ADMIN`, `DUENO` y `JUGADOR`. Se renombran `USER` → `JUGADOR` y `ADMIN` → `DUENO`. |
| D4 | El negocio y su dueño se crean con un endpoint de `SUPER_ADMIN` (solo alta; editar o renombrar es N.º 9). El primer `SUPER_ADMIN` lo crea la semilla. |
| D5 | El tope de reservas `PENDING` por teléfono es por negocio. |
| D6 | El prefijo `549` queda fijo (deuda conocida, fuera de alcance). |
| D7 | Los datos existentes migran al negocio "Negocio principal", slug `principal`. |
| D8 | La cuenta de jugador es global: "Mis reservas" muestra las reservas de todos los negocios e indica el negocio de cada una. |
| D9 | Slug inexistente o negocio suspendido: 404 genérico. El campo `activo` entra en el modelo; su gestión es N.º 9. |
| D10 | Una sola cuenta de dueño por negocio, garantizada con un índice único parcial en SQL manual. |

## Alcance

### Dentro del alcance

1. **Modelo y migración:**
   - Modelo `Negocio` con `nombre`, `slug` único y `activo`.
   - `Complex.negocioId` obligatorio; `Booking.negocioId` obligatorio y desnormalizado (coherente con el negocio de la cancha); `User.negocioId` opcional (solo el dueño).
   - Índice único parcial de un dueño por negocio en SQL manual, documentado con un comentario en el modelo (Prisma 5 borra los índices que no modela).
   - Migración de datos: alta de "Negocio principal" (`principal`), asignación de los complejos, reservas y la cuenta `ADMIN` existentes, y paso de las columnas a `NOT NULL`. Respaldo previo de la base de desarrollo.
   - Enum `Role`: renombre de valores y alta de `SUPER_ADMIN`, en migraciones separadas si PostgreSQL lo exige (`ADD VALUE` no se usa en la misma transacción).
   - Semilla: negocio `principal`, su dueño, un jugador y el primer `SUPER_ADMIN`.
2. **Roles y autenticación:** `JwtPayload` con los roles nuevos; `requireRole` con `DUENO` y `SUPER_ADMIN`; el registro crea `JUGADOR`; el negocio del dueño queda disponible en cada solicitud autenticada (por el JWT o por la base: lo decide el diseño).
3. **Alta de negocio por `SUPER_ADMIN`:** un endpoint que crea el negocio y su cuenta de dueño en una sola operación, con validación del formato del slug y rechazo de slugs reservados o repetidos.
4. **Pertenencia en administración, canchas, reservas y pagos:** toda operación del dueño filtra por su negocio y todo id recibido del cliente se verifica contra él; un recurso ajeno responde 404. Cubre:
   - Administración: alta y edición de canchas (`complexId` y `courtId` propios), seña del complejo (ADM-015), métricas, listado completo (ADM-008), agenda diaria, cambio de estado y creación de reservas por el dueño.
   - Pagos: reembolso manual (PAG-024) solo sobre pagos de reservas del negocio.
   - Reservas: `validarTurnoReservable` como punto único que fija `Booking.negocioId` a partir de la cancha.
5. **Resolución por slug en las rutas públicas:** `GET /api/v1/negocios/:slug`, catálogo de canchas, disponibilidad y creación de la reserva de invitado dentro del negocio del slug; 404 genérico para slug inexistente o negocio inactivo. Las rutas por token y el webhook toman el negocio de la reserva.
6. **Tope por teléfono por negocio:** la clave del bloqueo y el conteo de `PENDING` de `bloquearTelefono` incluyen el negocio (D5).
7. **Cuenta global de jugador:** el jugador autenticado reserva en cualquier negocio activo; "Mis reservas" lista las de todos e indica el negocio de cada una (D8).
8. **Frontend mínimo:** roles nuevos en `ProtectedRoute`, `Navbar` y tipos; ruta `/:slug` sin marca que sirve la página de reservas del negocio; slugs reservados que no chocan con `/login`, `/reserva`, `/mis-reservas` ni `/admin`; panel del dueño limitado a su negocio; negocio visible en "Mis reservas".
9. **Pruebas del backend** (TDD estricto): pruebas de aislamiento con dos negocios ("ajeno → 404") en cada operación de la lista del punto 4, ajuste de los fixtures existentes a los roles y al negocio, y registro de toda prueba nueva con base en `ARCHIVOS_CON_BASE`.

### Fuera del alcance

- **N.º 6 `mercadopago-por-negocio`:** credenciales de Mercado Pago por negocio. Las credenciales siguen siendo globales.
- **N.º 7 `politica-cobro`:** total online, seña o pago en el lugar por negocio. La seña actual por complejo (`depositPercent`) no cambia.
- **N.º 8 `pagina-publica-negocio`:** marca, página pública y personalización por negocio. La ruta `/:slug` de este cambio no tiene marca propia.
- **N.º 9 `panel-super-admin`:** editar, renombrar, suspender o reactivar un negocio, gestionar `activo`, cambiar de dueño y cualquier interfaz de plataforma. En N.º 5 el `SUPER_ADMIN` solo tiene el endpoint de alta: no ve ni modifica canchas, reservas, pagos ni métricas de ningún negocio (confirmado por el usuario el 2026-11-24).
- **N.º 10 `calidad-ci`:** pruebas del frontend.
- Prefijo `549` configurable (D6; deuda conocida).
- Seguridad a nivel de fila (RLS) de PostgreSQL y claves foráneas compuestas (enfoques C y D de la exploración): endurecimiento futuro.
- Empleados u otros roles por negocio; cobro de la plataforma a los negocios.
- El barrido de vencidas sigue siendo una operación de plataforma, sin filtro por negocio.
- Deuda previa ajena al aislamiento: `as unknown as JwtPayload` (`security.ts:47`) se toca solo si el cambio de payload lo exige.

## Capacidades

> Contrato con la fase de specs. Las delta specs van en `openspec/changes/multi-tenant-negocios/specs/<dominio>/spec.md`, con `## AGREGADO`, `## MODIFICADO` y `## ELIMINADO` según `convencion-specs`. La lista de IDs modificados es la esperada; la fase de specs la confirma contra las specs vigentes.

### Capacidades nuevas

- `negocios` (prefijo `NEG`): modelo del negocio (`nombre`, `slug`, `activo`); formato del slug y slugs reservados; resolución por slug con 404 genérico para slug inexistente o negocio inactivo; `GET /negocios/:slug`; alta de negocio y dueño por `SUPER_ADMIN`; una sola cuenta de dueño por negocio; regla general de aislamiento (recurso de otro negocio → 404).

### Capacidades modificadas

- `autenticacion`: AUT-001 (el registro crea `JUGADOR`), AUT-006 (contenido del token con los roles nuevos y, si el diseño lo decide, el negocio), AUT-009 (control de acceso con `SUPER_ADMIN`, `DUENO` y `JUGADOR`), AUT-012 y AUT-014 (sesión y rutas protegidas del frontend con los roles nuevos).
- `administracion`: ADM-001 (router de administración para `DUENO`), ADM-002 a ADM-008 (métricas, recaudación, detalle y listado limitados al negocio del dueño), ADM-009 (acceso al panel), ADM-015 y ADM-017 (seña y reembolso solo en el negocio propio).
- `canchas`: CAN-001, CAN-004, CAN-006 y CAN-008 (catálogo, detalle y disponibilidad públicos dentro del negocio del slug), CAN-009 a CAN-011 (alta y edición solo en complejos y canchas propios), CAN-013 (catálogo en la ruta `/:slug`).
- `reservas`: RES-001, RES-004 y RES-005 (la reserva pertenece al negocio de la cancha), RES-010 y RES-021 (Mis reservas de todos los negocios con su negocio), RES-013, RES-015 y RES-016 (agenda, cambio de estado y creación por el dueño solo en su negocio), RES-017 (control de acceso con los roles nuevos), RES-023 (creación de invitado dentro del negocio del slug), RES-031 (tope por teléfono por negocio).
- `pagos`: PAG-024 (reembolso solo de pagos de reservas del negocio del dueño). El webhook y la preferencia no cambian de comportamiento observable salvo que la fase de specs detecte lo contrario.

### Deuda S5 que cierra

| Punto | Cómo |
|---|---|
| ADM-008 sin filtro | Listado limitado al negocio del dueño. |
| ADM-015 por id de complejo | Verificación de que el complejo es del negocio del dueño. |
| PAG-024 por id de pago | Verificación de que la reserva del pago es del negocio del dueño. |
| Tope por teléfono global | Tope por negocio (D5). |
| Prefijo `549` fijo | No se cierra: queda como deuda (D6). |

## Enfoque

- **Aislamiento por columna (enfoque B):** `Complex.negocioId` es la fuente de verdad; `Booking.negocioId` se desnormaliza para filtrar directo en listados, métricas y el tope por teléfono. La coherencia con la cancha se garantiza al crear la reserva desde `validarTurnoReservable` y se cubre con pruebas (y, si el diseño lo justifica, una restricción en la base).
- **Helper de pertenencia compartido:** los servicios reciben el negocio resuelto y usan un filtro común; las búsquedas por id combinan el id con el negocio, de modo que un recurso ajeno es indistinguible de uno inexistente (404).
- **Resolución del negocio:** dueño por su sesión; público y jugador por slug en `/api/v1/negocios/:slug/...`; rutas por token y webhook por la reserva. Si el diseño elige JWT o consulta a la base para el dueño, documenta el efecto sobre los tokens vigentes.
- **Migraciones con datos:** columnas nulables, alta del negocio por defecto, `UPDATE`, paso a `NOT NULL`; renombre del enum y alta de `SUPER_ADMIN` en migraciones separadas cuando haga falta; índice único parcial en SQL manual; `--create-only` o `prisma migrate diff` y revisión manual para no perder `bookings_sin_solapamiento`.
- **Capas:** controladores delgados; toda verificación de pertenencia en servicios. Cero `any`; UTC sin cambios.
- **Frontend mínimo:** sin marca ni personalización; solo roles, `/:slug`, panel del negocio propio y negocio en "Mis reservas".

## Entregas

Presupuesto de revisión de ~400 líneas por entrega; estrategia `ask-on-risk`. Cada entrega es una unidad de trabajo con sus pruebas en `desarrollo`. **Los commits los hace el usuario.** La fase de tareas confirma el pronóstico y decide la división.

| N.º | Entrega | Líneas estimadas |
|---|---|---|
| 1 | Modelo `Negocio`, `Complex.negocioId`, `Booking.negocioId`, `User.negocioId`, índice de un dueño por negocio, migración de datos a `principal` y semilla, sin cambios de comportamiento. | ~250 |
| 2 | Roles y autenticación: migración del enum, `JwtPayload`, `requireRole`, registro como `JUGADOR`, negocio del dueño en la solicitud y ajuste de fixtures. | ~250 |
| 3a | Pertenencia en administración y canchas (canchas, seña, métricas, listado y agenda) con pruebas de aislamiento. | ~350-400 |
| 3b | Pertenencia en reservas y pagos (cambio de estado, creación por el dueño, `validarTurnoReservable`, reembolso) con pruebas de aislamiento. | ~300-400 |
| 4 | Alta de negocio y dueño por `SUPER_ADMIN`, formato del slug y slugs reservados. | ~200 |
| 5 | Rutas públicas por slug (`GET /negocios/:slug`, catálogo, disponibilidad, creación de invitado), 404 genérico y tope por teléfono por negocio. | ~300 |
| 6 | Frontend: roles, `/:slug`, panel del negocio propio, negocio en "Mis reservas" y tipos. | ~250-300 |

Total estimado: ~1.900-2.100 líneas de código y pruebas, más specs. La entrega 3 ya se propone partida; si 3a o 3b superan las 400 líneas sin un corte limpio, la fase de tareas lo consulta.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/prisma/schema.prisma` y `backend/prisma/migrations/` | Modificado y nuevo | `Negocio`, columnas `negocioId`, enum `Role`, índice único parcial y migración de datos. |
| `backend/prisma/seed.ts` | Modificado | Negocio `principal`, dueño, jugador y `SUPER_ADMIN`. |
| `backend/src/core/config/security.ts`, `backend/src/core/middlewares/` | Modificado | Payload, `requireRole` y negocio de la solicitud. |
| `backend/src/modules/auth/` | Modificado | Registro como `JUGADOR` y firma con los roles nuevos. |
| `backend/src/modules/negocios/` | Nuevo | Resolución por slug, `GET /negocios/:slug` y alta por `SUPER_ADMIN`. |
| `backend/src/modules/admin/admin.service.ts` | Modificado | Canchas, seña y métricas por negocio. |
| `backend/src/modules/bookings/booking.service.ts`, `bloqueoCancha.ts` | Modificado | Listado, agenda, estado, creación por el dueño, `validarTurnoReservable` y tope por teléfono por negocio. |
| `backend/src/modules/courts/court.service.ts` | Modificado | Catálogo y detalle dentro del negocio. |
| `backend/src/modules/payments/payment.service.ts` | Modificado | Reembolso con pertenencia. |
| `backend/src/modules/public/` y `backend/src/app.ts` | Modificado | Rutas públicas bajo el negocio del slug. |
| `backend/tests/` y `backend/tests/clasificacion/archivosConBase.ts` | Modificado y nuevo | Fixtures, pruebas de aislamiento y registro de pruebas con base. |
| `frontend/src/App.tsx`, `ProtectedRoute.tsx`, `Navbar.tsx`, `types/index.ts` | Modificado | Roles y ruta `/:slug`. |
| `frontend/src/pages/BookingsPage.tsx`, `AdminDashboard.tsx`, `MyBookingsPage.tsx` | Modificado | Negocio del slug, panel propio y negocio en "Mis reservas". |
| `openspec/specs/` (al archivar), `docs/` (ADR 0002, glosario, skill `dominio-reservas`) | Modificado | Specs fusionadas y documentación del estado multi-tenant. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Fuga entre negocios por una operación por id que quede sin verificar | Alta | Helper de pertenencia compartido, prueba "ajeno → 404" por operación, revisión con el agente `revisor-multitenant` y revisión nativa por entrega. |
| Pérdida o corrupción de datos en la migración | Media | Respaldo previo (`pg_dump`) de la base de desarrollo, ensayo en la base descartable, columnas nulables antes de `NOT NULL` y SQL de reversa probado. |
| Prisma propone borrar `bookings_sin_solapamiento` o el índice parcial | Media | Migración con `--create-only` o `prisma migrate diff`, revisión manual y comentarios en el modelo. |
| El renombre del enum invalida los tokens vigentes con `USER` o `ADMIN` | Alta (impacto bajo) | Tokens de 15 minutos: se acepta un nuevo inicio de sesión. El frontend descarta una sesión guardada con un rol desconocido. Documentado en la entrega 2. |
| `Booking.negocioId` incoherente con el negocio de la cancha | Media | Se fija solo en `validarTurnoReservable`; prueba de coherencia y, si el diseño lo decide, restricción en la base. |
| Muchos fixtures de pruebas cambian (13 archivos con roles y 19 con rutas) | Alta | Entrega 2 dedicada a roles y fixtures; helpers de fixtures con negocio. |
| Las entregas 3a y 3b rozan las 400 líneas | Media | División en la fase de tareas (`ask-on-risk`). |
| Un slug choca con una ruta del frontend | Media | Lista de slugs reservados validada en el backend al crear el negocio. |
| Pruebas con base fuera del proyecto `db` | Baja | Prueba de control de `calidad-ci-backend` y registro en `ARCHIVOS_CON_BASE`. |

## Plan de reversa

- **Por entrega:** cada entrega se revierte con `git revert` de su commit, en orden inverso cuando dependen entre sí (las entregas 3 a 6 dependen de 1 y 2).
- **Migraciones:** cada migración va acompañada de un SQL de reversa probado en la base descartable: eliminar el índice parcial, las columnas `negocio_id` y la tabla de negocios, y renombrar `JUGADOR` → `USER` y `DUENO` → `ADMIN`. `SUPER_ADMIN` no se puede quitar del enum en PostgreSQL sin recrear el tipo: la reversa recrea el enum o lo deja sin uso, y antes reasigna o elimina las cuentas `SUPER_ADMIN`. La restricción `bookings_sin_solapamiento` no se toca en ningún sentido.
- **Datos reales:** antes de cualquier migración o reversa sobre la base de desarrollo, respaldo con `pg_dump`; si la reversa falla, se restaura el respaldo.
- **Sesiones:** una reversa de la entrega 2 vuelve a invalidar los tokens vigentes; se acepta un nuevo inicio de sesión.
- **Funcional sin revertir código:** con un único negocio (`principal`), el sistema se comporta como hoy; retirar el endpoint de alta de `SUPER_ADMIN` impide crear negocios nuevos sin afectar al existente.

## Dependencias

- Base descartable `reservas_prueba` (puerto 5434) para ensayar migraciones y correr `npm run test:db`.
- Respaldo de la base de desarrollo `sports_booking_postgres` antes de aplicar la entrega 1.
- CI de `calidad-ci-backend` en verde como red de seguridad.
- Agente `revisor-multitenant` para revisar las entregas 3a, 3b y 5.

## Criterios de éxito

- [ ] Existe el negocio "Negocio principal" (`principal`) con todos los complejos, reservas y la cuenta de dueño previos, y el sistema se comporta como antes para ese negocio.
- [ ] Con dos negocios, cada operación del dueño sobre un recurso de otro negocio (cancha, complejo, seña, reserva, estado, pago, reembolso) responde 404, y los listados, la agenda y las métricas solo muestran datos propios: una prueba de aislamiento por operación.
- [ ] Un slug inexistente o un negocio con `activo = false` responde 404 genérico en las rutas públicas.
- [ ] El catálogo, la disponibilidad y la reserva de invitado por slug solo aceptan canchas del negocio del slug.
- [ ] El tope de reservas `PENDING` por teléfono se cuenta por negocio: el mismo teléfono reserva en dos negocios sin que uno consuma el tope del otro.
- [ ] Un `SUPER_ADMIN` crea un negocio y su dueño; un slug reservado, repetido o mal formado se rechaza; un segundo dueño para el mismo negocio se rechaza en la base.
- [ ] Los roles son `SUPER_ADMIN`, `DUENO` y `JUGADOR`; el registro crea `JUGADOR`; un `JUGADOR` no accede a rutas de dueño ni de plataforma.
- [ ] "Mis reservas" muestra las reservas del jugador en todos los negocios, con el negocio de cada una.
- [ ] La restricción `bookings_sin_solapamiento` y las pruebas de concurrencia siguen pasando.
- [ ] `cd backend && npx tsc --noEmit` sin errores; `npm run test:unit` y `npm test` contra la base descartable en verde; `npm run lint` y `npm run build` del frontend sin errores; CI en verde.
