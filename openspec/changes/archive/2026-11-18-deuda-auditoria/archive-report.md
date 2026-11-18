# Informe de archivo: deuda-auditoria

Fecha: 2026-11-18. Copia en Engram: `sdd/deuda-auditoria/archive-report`.

## Fusión de las delta specs

- `openspec/specs/canchas/spec.md`: se agregó CAN-015 y se modificó CAN-010. Las observaciones 7 y 8 quedan marcadas como resueltas; la verificación de `complexId` de la observación 8 sigue pendiente.
- `openspec/specs/administracion/spec.md`: se modificó ADM-003. Las observaciones 8 y 9 quedan marcadas como resueltas.
- Método: `gentle-ai sdd-archive-compose` (3.7.0) solo reconoce los títulos `### Requirement:` y las secciones `## ADDED/MODIFIED Requirements`, y rechaza la convención del proyecto (`### CAN-010:`, `## AGREGADO`). Con autorización del usuario, se tradujeron temporalmente copias de los archivos a ese formato, se compuso con la herramienta y se revirtió el formato. Un `diff` confirmó que solo cambian los tres requisitos. Se restauró a mano una línea en blanco que el combinador eliminó antes de `ADM-004`.

## Estado final

- Tareas: 19 de 19 completas.
- Verificación: sin hallazgos críticos ni advertencias. Las sugerencias 1 y 2 se resolvieron con pruebas de caracterización en `backend/tests/validacionCanchas.test.ts`; la 3 queda abierta porque depende del servicio.
- Pruebas: 112 pasan, 18 omitidas y 6 fallas ambientales que requieren PostgreSQL. `tsc --noEmit` y `npm run build` terminan sin errores.
- `revisor-multitenant`: el diff no introduce fugas.

## Pendientes fuera de alcance

- `as unknown as JwtPayload` en `backend/src/core/config/security.ts:47`.
- Deuda single-tenant en `admin.service.ts` (verificación de pertenencia, métricas por negocio), que va a `multi-tenant-negocios`.
- Verificar `complexId` en el `PATCH` de canchas.
- `docker build` sin `|| true`: no se ejecutó porque Docker no está disponible.
- Rotación real de `JWT_SECRET`: la hace el usuario a mano.
- Las referencias de línea de la sección "Evidencia" de CAN-010 y ADM-003 pueden estar desactualizadas.
