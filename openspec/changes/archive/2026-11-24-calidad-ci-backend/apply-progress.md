# Progreso de apply: calidad-ci-backend

Copia en Engram: `sdd/calidad-ci-backend/apply-progress`.

## Estado (2026-11-24)

- UT-0: T-0.1 y T-0.2 hechas.
- UT-1: completa. T-1.5 la corrió el usuario el 2026-11-24: `test:db` 6 archivos y 72 pruebas; `npm test` 32 archivos y 470 pruebas (398 + 72 = 470).
- UT-3: completa (T-3.1 a T-3.6, 2026-11-24). Ver sección "UT-3".
- UT-2: completa. T-2.4 se destrabó deteniendo el servidor de Vite (PID 6472). CI en verde por push (`74e6825`, `9a484b7`) y por `workflow_dispatch` (corrida 45466100311): `unit` 27 archivos y 402 pruebas, `db` 6 y 72.
- UT-4: completa (2026-11-24). Hoja de ruta fila 4 en "hecho" y los 9 criterios de éxito de `proposal.md` marcados con evidencia.
- `npm test` local completo después de UT-1b: 33 archivos y 474 pruebas en verde (usuario, 2026-11-24).

## Evidencia (UT-0 y UT-1, antes de UT-1b; los valores vigentes están en "Estado")

- Node local v26.12.1 (informativo; la ejecución real es la CI con `.nvmrc` en 24).
- `vitest list`: `db` = 6 archivos, `unit` = 26, sin solapamiento.
- `test:unit` sin base: 26 archivos, 398 pruebas (U = 398). D esperado = 72 (470 - 398).
- `npx tsc --noEmit`: sin errores. `backend/tests/` sin cambios.
- Diff: `backend/vitest.config.ts` y `backend/package.json`, 37 líneas (34 adiciones, 3 eliminaciones).

## Archivos cambiados

- `backend/vitest.config.ts`
- `backend/package.json`

## Comandos de T-1.5 (ejecutados por el usuario el 2026-11-24; bash, desde `backend/`)

```bash
export DATABASE_URL="postgresql://prueba:prueba@localhost:5434/reservas_prueba"
export DATABASE_URL_PRUEBA="$DATABASE_URL"
npx prisma db seed && npm run test:db   # registrar D (esperado 72, 6 archivos)
npx prisma db seed && npm test          # esperado 32 archivos y 470 pruebas
unset DATABASE_URL DATABASE_URL_PRUEBA
```

Commit sugerido (1): `test(backend): separar las pruebas en los proyectos unit y db de Vitest`

## UT-2 (2026-11-24)

- Desviación del diseño: `actions/checkout@v7` y `actions/setup-node@v7` en lugar de `@v5` (GitHub API releases/latest: v7.0.1 y v7.1.0). Compatibilidad de setup-node v7 con `node-version-file`, `cache` y `cache-dependency-path`: verificada por el orquestador en `action.yml` de la etiqueta `v7` (2026-11-24); los tres parámetros existen.
- Archivos creados: `.nvmrc` (1 línea) y `.github/workflows/ci.yml` (102 líneas). Diff de UT-2: 103 líneas de adición, 0 eliminaciones.
- Backend local (Node v26.12.1, informativo): `tsc --noEmit` sin errores; `test:unit` 26 archivos y 398 pruebas en verde. `backend/tests/` sin cambios.
- Sin validador YAML local; validado por lectura.
- T-2.4: el primer intento falló con EPERM (archivo `rolldown-binding.win32-x64-msvc.node` en uso por el servidor de Vite). Resuelta el 2026-11-24 deteniendo Vite (PID 6472): `npm ci`, `lint` y `build` en verde.

## Pasos del usuario (T-2.7 a T-2.9; el paso 1 ya se cumplió)

1. Cerrar procesos de Node (servidor de Vite, etc.) y correr `cd frontend && npm ci && npm run lint && npm run build`; avisar el resultado.
2. Commitear (commit 2) y `git push origin desarrollo`. En GitHub, pestaña Actions, workflow "CI": jobs "Backend (tsc y pruebas)" y "Frontend (lint y build)" en verde; en el job backend, el paso `test:unit` debe dar 398 y `test:db` 72 (suma 470).
3. Alternativa o repetición (T-2.9): Actions, CI, "Run workflow" (`workflow_dispatch`), rama `desarrollo`. Nota: `workflow_dispatch` solo aparece una vez que `ci.yml` está en la rama remota.
4. Si falla por Node 24, probar `22` en `.nvmrc` (T-2.8); si falla el umbral de 8 s de `concurrenciaReservas.test.ts:230`, reejecutar una vez.

Commit sugerido (2): `ci: agregar la integración continua de backend y frontend y fijar Node 24`

## UT-3 (2026-11-24)

- Archivos cambiados: `.claude/skills/testing-backend/SKILL.md`, `docs/operacion/desarrollo-local.md`, `docs/operacion/variables-entorno.md`, `openspec/config.yaml`, `.claude/commands/cerrar-sesion.md`. Diff: 94 adiciones y 17 eliminaciones (111 líneas), sobre el estimado de ~75 y dentro del presupuesto de 400.
- Corrección del orquestador (2026-11-24): el agente informó 4 archivos con gate y 2 sin gate, pero `rutasAdminReservas.test.ts` solo tiene gate en su segundo `describe` (línea 186); el primero (línea 18) usa la base sin gate. El diseño era correcto (tres archivos con uso de base sin gate). Se corrigieron el skill `testing-backend` y `variables-entorno.md`.
- `cerrar-sesion.md` paso 5: `tsc`, `test:unit` y `npm test` completo contra la base descartable (con migrate deploy y db seed); sin tolerancia de fallas; confirmación de la CI.
- Relectura cruzada (T-3.6) coherente con `vitest.config.ts` y `ci.yml`. Sin `.env` leído ni modificado; `backend/tests/` sin cambios; sin commit.

Commit sugerido (3): `docs: documentar los grupos de pruebas, la CI y la nueva integración diaria`

## UT-1b (2026-11-24)

- Motivo: hallazgo R3-001. Una prueba con base protegida por `skipIf(!DATABASE_URL_PRUEBA)` fuera de `ARCHIVOS_CON_BASE` caería en `unit` y se omitiría en silencio.
- RED: `controlClasificacion.test.ts` sin el módulo: `Cannot find module './clasificacion/archivosConBase'`, 0 pruebas.
- GREEN: `backend/tests/clasificacion/archivosConBase.ts` (fuente única de `ARCHIVOS_CON_BASE` y función pura `archivosConBaseFueraDeLista`); `vitest.config.ts` lo importa (con extensión `.ts`). La prueba arma la marca por partes para no detectarse a sí misma. 4 pruebas en verde.
- `vitest list`: `unit` = 27, `db` = 6. `test:unit` sin base: 27 archivos y 402 pruebas (U = 402; D sigue en 72, total esperado 474). `tsc --noEmit` código 0. Los 32 archivos de prueba existentes sin cambios.
- Archivos: `backend/tests/controlClasificacion.test.ts` (nuevo, 52), `backend/tests/clasificacion/archivosConBase.ts` (nuevo, 29), `backend/vitest.config.ts` (+4 -10). Sin commit.

Commit sugerido (1b): `test(backend): detectar pruebas con base fuera del proyecto db`

## UT-5 (2026-11-24)

- Motivo: hallazgos R-1 (el control no recorría subcarpetas) y R-2 (el control no validaba que las rutas de la lista existan).
- RED T-5.2: `listarArchivosDePrueba` solo del primer nivel: `expected [] to deeply equal [ 'tests/sub/hondo/y.test.ts', 'tests/sub/x.test.ts' ]`. RED T-5.4: `rutasInexistentes` devolviendo `[]`: `expected [] to deeply equal [ 'tests/fantasma.test.ts' ]`. 2 fallidas, 6 pasan.
- GREEN: `archivosConBase.ts` agrega `listarArchivosDePrueba` (recursiva, rutas `tests/...` con `/`) y `rutasInexistentes` (pura); `controlClasificacion.test.ts` usa un directorio temporal del sistema para el caso anidado y agrega el caso en disco de existencia de la lista. 8 de 8 en verde.
- Verificación: `test:unit` sin base 27 archivos y 406 pruebas; `tsc --noEmit` código 0; `vitest list` unit 27 y db 6; 32 archivos originales sin cambios; sin `.env` leído ni modificado.
- Archivos: `backend/tests/clasificacion/archivosConBase.ts` (+24 -0), `backend/tests/controlClasificacion.test.ts` (+47 -11). Sin commit.

Commit sugerido (5): `test(backend): recorrer subcarpetas y validar la lista en el control de clasificación`
