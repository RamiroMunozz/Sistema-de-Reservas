# Índice de la tesis

Esqueleto de capítulos y artefactos del repositorio que los alimentan. Los títulos son provisorios.

| Capítulo | Contenido | Fuentes en el repositorio |
|---|---|---|
| 1. Introducción | Contexto, motivación y estructura del documento. | `docs/producto/vision.md` |
| 2. Problema | Gestión de turnos de canchas y sus dificultades. | `docs/producto/vision.md` |
| 3. Objetivos | Objetivo general y específicos; alcance. | `docs/producto/decisiones.md`, `docs/producto/hoja-de-ruta.md` |
| 4. Marco teórico | Multi-tenancy, concurrencia en bases de datos, pagos online, desarrollo guiado por especificaciones. | `docs/arquitectura/adr/` (referencias a completar) |
| 5. Metodología (SDD) | Ciclo propuesta, especificación, diseño, tareas, verificación y archivo. | `docs/arquitectura/adr/0001-adopcion-sdd.md`, `openspec/changes/archive/` |
| 6. Análisis | Requisitos y escenarios por dominio. | `openspec/specs/`, `docs/producto/glosario.md` |
| 7. Diseño | Arquitectura, modelo de datos y decisiones. | `docs/arquitectura/vision-general.md`, `docs/arquitectura/adr/`, `backend/prisma/schema.prisma` |
| 8. Implementación | Backend, frontend, integración con Mercado Pago, aislamiento por negocio. | `backend/src`, `frontend/src`, `openspec/changes/` |
| 9. Pruebas | Estrategia, concurrencia, seguridad e integración continua. | `backend/tests`, `auditoria.md`, `odd/tasks/security-audit.md` |
| 10. Conclusiones | Resultados, limitaciones y trabajo futuro. | `docs/producto/hoja-de-ruta.md` |

Cada cambio archivado en `openspec/changes/archive/` documenta una decisión con su motivo y verificación; es la principal evidencia del proceso.
