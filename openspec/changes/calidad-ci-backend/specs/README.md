# Specs de `calidad-ci-backend`: sin delta specs

Este cambio no agrega, modifica ni elimina ningún requisito en `openspec/specs/`. No hay carpetas `<dominio>/spec.md` en este directorio, a propósito.

## Dominios revisados

| Dominio | Resultado |
|---|---|
| `autenticacion` | Sin cambios de requisitos |
| `reservas` | Sin cambios de requisitos |
| `canchas` | Sin cambios de requisitos |
| `pagos` | Sin cambios de requisitos |
| `administracion` | Sin cambios de requisitos |

## Justificación

- Las specs vigentes describen comportamiento observable del producto (API, reglas de negocio, roles).
- El cambio solo toca herramientas de prueba (proyectos de Vitest `unit` y `db`, scripts `test:unit`, `test:db` y `test`), la integración continua (`.github/workflows/ci.yml`, `.nvmrc`) y documentación y convenciones del proyecto.
- No se modifica `backend/src`, `schema.prisma` ni el contenido de `backend/tests/`.
- Una búsqueda en las 5 specs vigentes no encontró ningún requisito sobre CI, Vitest, versión de Node o scripts de prueba que deba ajustarse.
- Contrato de la propuesta: sección "Capacidades" (nuevas: ninguna; modificadas: ninguna).

## Nota sobre las specs vigentes

En la misma sesión (2026-11-24) se quitó la marca `[OBJETIVO]` de 24 títulos de requisitos ya implementados en `reservas`, `pagos` y `administracion` (los de `reserva-invitado`). Es una corrección de formato de las specs vigentes, ajena a este cambio: no altera el texto de ningún requisito. Quedó en el mismo commit `74e6825` por cómo se agruparon los commits.

## Efecto en el archivo

`sdd-archive` no tiene deltas que fusionar: las specs vigentes quedan intactas.
