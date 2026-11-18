# Bitácora de sesiones

Memoria versionada del proyecto. Se carga automáticamente desde `CLAUDE.md` en cada sesión.
Se actualiza al cerrar cada sesión con `/cerrar-sesion`.

## Estado actual

- **Rama activa:** `desarrollo`, con el trabajo del 2026-11-18 sin commitear (el usuario commitea a mano). `main` está en `46ec70d`.
- **Specs vigentes:** los 5 dominios en `openspec/specs/` (autenticacion, canchas, administracion, pagos y reservas).
- **Cambios SDD:**
  - `specs-base` y `deuda-auditoria` están hechos; el segundo está archivado en `openspec/changes/archive/2026-11-18-deuda-auditoria/`.
  - `reserva-invitado` tiene la propuesta aprobada y le faltan specs, diseño y tareas.
- **Tests del backend:** `npm test` da 112 pasan, 18 omitidos y **6** fallan. Las 6 necesitan PostgreSQL (Docker Desktop apagado): 5 de `rutasAdminReservas.test.ts` y 1 de `secretosJwt.test.ts`, además de la suite `integration.test.ts`. Responden 500 por `PrismaClientInitializationError`. `npx tsc --noEmit` y `npm run build` sin errores. Tras `npm install` hay que correr `npx prisma generate`, porque npm bloquea los scripts de instalación.
- **Flujo de trabajo:** solo SDD, con los comandos globales `/gentle-sdd-*` y sus agentes. No se crean comandos ni agentes SDD propios del proyecto.
- **Código:** sigue siendo single-tenant; multi-tenant es objetivo (ADR 0002).

## Próximo paso

1. Commitear en `desarrollo` el trabajo de `deuda-auditoria` y de las specs base, con los mensajes sugeridos en la sesión del 2026-11-18.
2. Actualizar la regla de la integración diaria (`/cerrar-sesion`), que espera exactamente **5** fallas: hoy son 6, y la sexta es `secretosJwt` "acepta un token emitido por la aplicación", que también necesita la base.
3. Continuar con `reserva-invitado` (N.º 3): `/gentle-sdd-continue reserva-invitado` para las specs y el diseño.
4. Rotar a mano el valor de `JWT_SECRET` en `backend/.env` siguiendo `docs/operacion/variables-entorno.md`. Invalida las sesiones activas.
5. Pendiente en `calidad-ci`: separar las pruebas que usan la base. Mientras tanto, confirmar esas pruebas solo contra una base **descartable**, porque `npm test` borra reservas.

## Configuración vigente

- **Ramas:** `main` (estable) y `desarrollo` (trabajo diario). Se commitea en `desarrollo`; al cerrar el día, con todo verificado, se integra en `main` por fast-forward y se publica (`/cerrar-sesion`). Sin PR.
- **SDD:** pace `interactive`, artefactos `hybrid` (`openspec/` + Engram), presupuesto de revisión de 400 líneas por cambio.
- **TDD estricto:** solo backend (`cd backend && npm test`); el frontend no tiene tests hasta el cambio `calidad-ci`.
- **Commits:** Conventional Commits en español, sin atribución a IA.

## Registro de sesiones

La más reciente primero. Se mantienen unas 10 entradas; las más antiguas se resumen en una línea al final.

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
