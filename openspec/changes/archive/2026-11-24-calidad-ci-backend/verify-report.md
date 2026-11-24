# Informe de verificación: calidad-ci-backend

Fecha: 2026-11-24. Copia en Engram: `sdd/calidad-ci-backend/verify-report`. Modo: TDD estricto (sin código de producción; la evidencia es de ejecución y la prueba de control de UT-1b tiene RED y GREEN registrados). Verificador: `sdd-verify`.

## Veredicto

**PASA.** 0 CRITICAL, 2 WARNING, 3 SUGGESTION. Se puede archivar. La revisión de Gentle AI posterior a `74e6825` agrega 1 WARNING y 2 SUGGESTION (sección "Hallazgos de la revisión").

## Resumen de tareas

| Concepto | Observado |
|---|---|
| Tareas completas | 34 de 34 (`tasks.md`; el estado nativo informa taskProgress 34/34) |
| Tareas sin terminar | Ninguna |
| Cambios en el árbol | `git status` limpio: todo está commiteado en `desarrollo` |

El verificador no cambia el estado de las tareas.

## Estado nativo de artefactos

proposal, design, tasks y applyProgress = done; verifyReport = missing (se escribe con este informe); specs = partial, con el bloqueo "specs/ has files but no non-empty <domain>/spec.md".

Ver W1: el cambio no tiene delta specs por diseño (`specs/README.md`).

## Ejecución real

| Comando | Resultado |
|---|---|
| `npx vitest list --project unit --filesOnly` | 27 archivos |
| `npx vitest list --project db --filesOnly` | 6 archivos: `concurrenciaReservas`, `integration`, `liberarAlCrearReservaBase`, `migracionReservaInvitado`, `rutasAdminReservas`, `secretosJwt` |
| `test:unit` con `DATABASE_URL` inalcanzable (puerto 1) y sin `DATABASE_URL_PRUEBA` | 27 archivos y 402 pruebas en verde (19,4 s) |
| `cd backend && npx tsc --noEmit` | código 0, sin errores |
| `cd frontend && npm run lint` | sin errores |
| `cd frontend && npm run build` | correcto |
| `gh run list --workflow ci.yml --limit 5` | 5 corridas `success` en `desarrollo`: `45467884783` (push, 1m6s), `45467690687` (push, 46s), `45466100311` (`workflow_dispatch`, 55s), `45464753089` (push, 1m4s) y `45460304107` (push, 1m2s) |

Evidencia observada por el usuario (no ejecutada por el verificador, que no tiene base):

- `npm test` completo contra la base descartable con semilla: 33 archivos y 474 pruebas en verde (2026-11-24).
- `test:db`: 6 archivos y 72 pruebas en verde.
- Línea base previa: 32 archivos y 470 pruebas (398 + 72 antes de UT-1b; 402 + 72 = 474 después).

## Matriz de cumplimiento (criterios de éxito de `proposal.md`)

No hay requisitos de dominio porque no hay delta specs. La matriz se construye contra los 9 criterios.

| N.º | Criterio | Evidencia | Resultado |
|---|---|---|---|
| 1 | `test:unit` pasa sin base ni `DATABASE_URL_PRUEBA` | Ejecutado por el verificador: 27 archivos y 402 pruebas. En la CI con puerto cerrado | CUMPLE |
| 2 | `test:db` pasa contra la base descartable con migraciones y semilla | Usuario: 6 archivos y 72 pruebas. CI: paso `test:db` tras `migrate deploy` y `db seed` | CUMPLE (evidencia del usuario y de la CI) |
| 3 | `npm test` suma la línea base: 474 en 33 | Usuario: 33 archivos y 474 pruebas. CI: 402 + 72 = 474. Cuadra con `vitest list` (27 + 6 = 33) | CUMPLE (evidencia del usuario y de la CI) |
| 4 | Ningún archivo existente de `backend/tests/` cambia | `git status` limpio; los archivos nuevos son solo `controlClasificacion.test.ts` y `tests/clasificacion/archivosConBase.ts` (UT-1b, aprobada) | CUMPLE |
| 5 | `.nvmrc` existe y la CI lo usa | `.nvmrc` contiene `24`; `ci.yml:50` y `ci.yml:91` usan `node-version-file: .nvmrc`; corridas en verde con Node 24 | CUMPLE |
| 6 | Push a `desarrollo` y `workflow_dispatch` dejan los dos jobs en verde | 5 corridas `success` (push y `workflow_dispatch`, incluida `45466100311`) | CUMPLE |
| 7 | Sin secretos de Mercado Pago ni del repositorio | `rg "secrets\.\|MERCADO\|MP_"` en `ci.yml`: sin coincidencias; `JWT_SECRET` ficticio comentado en `ci.yml:42-43` | CUMPLE |
| 8 | Skill, `desarrollo-local.md`, `config.yaml` y `/cerrar-sesion` describen los tres scripts y la nueva regla (más `variables-entorno.md`) | Relectura y `rg` de los archivos; `cerrar-sesion.md:14-24`; `config.yaml:26-34,61`; `variables-entorno.md:19,38` | CUMPLE |
| 9 | Fila 4 de la hoja de ruta refleja el estado | `hoja-de-ruta.md:10`: "hecho" | CUMPLE |

## Coherencia contra el diseño

| Decisión | Observado | Resultado |
|---|---|---|
| 1. Proyectos en línea con `extends: true` y lista única | `backend/vitest.config.ts` coincide con el diseño; la lista se movió a `tests/clasificacion/archivosConBase.ts:4-11` (fuente única, importada por la configuración y por la prueba de control, por UT-1b). Sin `include` ni `exclude` en la raíz. Clasificación 27 y 6 sin solapamiento | CUMPLE (extensión aprobada de UT-1b) |
| 2. Scripts | `backend/package.json:13-15`: `test`, `test:unit` y `test:db` con el contenido diseñado | CUMPLE |
| 3. "Sin base" para `unit` | `ci.yml:63-68` redefine `DATABASE_URL` (puerto 1) y vacía `DATABASE_URL_PRUEBA`; el skill y `desarrollo-local.md` documentan el comando local | CUMPLE |
| 4. Workflow | `ci.yml` coincide con el diseño: disparadores `push` a `desarrollo` y `workflow_dispatch`, `permissions: contents: read`, `concurrency`, servicio `postgres:15` con `pg_isready`, `migrate deploy` y `db seed` (nunca `migrate dev`), `tsc` y `test:unit` antes de migrar, job `frontend` con lint y build | CUMPLE |
| 5. Node | `.nvmrc` = `24`, dentro de la intersección de `engines`; Node 24 pasó en la CI | CUMPLE |
| Desviación: acciones `@v7` en lugar de `@v5` | Documentada en `design.md:241-242`, `tasks.md` T-2.1 y `apply-progress.md` (UT-2). La CI corre en verde con `@v7` | CUMPLE (desviación documentada) |

Coherencia entre documentos sobre los 3 archivos de `db` sin gate (`integration`, `secretosJwt` y el primer `describe` de `rutasAdminReservas`; el segundo `describe`, en `rutasAdminReservas.test.ts:186`, sí tiene gate): coinciden `variables-entorno.md:38`, `testing-backend/SKILL.md:55` y `proposal.md`. Los 3 con gate son `concurrenciaReservas`, `liberarAlCrearReservaBase` y `migracionReservaInvitado`. La excepción es el texto obsoleto de `tasks.md` T-3.3 (W2).

Reglas de `AGENTS.md`: sin `any` en el código nuevo; identificadores nuevos en español; sin cambios en capas, UTC ni multi-tenant (no hay código de producción). La prueba de control usa `readdirSync` y `readFileSync` solo sobre `backend/tests`, sin acceso a la base ni a `.env`.

## Hallazgos

### CRITICAL

Ninguno.

### WARNING

- **W1. Bloqueo nativo de specs y efecto en archive.** `sdd-status` informa `specs = partial` ("specs/ has files but no non-empty <domain>/spec.md") porque `openspec/changes/calidad-ci-backend/specs/` contiene solo `README.md`. Es intencional: el cambio no agrega, modifica ni elimina requisitos (`proposal.md`, sección "Capacidades"; `specs/README.md`). Implicación para archive: no hay deltas que fusionar y las specs vigentes quedan intactas, pero `sdd-archive` o `sdd-archive-compose` pueden negarse o requerir un manejo manual. No se intentó corregir.
- **W2. Texto obsoleto en `tasks.md`.** La nota de T-3.3 (línea 133) afirma que hay "4 archivos con gate y solo 2 sin gate". El orquestador la corrigió después (`apply-progress.md:59`): son 3 con gate y 3 sin gate. Los documentos entregados son correctos; solo el registro de tareas quedó contradictorio.

### SUGGESTION

- **S1.** `proposal.md` (alcance, ítem 1) y `design.md` (decisión 1, flujo de datos, estrategia de verificación) siguen citando 26 archivos en `unit` y 32 en total. Después de UT-1b son 27 y 33.
- **S2.** `controlClasificacion.test.ts` detecta solo archivos que mencionan `DATABASE_URL_PRUEBA` (los que tienen gate). Una prueba nueva con base y sin gate cae en `unit` y se detecta porque `test:unit` falla por conexión (decisión 3); el skill documenta esa segunda defensa. Ver además R-1, que sí encuentra un hueco con subcarpetas.
- **S3.** La corrida local usa Node v26.12.1 y la CI usa 24 (`.nvmrc`). Es coherente con el diseño. Solo se deja constancia.

## Hallazgos de la revisión de Gentle AI (commits posteriores a `74e6825`)

Revisión aprobada y cerrada el 2026-11-24, ejecutada en paralelo con esta verificación. Agrega:

- **R-1 (WARNING).** `controlClasificacion.test.ts:43-48` lista solo el primer nivel de `backend/tests/` (`readdirSync` no recursivo), mientras que el proyecto `unit` incluye `tests/**/*.test.ts`. Una prueba con gate en una subcarpeta y fuera de `ARCHIVOS_CON_BASE` se omitiría en la CI sin que el control la detecte. Corrige la conclusión de S2 para subcarpetas.
- **R-2 (SUGGESTION).** Nada comprueba que cada ruta de `ARCHIVOS_CON_BASE` exista; un archivo de la lista renombrado dejaría una entrada obsoleta en silencio.
- **R-3 (SUGGESTION).** Coincide con W2.

## Riesgos conocidos (sin cambios)

- El umbral de 8 s de `concurrenciaReservas.test.ts:230` no falló en ninguna de las corridas de la CI; sigue registrado como riesgo conocido y fuera del alcance.
- `test:db` y `npm test` completos no los puede ejecutar el verificador (sin base); su evidencia es del usuario y de la CI.

## Recomendación

Archivar. No hay deltas que fusionar. Si `sdd-archive` rechaza el cambio por el bloqueo nativo de specs (W1), resolverlo antes de archivar. Antes de archivar conviene corregir R-1 y R-2 (prueba de control) y W2; S1 es opcional.
