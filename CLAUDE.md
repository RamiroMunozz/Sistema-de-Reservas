@AGENTS.md
@docs/bitacora.md

# Mapa para retomar contexto

Ejecutá `/ponerse-al-dia` al empezar una sesión: lee memoria, estado SDD, git y hoja de ruta.

| Qué | Dónde |
|---|---|
| Specs vigentes | `openspec/specs/<dominio>/spec.md` |
| Cambios SDD (en curso y archivados) | `openspec/changes/` |
| Configuración SDD | `openspec/config.yaml` |
| Documentación (producto, arquitectura, operación, tesis) | `docs/` |
| Hoja de ruta (10 cambios) | `docs/producto/hoja-de-ruta.md` |
| Decisiones de arquitectura (ADR) | `docs/arquitectura/adr/` |
| Skills del proyecto | `.claude/skills/` |
| Comandos del proyecto | `.claude/commands/` |
| Agentes del proyecto | `.claude/agents/` |
| Bitácora de sesiones (estado y próximo paso) | `docs/bitacora.md` |
| Auditoría previa | `docs/historial/auditoria-seguridad.md` |

Memoria (Engram): proyecto `sistema-de-reservas`.

Estado actual: el código es multi-tenant (ADR 0002, cambio `multi-tenant-negocios`). Falta el Mercado Pago propio por negocio.
