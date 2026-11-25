# Bitácora de sesiones

Memoria versionada del proyecto. Se carga automáticamente desde `CLAUDE.md` en cada sesión.
Se actualiza al cerrar cada sesión con `/cerrar-sesion`.

## Estado actual

- **Rama activa:** `desarrollo`, en `d1cedc8`, publicada en `origin/desarrollo` con todo `multi-tenant-negocios`. UT-5 a UT-8 quedaron en un solo commit, "Prueba push y resultado CI", que no sigue Conventional Commits y ya está publicado. `main` sigue en `26b09d3`. Sin commitear: el archivo de `multi-tenant-negocios` (incluido el cierre de T-8.6), las specs fusionadas, la hoja de ruta y esta bitácora. El usuario commitea a mano.
- **Specs vigentes:** los 5 dominios en `openspec/specs/`, con los requisitos de `reserva-invitado` fusionados (reservas 35, pagos 26, administracion 18, canchas 15).
- **Cambios SDD:**
  - `specs-base` hecho (su carpeta sigue en `openspec/changes/specs-base/`, sin archivar).
  - `deuda-auditoria` archivado en `openspec/changes/archive/2026-11-18-deuda-auditoria/`.
  - `reserva-invitado` (N.º 3) hecho y archivado en `openspec/changes/archive/2026-11-19-reserva-invitado/`: 65 de 65 tareas, `verify-report.md` con la resolución de hallazgos y `archive-report.md`.
  - `calidad-ci-backend` (N.º 4) hecho y archivado en `openspec/changes/archive/2026-11-24-calidad-ci-backend/`: todas las tareas (UT-0 a UT-5), verificación PASA sin críticos, sin delta specs (archivado a mano: `gentle-ai` exige un `specs/<dominio>/spec.md`).
  - `multi-tenant-negocios` (N.º 5) hecho y archivado en `openspec/changes/archive/2026-11-25-multi-tenant-negocios/`: 64 de 64 tareas. Specs vigentes fusionadas con el puente de formato de `sdd-archive-compose` 3.7.0, verificado con `diff`. Dominio nuevo `negocios` (12 requisitos); reservas 36, autenticacion 15, administracion 19, canchas 15, pagos 26. Los Propósitos ya no dicen "single-tenant". Quedan referencias a `USER` y `ADMIN` solo en notas históricas ("Previously", "Motivo", Observaciones) y en la normativa de migración.
  - No hay cambio activo. El siguiente de la hoja de ruta es `mercadopago-por-negocio` (N.º 6).
  - Antecedentes del archivo: `sdd-verify` hecho: PASA CON ADVERTENCIAS (0 críticos, 7 advertencias), en `openspec/changes/multi-tenant-negocios/verify-report.md`. T-8.6 cerrada: la CI pasó en verde sobre `d1cedc8`. Listo para archivar. La W1 quedó resuelta: NEG-007 se alineó al código, con un nombre de 2 a 150 caracteres.
- **Bases de datos:** desarrollo en el contenedor `sports_booking_postgres` (puerto 5433), con M1 y M2 aplicadas el 2026-11-25 (respaldo previo de T-0.3). Quedan 1 complejo y 16 reservas en `principal`, el dueño `DUENO` con negocio y un `JUGADOR`. No se recargó la semilla, así que esta base no tiene la cuenta `SUPER_ADMIN`. Base descartable en el contenedor `reservas_prueba` (puerto 5434), con M1 y M2, la semilla nueva y datos de la prueba manual (un segundo complejo "Complejo Norte (prueba manual)"); ver `docs/operacion/variables-entorno.md`, que ahora lista las cuentas de la semilla (dueño, jugador y `plataforma@sportsbooking.com`).
- **Tests del backend:** `npm test` corre `unit` y `db`: 650 de 650 en 45 archivos contra la base descartable (2026-11-25). `npm run test:unit` solo no necesita base. La prueba `controlClasificacion.test.ts` exige que toda prueba con `DATABASE_URL_PRUEBA` esté en `backend/tests/clasificacion/archivosConBase.ts`. `npx tsc --noEmit` sin errores. Frontend: lint y build sin errores.
- **CI:** `.github/workflows/ci.yml` en GitHub Actions, en cada push a `desarrollo` y a mano (`workflow_dispatch`), con Node 24 (`.nvmrc`): job `backend` (PostgreSQL 15, `tsc`, `test:unit`, migraciones, semilla y `test:db`) y job `frontend` (lint y build). Última corrida, sobre `26b09d3`: en verde. `gh` tiene sesión iniciada.
- **Mercado Pago:** credenciales de prueba y webhook (evento "Pagos (legacy)") cargados en `backend/.env`; `BACKEND_URL` apunta a un túnel rápido de cloudflared, cuya URL cambia en cada arranque. Si el webhook no llega, revisar que `BACKEND_URL` coincida con la URL actual del túnel y reiniciar el backend. Sin sesión de comprador, se paga con la tarjeta de prueba `APRO`.
- **Flujo de trabajo:** solo SDD, con los comandos globales `/gentle-sdd-*` y sus agentes. No se crean comandos ni agentes SDD propios del proyecto.
- **Código:** multi-tenant (ADR 0002). Negocio como unidad de aislamiento, roles `JUGADOR`, `DUENO` y `SUPER_ADMIN`, pertenencia "ajeno ≡ inexistente", alta de negocio por `SUPER_ADMIN` (`POST /api/v1/plataforma/negocios`) y rutas públicas por slug (`/api/v1/negocios/:slug/...`; las rutas sin slug se retiraron). El frontend sirve `/:slug` y `/` redirige a `/principal`. Falta el Mercado Pago propio por negocio (N.º 6).

## Próximo paso

1. Commitear el archivo (cierre de T-8.6, specs fusionadas, carpeta archivada, hoja de ruta y esta bitácora). Mensaje sugerido: `docs(negocios): archivar multi-tenant-negocios y fusionar las specs vigentes`.
2. Integrar en `main` por fast-forward y publicar, con la CI en verde.
3. Empezar `mercadopago-por-negocio` (N.º 6) con `/gentle-sdd-new`. Tener en cuenta las advertencias abiertas del `verify-report.md` archivado:
   - W6: el jugador recibe la fila completa de la reserva.
   - W7: el dueño de un negocio inactivo sigue operando con su token.
   - S3: el `update` de cancha y de seña filtra solo por `id`.
   - S6: el detalle público de la cancha devuelve el complejo completo.
4. Pendientes registrados de `reserva-invitado`: sondeo cada 20 s y cuenta regresiva con el reloj del navegador (W3, W4), `auto_return` con `https` en el despliegue (W5), `POST /bookings/admin/create` sin lista blanca, y el panel que no avisa cuando vence la sesión del administrador.
5. Rotar a mano `JWT_SECRET` (`docs/operacion/variables-entorno.md`). Pruebas del frontend en `calidad-ci` (N.º 10). Revisar las vulnerabilidades que informa `npm audit` en el frontend.
6. Decidir qué hacer con la rama local `respaldo-be522a4` y con `openspec/changes/specs-base/` (hecho, sin archivar).

## Configuración vigente

- **Ramas:** `main` (estable) y `desarrollo` (trabajo diario). Se commitea en `desarrollo`; al cerrar el día, con todo verificado, se integra en `main` por fast-forward y se publica (`/cerrar-sesion`). Sin PR.
- **SDD:** pace `interactive`, artefactos `hybrid` (`openspec/` + Engram), presupuesto de revisión de 400 líneas por cambio.
- **TDD estricto:** solo backend (`npm run test:unit` para iterar; `npm test` contra la base descartable para lo que usa la base); el frontend no tiene tests hasta el cambio `calidad-ci`.
- **Commits:** Conventional Commits en español, sin atribución a IA.

## Registro de sesiones

La más reciente primero. Se mantienen unas 10 entradas; las más antiguas se resumen en una línea al final.

### 2026-11-25: `multi-tenant-negocios`, de UT-5 a UT-8

- **Objetivo:** terminar todas las tareas de `multi-tenant-negocios`.
- **Hecho:**
  - UT-1 a UT-4 ya estaban commiteadas por el usuario (`a59a662` a `19aa893`), aunque esta bitácora todavía no lo reflejaba.
  - UT-5: slug con formato y slugs reservados, `altaNegocioSchema` (reutiliza `contrasenaSchema` de `auth.dto.ts`), alta atómica de negocio y dueño por `SUPER_ADMIN` y guarda de la semilla contra `NODE_ENV=production`. La revisión multi-tenant agregó topes de longitud al alta (M1).
  - UT-6: resolutor de negocio por slug (un slug inexistente, inactivo o mal formado da el mismo 404), catálogo, disponibilidad y alta de invitado por slug, y tope por teléfono por negocio (`pg_advisory_xact_lock(2, hashtext(negocio || ':' || telefono))`).
  - UT-7: frontend `/:slug`, `/` → `/principal`, panel con selector de complejo (solo con más de uno), "Mis reservas" con el negocio. Se retiraron las rutas sin slug (`/courts/*`, `/bookings/availability`, `POST /public/bookings`) y se borró `court.routes.ts`.
  - UT-8: renombre de roles en las specs vigentes (solo en los requisitos que las deltas no reemplazan), ADR 0002, skills, glosario, `variables-entorno.md`, hoja de ruta, `AGENTS.md`, `CLAUDE.md` y `openspec/config.yaml`.
  - Pruebas manuales T-2.10 y T-7.6 con chrome-devtools, todas correctas.
  - Verificación: `npm test` 650 de 650 en 45 archivos, `tsc` sin errores, y lint y build del frontend correctos.
- **Decisiones:**
  - Preflight SDD de la sesión: ritmo interactivo, artefactos híbridos y estrategia "preguntar si hay riesgo". El usuario pidió después terminar todas las tareas sin frenar.
  - T-8.1 renombra los roles solo fuera de los requisitos modificados por las deltas, para no romper la fusión al archivar.
  - Se deja `resolverNegocioFijo` exportado sin uso (solo lo prueba `resolutorNegocio.test.ts`). Hay que decidir si se quita.
- **Hallazgos:**
  - Con `DATABASE_URL` y `DATABASE_URL_PRUEBA` en línea apuntando a `reservas_prueba`, los agentes pudieron correr `test:db` y levantar el backend sin leer `.env` de desarrollo.
  - No hay ruta de alta de complejo: para probar el selector se insertó un complejo por SQL en la base descartable.
  - La línea base T-0.2 previa a los cambios no se registró al empezar; se cerró con la corrida completa actual.
  - Una corrida de `test:unit` en paralelo con `tsc` mostró 2 fallos que no se repitieron. Probablemente es un tiempo de espera bajo carga.
- **Commits:** `d1cedc8` del usuario, que agrupa UT-5 a UT-8 ("Prueba push y resultado CI", no sigue Conventional Commits). CI en verde. Los mensajes por unidad que se habían sugerido quedan como referencia:
  1. `feat(negocios): agregar el formato del slug, los slugs reservados y el esquema de alta`
  2. `feat(negocios): permitir al SUPER_ADMIN crear un negocio con su dueño`
  3. `fix(semilla): abortar la semilla cuando NODE_ENV es production`
  4. `feat(negocios): resolver el negocio por slug en el catálogo y la disponibilidad`
  5. `feat(reservas): crear la reserva de invitado por slug y limitar el tope por teléfono a cada negocio`
  6. `feat(frontend): servir la página de reservas por slug y redirigir la raíz a principal`
  7. `feat(frontend): elegir el complejo en el panel y mostrar el negocio en Mis reservas`
  8. `refactor(negocios): retirar las rutas sin slug del catálogo, la disponibilidad y la reserva de invitado`
  9. `docs: documentar multi-tenant en specs, ADR, skills, glosario, hoja de ruta y bitácora`

### 2026-11-24: Specs vigentes y cambio `calidad-ci-backend` completo

- **Objetivo:** cerrar los pendientes de las specs vigentes y construir la red de seguridad antes de `multi-tenant-negocios`.
- **Hecho:**
  - Se quitó `[OBJETIVO]` de 24 requisitos ya implementados (RES-023 a RES-035, PAG-020 a PAG-026, ADM-015 a ADM-018). PAG-015 conserva "reactivar".
  - Hoja de ruta: nuevo N.º 4 `calidad-ci-backend`; los siguientes corren un lugar (`multi-tenant-negocios` pasa a N.º 5 y `calidad-ci` queda solo con el frontend, N.º 10).
  - Ciclo SDD completo de `calidad-ci-backend`: exploración, propuesta, specs (sin deltas), diseño, tareas, implementación, verificación y archivo.
  - Proyectos de Vitest `unit` y `db`, scripts `test:unit` y `test:db`, prueba de control de la clasificación (UT-1b y UT-5, con TDD), CI en GitHub Actions con Node 24 y documentación (skill `testing-backend`, `desarrollo-local.md`, `variables-entorno.md`, `config.yaml` y `/cerrar-sesion`).
  - CI en verde en 6 corridas (5 por push y 1 manual).
  - Integración en `main` hecha por el usuario: `main` en `26b09d3`.
- **Decisiones:**
  - Adelantar una parte de `calidad-ci` antes del multi-tenant.
  - Los 3 archivos que usan la base sin gate pasan completos al grupo `db`, sin editarlos.
  - Acciones `@v7` (las vigentes) en lugar de `@v5`; `JWT_SECRET` ficticio en el YAML.
  - Cerrar con TDD los huecos de la revisión: pruebas con gate fuera de la lista, también en subcarpetas, y rutas de la lista inexistentes.
  - Archivar a mano el cambio sin deltas, sin inventar una spec de dominio.
- **Hallazgos:**
  - `npm test` sin base fallaba por 3 archivos sin gate: `integration`, `secretosJwt` y el primer `describe` de `rutasAdminReservas`.
  - En Vitest 4, con `extends: true` los arreglos se concatenan: la raíz no debe declarar `include` ni `exclude`.
  - Prisma 5 solo completa desde `backend/.env` las variables no definidas: apuntar `DATABASE_URL` a un puerto cerrado prueba que un grupo no usa la base.
  - `npm ci` del frontend falla con EPERM si Vite está corriendo, y deja `node_modules` a medias.
  - La revisión de Gentle AI de todo `desarrollo` contra `main` excedía el contexto del revisor (`lens_context_budget_exceeded`): hubo que revisar por commits.
  - `gentle-ai sdd-status` bloquea el archivo de un cambio sin `specs/<dominio>/spec.md`.
  - El `mv` del archivo falló con EBUSY porque el directorio de trabajo de la sesión estaba dentro de la carpeta del cambio.
  - Node local v26.12.1; la CI usa 24.
- **Commits:** `74e6825`, `9a484b7`, `7f30b2b`, `764e21e` y `26b09d3` en `desarrollo` y `main`, del usuario. Los tres primeros agrupan varias unidades y no siguen Conventional Commits; ya están publicados.

### 2026-11-19: `reserva-invitado`, de UT-6 al archivo

- **Objetivo:** terminar, verificar y archivar `reserva-invitado`.
- **Hecho:**
  - UT-6: `estadoSena.ts`, `vistaPublica.ts` y las rutas por token (consultar, cancelar y reintentar el pago).
  - T-0.3 cerrada en el sandbox de Mercado Pago (reembolso sin monto e idempotencia).
  - UT-7: vista de administrador con pagos, `depositPercent` y reembolso por pago con clave de idempotencia por intento y consulta previa del pago.
  - UT-8: frontend público (formulario de invitado y `/reserva/<código>`); T-8.4 manual con chrome-devtools y sus ajustes T-8.5 a T-8.7.
  - UT-9a y UT-9b: panel con invitados, `wa.me`, "Vencida", reembolso por pago y porcentaje de seña; T-9a.3 (teléfono `+54 9` en formato internacional).
  - T-7.7: reembolso real desde el panel, con 409 en el segundo intento.
  - T-10.5 (hoja de ruta) y T-11.1: `sdd-verify` sobre unos 263 escenarios, sin ninguno sin cobertura; UT-12 corrigió C1 y W1 con TDD y ajustó W2 en la spec.
  - Archivo en `openspec/changes/archive/2026-11-19-reserva-invitado/` con las specs vigentes fusionadas.
- **Decisiones:**
  - Avanzar paso por paso: una unidad a la vez, con el OK del usuario antes de la siguiente.
  - Clave de idempotencia del reembolso por intento (`reembolso-<id>-<uuid>`) y consulta previa del pago en Mercado Pago.
  - El invitado ve su link `/reserva/<código>` antes de pagar; `auto_return` solo con `https`.
  - `expirarPreferencia` vence el link con una hora de margen.
  - Teléfono con prefijo fijo `+54 9` y guardado como `549…`.
  - Pago aprobado sin monto: advertencia en el log, sin fila (PAG-014 y PAG-026 ajustadas).
  - W3 a W8 aceptados y registrados en `verify-report.md`.
- **Hallazgos:**
  - La clave de idempotencia de Mercado Pago guarda la respuesta fallida.
  - El webhook "perdido" era `BACKEND_URL` apuntando a un túnel vencido; la `notification_url` queda fija en cada preferencia.
  - Con `expiration_date_to` igual a "ahora", el link viejo seguía pagable unos 53 s por desfase de reloj.
  - Sin `auto_return` (no se permite con `localhost`), Mercado Pago no devuelve al invitado al sitio.
  - `wa.me` necesita el número con código de país.
  - `toLocaleString` mostraba "03:56" en vez de 15:56; se usan métodos UTC.
  - La creación de jugador y de administrador no liberaba las vencidas (C1), y el PATCH de administrador devolvía `accessTokenHash` (W1).
  - Con la sesión de administrador vencida, el panel muestra todo vacío sin avisar.
  - `sdd-archive-compose` 3.7.0 sigue exigiendo `### Requirement:`; se fusionó con un puente de formato verificado con `diff`.
  - Claude Code puede cortar procesos en segundo plano (el túnel) si falta memoria.
- **Commits:** ninguno en la sesión; todo queda sin commitear para el usuario. El commit `be9eda5` (UT-5b, del usuario) no sigue Conventional Commits y ya está publicado.

### 2026-11-18 (tarde): `reserva-invitado`, de specs a las primeras entregas

- **Objetivo:** cerrar specs, diseño y tareas de `reserva-invitado` y empezar la implementación.
- **Hecho:**
  - Delta specs en 7 revisiones (47 requisitos en `reservas`, `pagos`, `administracion` y `canchas`), diseño y `tasks.md` con 12 unidades de trabajo.
  - UT-0: línea base y verificación de las dos migraciones en una base descartable; T-0.3 parcial en el sandbox de Mercado Pago (comprobaciones 1 a 3).
  - UT-1 (partida en 1a y 1b) y UT-2 implementadas con TDD estricto y commiteadas.
  - Documentación: glosario, skill `dominio-reservas`, `variables-entorno.md`, `README.md` y corrección de `proposal.md`.
  - Base descartable `reservas_prueba` (puerto 5434), migraciones aplicadas a la base de desarrollo (con respaldo previo), sistema levantado y probado de punta a punta por la API y el navegador.
  - Webhook de Mercado Pago configurado en modo prueba con un túnel de cloudflared.
- **Decisiones:**
  - Estado nuevo `EXPIRED`, solo para `PENDING` vencidas: no ocupa turno ni cuenta como cancelación.
  - Una `CANCELLED` nunca se reactiva (cuenta e invitado). Cancelada sin pago no se puede pagar: 409 y reserva nueva. Al cancelar por cualquier vía se vence el link de Mercado Pago (mejor esfuerzo).
  - Cancelar una `CONFIRMED` con seña pagada: sin límite de tiempo, con advertencia de que la devolución queda a criterio del canchero.
  - Tabla `BookingPayment`: una fila por pago aprobado, con los motivos `AMOUNT_MISMATCH`, `SLOT_TAKEN`, `PAID_AFTER_CANCEL`, `DUPLICATE_PAYMENT` y `OWNER_DISCRETION`; reembolso por pago.
  - Recaudación de invitados: solo el pago válido no reembolsado.
  - Entregas: la 5 y la 9 se parten, la 8 sigue con excepción de tamaño; si una unidad pasa 400 líneas, se parte en commits sin consultar salvo que no haya un corte limpio.
  - Usar los MCP conectados en paralelo cuando aporten.
- **Hallazgos:**
  - PostgreSQL no deja usar un valor de enum agregado con `ADD VALUE` en la misma transacción: hacen falta dos migraciones.
  - Prisma 5 borra los índices que no modela: la unicidad parcial va como restricción `EXCLUDE`.
  - El reloj de la PC está 3 horas adelantado respecto de Mercado Pago; con `expiration_date_from` local la preferencia queda "disponible desde" el futuro.
  - `Preference.update` exige reenviar `items`.
  - `prisma migrate dev --create-only` no corre en una terminal no interactiva; se usó `prisma migrate diff`.
  - El clasificador de permisos bloquea que un agente ejecute scripts que leen `.env`; los corre el usuario con `!`.
- **Commits:** `8202f04`, `7621aad` y `8995431` en `desarrollo`. La documentación y los artefactos SDD quedan sin commitear.

### 2026-11-17 y 2026-11-18: Specs base y cambio `deuda-auditoria`

- **Objetivo:**
  - Completar `specs-base`.
  - Ejecutar el primer cambio SDD completo con los agentes de gentle.
- **Hecho:**
  - Specs base de `autenticacion`, `canchas` y `administracion` con `/spec-base`; `pagos` y `reservas` ya estaban.
  - Ciclo SDD completo de `deuda-auditoria` (exploración, propuesta, delta specs, diseño, tareas, implementación con TDD estricto, verificación y archivo):
    - Validación del id de cancha: 400 en lugar de 500 (CAN-015).
    - El `PATCH` de canchas ya no reactiva canchas (CAN-010).
    - Las métricas rechazan fechas inexistentes (ADM-003).
    - Las métricas quedan sin `any` y suman la recaudación con `Prisma.Decimal`.
    - Se quitó el `|| true` del `DockerFile`.
    - Se documentó la rotación de `JWT_SECRET`.
  - Revisión con `sdd-verify` (sin hallazgos críticos ni advertencias) y con `revisor-multitenant` (el diff no introduce fugas).
  - Hoja de ruta: `specs-base` y `deuda-auditoria` en "hecho", y `reserva-invitado` en "en curso".
- **Decisiones:**
  - Se siguen usando los comandos y agentes de gentle; no se crean comandos ni agentes `sdd-*` propios.
  - A3 sale de `deuda-auditoria`:
    - La reserva con cuenta que nace `CONFIRMED` pasa a `politica-cobro`.
    - El rechazo de pago lo resuelve `reserva-invitado`.
  - No se traduce el error P2025 de Prisma a 404.
  - Se acepta superar las 400 líneas por cambio si hace falta.
  - Se conserva el formato compacto de las tablas Markdown, sin la alineación del formateador.
- **Hallazgos:**
  - Con Zod 4.4.3, `.partial()` mantiene los valores por defecto.
  - `new Date("2026-02-31")` se desborda al 3 de marzo.
  - `gentle-ai sdd-archive-compose` (3.7.0) solo acepta títulos `### Requirement:`:
    - Se fusionó con un puente de formato verificado con `diff`.
    - No se pudo reportar a GitHub porque `gh` no tiene sesión.
  - `sdd-explore` y `sdd-verify` no escriben archivos: el orquestador escribe `exploration.md` y `verify-report.md`.
  - El formateador de VS Code realinea las tablas Markdown al guardar.
  - Queda `as unknown as JwtPayload` en `security.ts:47`.
  - Queda la deuda single-tenant en `admin.service.ts`, que va a `multi-tenant-negocios`.
- **Commits:** `ff0af29` y `46ec70d` (del usuario). El resto queda sin commitear al cierre.

### 2026-11-16: Migración a SDD (fundación)

- **Objetivo:** convertir el proyecto en tesis y producto vendible con estructura SDD profesional.
- **Decisiones de producto:**
  - Multi-tenant: una instalación, y cada negocio aislado con sus canchas, sus clientes y su Mercado Pago. El cobro de la plataforma queda para más adelante.
  - Link propio por negocio (`tuapp.com/<slug>`) y cuenta de jugador global.
  - Roles: SUPER_ADMIN, DUEÑO (una cuenta por negocio) y JUGADOR, sin empleados.
  - Cobro de reservas configurable por negocio: total online, seña por Mercado Pago o pago en el lugar.
  - Evolucionar el código existente con cambios SDD; no se reescribe.
- **Hecho:**
  - `sdd-init`.
  - `openspec/`.
  - `docs/` (producto, arquitectura con ADR 0001 a 0003, operación y tesis).
  - En `.claude/`: 4 skills, 3 comandos y 2 agentes.
  - `AGENTS.md` actualizado (React 19, `openspec/specs`, regla multi-tenant).
  - `CLAUDE.md`.
  - Esta bitácora.
- **Hallazgos:**
  - `.gitignore` ignoraba `/.claude/`; se agregaron excepciones para skills, commands y agents.
  - `.env.example` no se pudo leer por permisos, así que `docs/operacion/variables-entorno.md` queda pendiente de verificación.
  - `cancelBooking` no usa el bloqueo por cancha (`conBloqueoDeCancha`).
  - Las reservas se crean `CONFIRMED` antes del pago (punto A3 de la auditoría).
- **Commits:** `4050ead`, `4acb8e2`, `7f28287`, `bb1a116`, más el de esta bitácora.

### 2026-11-09: Prevención de overbooking

- **Objetivo:** evitar reservas duplicadas por concurrencia.
- **Hecho:**
  - Restricción `EXCLUDE USING gist` en la base y bloqueo por cancha (`pg_advisory_xact_lock`).
  - La API responde 409 ante un solapamiento.
  - Tests de concurrencia.
  - El trabajo terminó integrado en `main` mediante `fix/security-audit` (auditoría T1–T9).
- **Hallazgos:**
  - La base local se creó con `db push`.
  - Docker Compose tuvo conflicto de puertos con otro proyecto.
  - Prisma 5 informa la violación de exclusión sin código de error.
