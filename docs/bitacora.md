# Bitácora de sesiones

Memoria versionada del proyecto. Se carga automáticamente desde `CLAUDE.md` en cada sesión.
Se actualiza al cerrar cada sesión con `/cerrar-sesion`.

## Estado actual

- **Rama activa:** `chore/estructura-sdd` (sin push). Base: `main` en `4355bf7`.
- **Commits de la rama:**
  - `4050ead` chore(sdd): inicializar openspec en modo híbrido
  - `4acb8e2` docs: agregar documentación de producto, arquitectura, operación y tesis
  - `7f28287` chore(claude): versionar skills, comandos y agentes del proyecto
  - `bb1a116` docs: adaptar AGENTS.md y README a SDD y agregar CLAUDE.md
- **Revisión (Gentle AI, lente de confiabilidad):** aprobada y cerrada sobre esos 4 commits.
- **Hoja de ruta:** fase 0 (fundación SDD) completa; ningún cambio SDD iniciado todavía.
- **Código:** sigue siendo single-tenant; multi-tenant es objetivo (ADR 0002).

## Próximo paso

1. Aplicar las 3 observaciones no bloqueantes de la revisión, en un commit chico:
   - `.claude/agents/revisor-multitenant.md`: tiene `Bash` sin restricción; quitarlo o restringirlo, porque el agente debe ser de solo lectura.
   - `.claude/commands/spec-base.md`: abortar si el argumento no es uno de los dominios permitidos (autenticacion, reservas, canchas, pagos, administracion).
   - `openspec/config.yaml`: marcar el contexto multi-tenant y los roles como **objetivo**, no como estado actual.
2. Ejecutar `npm install` en `backend/` (falta `node_modules`; `npm test` falla con "vitest no se reconoce") y confirmar que los tests pasan.
3. Decidir push y PR de `chore/estructura-sdd`: unas 900 líneas, mayormente documentación. Supera el presupuesto de 400 líneas, así que hay que partirlo o aprobar la excepción.
4. Iniciar el primer cambio SDD: `specs-base`, con `/spec-base <dominio>` por cada dominio.

## Configuración vigente

- **SDD:** pace `interactive`, artefactos `hybrid` (`openspec/` + Engram), PR `ask-on-risk`, presupuesto de 400 líneas por PR.
- **TDD estricto:** solo backend (`cd backend && npm test`); el frontend no tiene tests hasta el cambio `calidad-ci`.
- **Commits:** Conventional Commits en español, sin atribución a IA.

## Registro de sesiones

La más reciente primero. Se mantienen unas 10 entradas; las más antiguas se resumen en una línea al final.

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
