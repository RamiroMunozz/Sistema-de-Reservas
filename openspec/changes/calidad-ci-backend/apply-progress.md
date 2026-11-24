# Progreso de apply: calidad-ci-backend

Copia en Engram: `sdd/calidad-ci-backend/apply-progress`.

## Estado (2026-11-24)

- UT-0: T-0.1 y T-0.2 hechas.
- UT-1: completa. T-1.5 la corrió el usuario el 2026-11-24: `test:db` 6 archivos y 72 pruebas; `npm test` 32 archivos y 470 pruebas (398 + 72 = 470).
- UT-2: T-2.1 a T-2.6 hechas. T-2.4 se destrabó deteniendo el servidor de Vite (PID 6472): `npm ci`, `lint` y `build` del frontend en verde. T-2.7 a T-2.9 pendientes del usuario (push y Actions).
- UT-3 y UT-4: sin empezar.

## Evidencia

- Node local v26.12.1 (informativo; la ejecución real es la CI con `.nvmrc` en 24).
- `vitest list`: `db` = 6 archivos, `unit` = 26, sin solapamiento.
- `test:unit` sin base: 26 archivos, 398 pruebas (U = 398). D esperado = 72 (470 - 398).
- `npx tsc --noEmit`: sin errores. `backend/tests/` sin cambios.
- Diff: `backend/vitest.config.ts` y `backend/package.json`, 37 líneas (34 adiciones, 3 eliminaciones).

## Archivos cambiados

- `backend/vitest.config.ts`
- `backend/package.json`

## Comandos pendientes para el usuario (T-1.5, bash, desde `backend/`)

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
- T-2.4 bloqueada: `npm ci` del frontend falla con EPERM (archivo `rolldown-binding.win32-x64-msvc.node` en uso). `frontend/node_modules` quedó incompleto: hay que reinstalar.

## Pasos del usuario (T-2.4 y T-2.7 a T-2.9)

1. Cerrar procesos de Node (servidor de Vite, etc.) y correr `cd frontend && npm ci && npm run lint && npm run build`; avisar el resultado.
2. Commitear (commit 2) y `git push origin desarrollo`. En GitHub, pestaña Actions, workflow "CI": jobs "Backend (tsc y pruebas)" y "Frontend (lint y build)" en verde; en el job backend, el paso `test:unit` debe dar 398 y `test:db` 72 (suma 470).
3. Alternativa o repetición (T-2.9): Actions, CI, "Run workflow" (`workflow_dispatch`), rama `desarrollo`. Nota: `workflow_dispatch` solo aparece una vez que `ci.yml` está en la rama remota.
4. Si falla por Node 24, probar `22` en `.nvmrc` (T-2.8); si falla el umbral de 8 s de `concurrenciaReservas.test.ts:230`, reejecutar una vez.

Commit sugerido (2): `ci: agregar la integración continua de backend y frontend y fijar Node 24`
