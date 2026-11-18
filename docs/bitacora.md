# Bitácora de sesiones

Memoria versionada del proyecto. Se carga automáticamente desde `CLAUDE.md` en cada sesión.
Se actualiza al cerrar cada sesión con `/cerrar-sesion`.

## Estado actual

- **Rama activa:** `desarrollo`, 3 commits por delante de `main` (`8202f04`, `7621aad`, `8995431`). `main` y `origin/main` están en `a764975`. Sin commitear: documentación (`glosario.md`, `SKILL.md` de `dominio-reservas`, `variables-entorno.md`, `README.md`, esta bitácora) y todo `openspec/changes/reserva-invitado/` (el usuario commitea a mano).
- **Specs vigentes:** los 5 dominios en `openspec/specs/` (autenticacion, canchas, administracion, pagos y reservas).
- **Cambios SDD:**
  - `specs-base` y `deuda-auditoria` están hechos; el segundo está archivado en `openspec/changes/archive/2026-11-18-deuda-auditoria/`.
  - `reserva-invitado` (N.º 3) está en apply: specs (47 requisitos), diseño y tareas cerrados; hechas UT-0 (salvo T-0.3), UT-1, UT-2 y la documentación T-10.1 a T-10.4. Sigue UT-3.
- **Bases de datos:** desarrollo en el contenedor `sports_booking_postgres` (puerto 5433), ya con las migraciones `20261119120000_reserva_invitado` y `20261119120100_sin_solapamiento_excluye_vencidas`. Base descartable para pruebas en el contenedor `reservas_prueba` (puerto 5434); ver `docs/operacion/variables-entorno.md`.
- **Tests del backend:** contra la base descartable, `npm test` da 192 pasan y 4 fallan, todas de `integration.test.ts` porque la base descartable no tiene semilla. Con la base disponible ya no fallan `rutasAdminReservas` ni `secretosJwt`. `npx tsc --noEmit` y `npm run build` sin errores.
- **Mercado Pago:** credenciales de prueba y webhook (evento "Pagos (legacy)") cargados en `backend/.env`; `BACKEND_URL` apunta a un túnel rápido de cloudflared, cuya URL cambia en cada arranque.
- **Flujo de trabajo:** solo SDD, con los comandos globales `/gentle-sdd-*` y sus agentes. No se crean comandos ni agentes SDD propios del proyecto.
- **Código:** sigue siendo single-tenant; multi-tenant es objetivo (ADR 0002).

## Próximo paso

1. Commitear a mano la documentación y los artefactos de `reserva-invitado` con los mensajes sugeridos en la sesión del 2026-11-18, y hacer la integración diaria en `main`.
2. Corregir el reloj de Windows (hora y zona horaria automáticas): la PC está 3 horas corrida respecto de Mercado Pago.
3. Terminar T-0.3: un pago aprobado de prueba (usuario comprador de prueba) para comprobar el reembolso sin monto y la clave de idempotencia ante un fallo.
4. Seguir con UT-3 de `reserva-invitado` con `/gentle-sdd-apply reserva-invitado`. El adaptador de Mercado Pago no debe enviar `expiration_date_from`.
5. Actualizar la regla de la integración diaria en `/cerrar-sesion`: con base descartable ya no aplica "exactamente 5 fallas por conexión"; las 4 de `integration.test.ts` son por falta de semilla.
6. Rotar a mano `JWT_SECRET` (`docs/operacion/variables-entorno.md`). Pendiente en `calidad-ci`: separar las pruebas que usan la base.

## Configuración vigente

- **Ramas:** `main` (estable) y `desarrollo` (trabajo diario). Se commitea en `desarrollo`; al cerrar el día, con todo verificado, se integra en `main` por fast-forward y se publica (`/cerrar-sesion`). Sin PR.
- **SDD:** pace `interactive`, artefactos `hybrid` (`openspec/` + Engram), presupuesto de revisión de 400 líneas por cambio.
- **TDD estricto:** solo backend (`cd backend && npm test`); el frontend no tiene tests hasta el cambio `calidad-ci`.
- **Commits:** Conventional Commits en español, sin atribución a IA.

## Registro de sesiones

La más reciente primero. Se mantienen unas 10 entradas; las más antiguas se resumen en una línea al final.

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
