# Informe de verificación: deuda-auditoria

Fecha: 2026-11-18. Copia en Engram: `sdd/deuda-auditoria/verify-report`.

**Resultado:** sin hallazgos críticos ni advertencias; 3 sugerencias.

## Controles ejecutados (`backend/`)

| Control | Resultado |
|---|---|
| `npm test` | 110 pasan, 18 omitidas, 6 fallan. Las 6 fallas son ambientales (requieren PostgreSQL): la suite `integration.test.ts`, 5 pruebas de `rutasAdminReservas.test.ts` y "acepta un token emitido por la aplicación" de `secretosJwt.test.ts`. |
| `npx tsc --noEmit` | Sin errores. |
| `npm run build` | Sin errores. |
| `git diff --check` y `git ls-files --eol` | Sin espacios sobrantes ni CRLF. |
| `backend/.env` | Sin cambios. |
| Búsqueda de `any` y `as unknown as` en `backend/src` | Solo `core/config/security.ts:47`, preexistente y fuera de alcance. |

## Cobertura de las delta specs

Todos los escenarios de CAN-015, CAN-010 y ADM-003 tienen una prueba en `tests/validacionCanchas.test.ts` o `tests/metricasAdmin.test.ts`. ADM-002 tiene una prueba de caracterización y el caso `0.10 + 0.20 = 0.3`.

## Diseño, tareas y reglas

- Las decisiones 1 a 7 del diseño están implementadas.
- Las tareas T-1.1 a T-7.1 están completas.
- Se cumplen las reglas de `AGENTS.md`: sin `any` nuevos, controladores delgados, UTC sin cambios y nombres nuevos en español.
- La evidencia RED y GREEN de `apply-progress.md` coincide con las pruebas existentes.

## Sugerencias

1. **Resuelta:** CAN-010, escenario "Desactivar una cancha". Se agregó una prueba de caracterización con `{ isActive: false }` que verifica el cuerpo de la respuesta 200.
2. **Resuelta:** CAN-015, caso de un UUID válido pero inexistente (404) en `/availability`. Se agregó una prueba de caracterización.
3. CAN-010: que una cancha inactiva no aparezca en el listado público depende del servicio y queda fuera del alcance del mock.

## Riesgos

- Las 6 fallas ambientales no se pudieron confirmar sin PostgreSQL.
- `docker build` no se ejecutó, porque Docker no está disponible.

## Revisión multi-tenant (`revisor-multitenant`)

El diff no introduce fugas ni regresiones. La deuda single-tenant preexistente queda para `multi-tenant-negocios`:

- Verificar que `complexId` y el `id` de la cancha pertenezcan al negocio en `createCourt` y `updateCourt`.
- Filtrar `getMetrics` por negocio.
- Filtrar por negocio las rutas públicas de canchas.
- Distinguir el rol `ADMIN` del dueño.
