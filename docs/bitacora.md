# Bitácora de sesiones

Memoria versionada del proyecto. Se carga automáticamente desde `CLAUDE.md` en cada sesión.
Se actualiza al cerrar cada sesión con `/cerrar-sesion`.

## Estado actual

- **Rama activa:** `chore/limpieza-odd`, publicada; falta abrir el PR hacia `main`. Base: `main` en `a9d0583`.
- **Fundación SDD:** `chore/estructura-sdd` ya está integrada en `main` y publicada.
- **Observaciones de la revisión de la fundación:** aplicadas (agente `revisor-multitenant` de solo lectura, validación de dominio en `/spec-base`, multi-tenant marcado como objetivo en `openspec/config.yaml`).
- **Tests del backend:** `npm test` da 73 pasan, 18 omitidos y 5 fallan; los 5 necesitan PostgreSQL (Docker Desktop apagado). `npx tsc --noEmit` sin errores. Tras `npm install` hay que correr `npx prisma generate`, porque npm bloquea los scripts de instalación.
- **Flujo de trabajo:** solo SDD. Se eliminó ODD (`odd/`) y la auditoría pasó a `docs/historial/auditoria-seguridad.md`. Las tareas y decisiones de su corrección quedaron en `docs/historial/decisiones-auditoria.md`.
- **Hoja de ruta:** fase 0 (fundación SDD) completa; ningún cambio SDD iniciado todavía.
- **Código:** sigue siendo single-tenant; multi-tenant es objetivo (ADR 0002).

## Próximo paso

1. Abrir e integrar el PR de `chore/limpieza-odd` en `main`, y volver a `main`.
2. Iniciar el primer cambio SDD, `specs-base`: correr `/spec-base <dominio>` para cada dominio (autenticacion, reservas, canchas, pagos, administracion).
3. Opcional: confirmar los 5 tests que dependen de PostgreSQL contra una base **descartable**, nunca la de desarrollo con datos: `npm test` borra reservas al limpiar sus turnos.

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
