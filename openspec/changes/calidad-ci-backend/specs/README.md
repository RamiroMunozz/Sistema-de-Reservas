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

## Efecto en el archivo

`sdd-archive` no tiene deltas que fusionar: las specs vigentes quedan intactas.
