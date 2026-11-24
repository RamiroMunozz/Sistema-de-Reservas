# Bitácora de sesiones

Memoria versionada del proyecto. Se carga automáticamente desde `CLAUDE.md` en cada sesión.
Se actualiza al cerrar cada sesión con `/cerrar-sesion`.

## Estado actual

- **Rama activa:** `desarrollo`. `main`, `desarrollo` y sus remotos están en `26b09d3` (integración en `main` hecha por el usuario el 2026-11-24). Sin commitear: esta bitácora. El usuario commitea a mano.
- **Specs vigentes:** los 5 dominios en `openspec/specs/`, con los requisitos de `reserva-invitado` fusionados (reservas 35, pagos 26, administracion 18, canchas 15).
- **Cambios SDD:**
  - `specs-base` hecho (su carpeta sigue en `openspec/changes/specs-base/`, sin archivar).
  - `deuda-auditoria` archivado en `openspec/changes/archive/2026-11-18-deuda-auditoria/`.
  - `reserva-invitado` (N.º 3) hecho y archivado en `openspec/changes/archive/2026-11-19-reserva-invitado/`: 65 de 65 tareas, `verify-report.md` con la resolución de hallazgos y `archive-report.md`.
  - `calidad-ci-backend` (N.º 4) hecho y archivado en `openspec/changes/archive/2026-11-24-calidad-ci-backend/`: todas las tareas (UT-0 a UT-5), verificación PASA sin críticos, sin delta specs (archivado a mano: `gentle-ai` exige un `specs/<dominio>/spec.md`).
  - No hay cambio activo. El siguiente de la hoja de ruta es `multi-tenant-negocios` (N.º 5).
- **Bases de datos:** desarrollo en el contenedor `sports_booking_postgres` (puerto 5433), con las migraciones de `reserva-invitado`. Base descartable para pruebas en el contenedor `reservas_prueba` (puerto 5434), ya con semilla; ver `docs/operacion/variables-entorno.md`.
- **Tests del backend:** proyectos de Vitest `unit` (27 archivos, 406 pruebas, sin base: `npm run test:unit`) y `db` (6 archivos, 72 pruebas, base descartable: `npm run test:db`). `npm test` corre ambos: 478 de 478 en 33 archivos contra la base descartable (2026-11-24). La prueba `controlClasificacion.test.ts` exige que toda prueba con `DATABASE_URL_PRUEBA` esté en `backend/tests/clasificacion/archivosConBase.ts`. `npx tsc --noEmit` sin errores. Frontend: lint y build sin errores.
- **CI:** `.github/workflows/ci.yml` en GitHub Actions, en cada push a `desarrollo` y a mano (`workflow_dispatch`), con Node 24 (`.nvmrc`): job `backend` (PostgreSQL 15, `tsc`, `test:unit`, migraciones, semilla y `test:db`) y job `frontend` (lint y build). Última corrida, sobre `26b09d3`: en verde. `gh` tiene sesión iniciada.
- **Mercado Pago:** credenciales de prueba y webhook (evento "Pagos (legacy)") cargados en `backend/.env`; `BACKEND_URL` apunta a un túnel rápido de cloudflared, cuya URL cambia en cada arranque. Si el webhook no llega, revisar que `BACKEND_URL` coincida con la URL actual del túnel y reiniciar el backend. Sin sesión de comprador, se paga con la tarjeta de prueba `APRO`.
- **Flujo de trabajo:** solo SDD, con los comandos globales `/gentle-sdd-*` y sus agentes. No se crean comandos ni agentes SDD propios del proyecto.
- **Código:** sigue siendo single-tenant; multi-tenant es objetivo (ADR 0002).

## Próximo paso

1. Integrar en `main` el commit de esta bitácora.
2. Empezar `multi-tenant-negocios` (N.º 5) con `/gentle-sdd-new`. Llevar los riesgos multi-tenant de `openspec/changes/archive/2026-11-19-reserva-invitado/verify-report.md` (S5): operaciones por id sin pertenencia, tope por teléfono global y prefijo `549` fijo. Toda prueba nueva con base va a `ARCHIVOS_CON_BASE`.
3. Pendientes registrados de `reserva-invitado`: sondeo cada 20 s y cuenta regresiva con el reloj del navegador (W3, W4), `auto_return` con `https` en el despliegue (W5), `POST /bookings/admin/create` sin lista blanca, y el panel que no avisa cuando vence la sesión del administrador.
4. Rotar a mano `JWT_SECRET` (`docs/operacion/variables-entorno.md`). Pruebas del frontend en `calidad-ci` (N.º 10). Revisar las vulnerabilidades que informa `npm audit` en el frontend.
5. Decidir qué hacer con la rama local `respaldo-be522a4` y con `openspec/changes/specs-base/` (hecho, sin archivar).

## Configuración vigente

- **Ramas:** `main` (estable) y `desarrollo` (trabajo diario). Se commitea en `desarrollo`; al cerrar el día, con todo verificado, se integra en `main` por fast-forward y se publica (`/cerrar-sesion`). Sin PR.
- **SDD:** pace `interactive`, artefactos `hybrid` (`openspec/` + Engram), presupuesto de revisión de 400 líneas por cambio.
- **TDD estricto:** solo backend (`npm run test:unit` para iterar; `npm test` contra la base descartable para lo que usa la base); el frontend no tiene tests hasta el cambio `calidad-ci`.
- **Commits:** Conventional Commits en español, sin atribución a IA.

## Registro de sesiones

La más reciente primero. Se mantienen unas 10 entradas; las más antiguas se resumen en una línea al final.

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
