# Informe de archivo: calidad-ci-backend

Fecha: 2026-11-24. Copia en Engram: `sdd/calidad-ci-backend/archive-report`. Hoja de ruta: N.º 4, estado "hecho".

## Estado

Archivado. Todas las tareas completas (UT-0, UT-1, UT-1b, UT-2, UT-3, UT-4 y UT-5; `tasks.md` sin casillas abiertas). Verificación: PASA, 0 CRITICAL (`verify-report.md`).

## Alcance entregado

- Proyectos de Vitest `unit` (sin base) y `db` (base descartable), con los scripts `test:unit`, `test:db` y `test` (ambos).
- Lista única `ARCHIVOS_CON_BASE` en `backend/tests/clasificacion/archivosConBase.ts` y prueba de control `controlClasificacion.test.ts`: detecta pruebas con `DATABASE_URL_PRUEBA` fuera de la lista (también en subcarpetas) y rutas de la lista que no existen.
- Integración continua `.github/workflows/ci.yml` con jobs `backend` (PostgreSQL 15, `tsc`, `test:unit` con base inalcanzable, `migrate deploy`, `db seed`, `test:db`) y `frontend` (`lint` y `build`), disparada por push a `desarrollo` y por `workflow_dispatch`. Node 24 desde `.nvmrc`; acciones `@v7`.
- Documentación: skill `testing-backend`, `docs/operacion/desarrollo-local.md`, `docs/operacion/variables-entorno.md`, `openspec/config.yaml` y la regla de integración diaria de `/cerrar-sesion`.

## Evidencia final

| Control | Resultado |
|---|---|
| `test:unit` sin base (después de UT-5) | 27 archivos y 406 pruebas en verde (orquestador) |
| `test:db` | 6 archivos y 72 pruebas en verde (usuario y CI) |
| `npm test` completo | 474 en 33 antes de UT-5 (usuario); esperado 478 en 33 con las 4 pruebas de UT-5 |
| `npx tsc --noEmit` | sin errores |
| Frontend `lint` y `build` | en verde |
| CI | 5 corridas `success` en `desarrollo` (4 por push y la manual 45466100311), todas antes de UT-5 |
| Pruebas originales | los 32 archivos sin cambios |

## Specs

El cambio no tiene delta specs por diseño (`specs/README.md`): no agrega, modifica ni elimina requisitos de producto. No hubo nada que fusionar y `openspec/specs/` no se tocó (`git status --short openspec/specs` vacío).

## Excepción en el archivo

`gentle-ai sdd-status` informa `specs = partial` ("specs/ has files but no non-empty <domain>/spec.md") y deja el archivo bloqueado por sus reglas de dependencia, porque no existe ningún `specs/<dominio>/spec.md`. No se fabricó una spec de dominio para satisfacer la herramienta. El archivo se hizo a mano:

1. `sdd-archive` tomó una copia previa de la carpeta y no pudo moverla: `mv` devolvió `Device or resource busy` (EBUSY) en todos los intentos.
2. Causa: el directorio de trabajo de la sesión de Claude Code estaba dentro de la carpeta del cambio; Windows no permite mover una carpeta que es el directorio actual de un proceso.
3. Con el directorio de trabajo ya en la raíz del repositorio, el orquestador movió `openspec/changes/calidad-ci-backend/` a `openspec/changes/archive/2026-11-24-calidad-ci-backend/`. `diff -r` contra la copia previa: sin diferencias.

## Notas pendientes

- UT-5 todavía no está commiteado ni pasó por la CI: hace falta push a `desarrollo`, una corrida en verde y un `npm test` local completo (esperado 478 en 33).
- S1 de la verificación: `proposal.md` y `design.md` citan 26 y 32 archivos (antes de UT-1b); se acepta como nota histórica.
- El umbral de 8 s de `concurrenciaReservas.test.ts:230` sigue como riesgo conocido; no falló en la CI.
- Para un próximo cambio sin deltas conviene decidir de antemano cómo tratar el bloqueo nativo de specs.

## Commits sugeridos

1. `test(backend): recorrer subcarpetas y validar la lista en el control de clasificación` (UT-5: `backend/tests/clasificacion/archivosConBase.ts` y `backend/tests/controlClasificacion.test.ts`).
2. `docs(openspec): archivar calidad-ci-backend` (la carpeta archivada y la eliminación de `openspec/changes/calidad-ci-backend/`).
