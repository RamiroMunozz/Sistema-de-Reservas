# Tareas: calidad-ci-backend

Copia en Engram: `sdd/calidad-ci-backend/tasks`. Entradas: `proposal.md` (D1 a D7) y `design.md` (decisiones 1 a 5 y estrategia de verificación). Sin delta specs (`specs/README.md`): el cambio no modifica requisitos del producto.

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas de cambio estimadas (adiciones + eliminaciones) | ~205 en total (rango 170 a 230), sin contar los artefactos de `openspec/changes/calidad-ci-backend/` |
| 400-line budget risk | Low |
| Chained PRs recommended | No (el proyecto no usa PR; son 4 commits granulares en `desarrollo`, en una sola entrega) |
| Delivery strategy | ask-on-risk (sin cadena: no hace falta dividir) |

Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low

### Estimación por unidad

| Unidad | Contenido | Líneas estimadas | Commit |
|---|---|---|---|
| UT-1 | Proyectos de Vitest y scripts | ~40 | 1 |
| UT-2 | `.nvmrc` y workflow de CI | ~95 | 2 |
| UT-3 | Documentación y convenciones | ~75 | 3 |
| UT-4 | Hoja de ruta y artefactos | ~2 (más artefactos) | 4 |

### Suggested Work Units

| Unidad | Objetivo | Entrega | Comando de prueba focalizado | Arnés de ejecución | Límite de reversa |
|---|---|---|---|---|---|
| UT-0 | Línea base | Sin commit | `cd backend && npm test` (470 pruebas, 32 archivos) | Base descartable `reservas_prueba` (puerto 5434) | N/A |
| UT-1 | Separar `unit` y `db` | Commit 1 | `npx vitest list --project unit\|db --filesOnly`; `npm run test:unit` sin base | `DATABASE_URL` inalcanzable (puerto 1) | Revertir `vitest.config.ts` y `package.json` |
| UT-2 | Fijar Node y agregar la CI | Commit 2 (después del 1) | Verificación local de `engines`, `lint` y `build`; corrida de la CI | Push del usuario o `workflow_dispatch` | Borrar `.github/workflows/ci.yml` y `.nvmrc` |
| UT-3 | Documentar grupos, CI y nueva regla diaria | Commit 3 | Relectura contra el diseño (sección "Documentación") | N/A | `git revert` del commit |
| UT-4 | Estado de la fila 4 y artefactos | Commit 4 | Relectura | N/A | `git revert` del commit |

## Convenciones de ejecución

- **Cómo aplica TDD estricto:** este cambio no agrega comportamiento de producción (no toca `backend/src`, `schema.prisma` ni la base) y no cambia ninguno de los 32 archivos de prueba existentes. La excepción es UT-1b, que agrega una prueba de control con RED y GREEN reales. No hay RED/GREEN posible para configuración, CI ni documentación, y no se inventan pruebas falsas. La "prueba" de la separación es de ejecución: cantidad de archivos por proyecto (`vitest list --filesOnly`: 26 y 6), `test:unit` en verde sin base, suma igual a la línea base (470 pruebas, 32 archivos) y la corrida de la CI. Cada tarea registra el resultado observado; si no se observó, no se declara hecha.
- Los agentes no commitean ni leen o modifican `.env`. Los comandos que usan la base (migraciones, semilla, `test:db`, `npm test`) los corre el usuario con `!`, con `DATABASE_URL` definida en línea (PowerShell, desde `backend/`) según `design.md`, "Estrategia de verificación". Nunca `npm test` con la `DATABASE_URL` de `backend/.env`.
- Sin `any`; todo en español; commits convencionales en español, sin atribución a IA. Cada unidad termina con el mensaje de commit sugerido para el usuario.
- `backend/tests/` no cambia: `git status` debe confirmarlo al final de cada unidad.

---

## UT-0: Línea base (sin commit)

- [x] T-0.1 Registrar `node --version` local y `git status` inicial (el árbol de `backend/tests/` limpio). Relee los `engines` de la tabla de la decisión 5 en `backend/node_modules` y `frontend/node_modules`. (Decisión 5, paso 1 y 2)
  - Resultado (2026-11-24): `node --version` local = v26.12.1 (no es 24: la corrida local es informativa y la real es la CI). `git status` inicial sin cambios en `backend/tests/`. `engines` releídos: eslint `^20.19.0 || ^22.13.0 || >=24`, vite `^20.19.0 || >=22.12.0` y vitest `^20.0.0 || ^22.0.0 || >=24.0.0`; 24 sigue en la intersección.
- [x] T-0.2 El usuario aplica `npx prisma migrate deploy` y `npx prisma db seed` sobre `reservas_prueba` (puerto 5434) y corre `npm test` antes de tocar `vitest.config.ts`. Registrar el resultado: esperado 32 archivos y 470 pruebas en verde. Si difiere, se detiene y se consulta antes de seguir. (Estrategia de verificación, paso 1)
  - Resultado (2026-11-24, Vitest 4.1.11): migraciones al día (5, ninguna pendiente), semilla cargada y `npm test` con **32 archivos y 470 pruebas en verde** en 41,8 s. El contenedor `reservas_prueba` estaba detenido y se levantó antes con `docker start`.

**Verificación UT-0:** línea base registrada en este archivo (archivos y pruebas).

---

## UT-1: Proyectos de Vitest y scripts (commit 1, ~40 líneas)

Satisface: D1, D2 y criterios de éxito 1 a 4 del `proposal.md`. Decisiones de diseño 1, 2 y 3.

- [x] T-1.1 Reemplazar `backend/vitest.config.ts` con el contenido de la decisión 1: constante `ARCHIVOS_CON_BASE` (6 archivos), proyectos `unit` y `db` con `extends: true`, sin `include` ni `exclude` en la raíz. Se conservan `globals`, `environment: "node"`, `testTimeout: 10000` y `fileParallelism: false`. Sin `any`.
  - Resultado (2026-11-24): `backend/vitest.config.ts` reemplazado con el contenido de la decisión 1.
- [x] T-1.2 Agregar a `backend/package.json` los scripts `test:unit` (`vitest run --project unit`) y `test:db` (`vitest run --project db`); `test` conserva `vitest run`.
  - Resultado (2026-11-24): scripts `test:unit` y `test:db` agregados; `test` sin cambios.
- [x] T-1.3 Verificar la clasificación sin ejecutar pruebas: `npx vitest list --project db --filesOnly` muestra exactamente los 6 archivos y `npx vitest list --project unit --filesOnly` muestra 26, ninguno de los 6. Si `vitest list` no refleja lo esperado, ajustar la configuración (no los archivos de prueba).
  - Resultado (2026-11-24): `vitest list --project db --filesOnly` muestra los 6 archivos; `--project unit` muestra 26 y ninguno de los 6 (`rg` sin coincidencias).
- [x] T-1.4 Verificar `unit` sin base (decisión 3): con `$env:DATABASE_URL = "postgresql://sin_base:sin_base@127.0.0.1:1/sin_base"` y sin `DATABASE_URL_PRUEBA`, `npm run test:unit` pasa en verde con 26 archivos. Registrar la cantidad de pruebas `U`. Quitar la variable al terminar. Si un archivo falla por conexión, está mal clasificado: se mueve a `ARCHIVOS_CON_BASE` y se vuelve a T-1.3 (el contenido del archivo no se edita).
  - Resultado (2026-11-24): con `DATABASE_URL` inalcanzable (puerto 1) y sin `DATABASE_URL_PRUEBA`, `npm run test:unit` da **26 archivos y 398 pruebas (U = 398)** en verde. Por la suma, D esperado = 72.
- [x] T-1.5 El usuario corre contra la base descartable (con semilla recargada antes de cada corrida): `npm run test:db` (6 archivos; registrar `D`) y `npm test` (32 archivos y 470 pruebas). Criterio: `U + D = 470`, 26 + 6 = 32, y `npm test` reproduce la línea base de T-0.2.
  - Resultado (2026-11-24, usuario): `test:db` con **6 archivos y 72 pruebas** en verde (D = 72); `npm test` con **32 archivos y 470 pruebas** en verde. U + D = 398 + 72 = 470 y 26 + 6 = 32: se reproduce la línea base.
- [x] T-1.6 `cd backend && npx tsc --noEmit` sin errores, y `git status` confirma que `backend/tests/` no cambió.
  - Resultado (2026-11-24): `npx tsc --noEmit` sin errores (código 0); `git status` no muestra cambios en `backend/tests/`; diff de UT-1: 34 adiciones y 3 eliminaciones (37 líneas) en 2 archivos.

**Verificación UT-1:** T-1.3 a T-1.6 observados y registrados.

**Commit sugerido (1):** `test(backend): separar las pruebas en los proyectos unit y db de Vitest`

### UT-1b: Control de la clasificación (agregada el 2026-11-24)

Motivo: hallazgo R3-001 de la revisión de `74e6825`. Una prueba nueva con base protegida con `describe.skipIf(!DATABASE_URL_PRUEBA)` que no se agregue a `ARCHIVOS_CON_BASE` cae en `unit`, donde la CI la omite en silencio, y nunca corre en `db`. El usuario aprobó cerrar el hueco con una prueba unitaria.

- [x] T-1.7 RED: prueba unitaria en `backend/tests/` (proyecto `unit`, sin base) que recorre `backend/tests/*.test.ts` y falla si un archivo que menciona `DATABASE_URL_PRUEBA` no está en `ARCHIVOS_CON_BASE`, con un mensaje que nombre el archivo. Para demostrar el RED sin tocar archivos de prueba existentes, la lógica de detección es una función pura probada también con entradas en memoria (un archivo con gate fuera de la lista debe detectarse).
  - Resultado RED (2026-11-24): se escribió `backend/tests/controlClasificacion.test.ts` (4 pruebas: 3 con entradas en memoria y 1 que lee los `tests/*.test.ts` reales) antes de existir el módulo. `vitest run --project unit tests/controlClasificacion.test.ts` (con `DATABASE_URL` inalcanzable y sin `DATABASE_URL_PRUEBA`): `FAIL |unit| tests/controlClasificacion.test.ts` — `Error: Cannot find module './clasificacion/archivosConBase'`; `Test Files 1 failed (1)`, `Tests no tests`.
- [x] T-1.8 GREEN: exponer la lista `ARCHIVOS_CON_BASE` para que la prueba la use sin duplicarla (fuente única) y lograr la prueba en verde. `vitest list`: `unit` pasa a 27 archivos y `db` sigue en 6.
  - Resultado GREEN (2026-11-24): nuevo módulo `backend/tests/clasificacion/archivosConBase.ts` (no es `*.test.ts`) con `ARCHIVOS_CON_BASE` (fuente única, importada por `vitest.config.ts`) y la función pura `archivosConBaseFueraDeLista`. Primera corrida: 3 de 4 en verde y 1 roja (`tests/controlClasificacion.test.ts` se detectaba a sí mismo por contener la marca literal); se armó la marca por partes (`"DATABASE_URL_" + "PRUEBA"`) en la prueba. Además, `tsc` pidió extensión en el import relativo (TS2835): `./clasificacion/archivosConBase.js` en la prueba y `.ts` en `vitest.config.ts`. Corrida final: `Test Files 1 passed (1)`, `Tests 4 passed (4)`. `vitest list --filesOnly`: `unit` = 27 (incluye `controlClasificacion.test.ts`), `db` = 6.
- [x] T-1.9 `test:unit` con `DATABASE_URL` inalcanzable en verde, `npx tsc --noEmit` sin errores y `backend/tests/` sin cambios en los 32 archivos existentes.
  - Resultado (2026-11-24): `npm run test:unit` (`DATABASE_URL` inalcanzable, sin `DATABASE_URL_PRUEBA`): **27 archivos y 402 pruebas** en verde (398 + 4). `npx tsc --noEmit` código 0. `git status --short backend/tests`: solo `?? backend/tests/clasificacion/` y `?? backend/tests/controlClasificacion.test.ts`; ninguno de los 32 archivos existentes modificado. Diff: `vitest.config.ts` 4 adiciones y 10 eliminaciones; archivos nuevos 52 + 29 líneas (total 95 líneas autoradas).

**Commit sugerido (1b):** `test(backend): detectar pruebas con base fuera del proyecto db`

---

## UT-2: Node fijado y CI (commit 2, ~95 líneas)

Satisface: D3, D4, D5, D6 y criterios de éxito 5 a 7. Decisiones de diseño 4 y 5. Depende de UT-1 (la CI usa los scripts nuevos).

- [x] T-2.1 Confirmar la versión mayor vigente de `actions/checkout` y `actions/setup-node` (con Context7 o la página de lanzamientos de cada acción). Si hay una mayor estable posterior a `v5`, usarla en ambos jobs. Registrar el resultado. (Pregunta abierta del diseño)
  - Resultado (2026-11-24): releases/latest de la API de GitHub: `actions/checkout` v7.0.1 y `actions/setup-node` v7.1.0. Se usan `@v7` en ambos jobs (desviación del `@v5` del diseño). Que setup-node v7 acepte `node-version-file`, `cache` y `cache-dependency-path` lo verificó el orquestador en el `action.yml` de la etiqueta `v7` (2026-11-24): los tres parámetros existen. La corrida de la CI (T-2.7) sigue siendo la prueba de ejecución.
- [x] T-2.2 Crear `.nvmrc` en la raíz con una sola línea: `24`. Confirmar con los `engines` leídos en T-0.1 que 24 está en la intersección `^20.19.0 || ^22.13.0 || >=24`.
  - Resultado (2026-11-24): `.nvmrc` creado con una línea (`24`); 24 está en la intersección `^20.19.0 || ^22.13.0 || >=24` (T-0.1).
- [x] T-2.3 Crear `.github/workflows/ci.yml` con el contenido de la decisión 4: disparadores `push` a `desarrollo` y `workflow_dispatch`, `permissions: contents: read`, `concurrency`, job `backend` (servicio `postgres:15`, `npm ci`, `prisma generate`, `tsc --noEmit`, `test:unit` con `DATABASE_URL` inalcanzable, `migrate deploy`, `db seed`, `test:db`) y job `frontend` (`npm ci`, `lint`, `build`). Sin `secrets.*` ni variables de Mercado Pago; `JWT_SECRET` ficticio con su comentario.
  - Resultado (2026-11-24): `.github/workflows/ci.yml` creado (102 líneas) con el contenido de la decisión 4, acciones en `@v7`, comentarios en español, sin `secrets.*` y `JWT_SECRET` ficticio comentado.
- [x] T-2.4 Verificación local del frontend antes del primer push: `cd frontend && npm ci && npm run lint && npm run build`. Registrar el resultado. Si falla por un error que bloquea, corregir solo ese error sin ampliar el alcance; si no es trivial, consultar.
  - Resultado final (2026-11-24, Node local v26.12.1): con el servidor de Vite (PID 6472) detenido, `npm ci` completo, `npm run lint` sin errores ni advertencias y `npm run build` correcto (`tsc -b` y `vite build`, 1880 módulos). `npm ci` informa vulnerabilidades de `npm audit`: fuera de alcance. Sin cambios de código.
  - Primer intento, BLOQUEADO (2026-11-24): `npm ci` en `frontend/` falló con EPERM al borrar `node_modules/@rolldown/binding-win32-x64-msvc/rolldown-binding.win32-x64-msvc.node` (archivo en uso, probablemente un `vite` o proceso de Node abierto). Dos intentos, mismo error; `frontend/node_modules` quedó a medias (sin `eslint` ni `tsc`), así que lint y build no se pudieron correr. Pendiente: el usuario cierra los procesos de Node/el servidor de Vite y corre `cd frontend && npm ci && npm run lint && npm run build`.
- [x] T-2.5 Si `node --version` local es 24: correr localmente `npm ci`, `tsc`, `test:unit`, `test:db`, `lint` y `build` (decisión 5, paso 3). Si es otra mayor, la corrida local es informativa y la ejecución real es la CI (paso 4). Registrar la versión usada.
  - Resultado (2026-11-24): Node local v26.12.1 (no 24): corrida informativa. Backend `npx tsc --noEmit` sin errores y `test:unit` con `DATABASE_URL` inalcanzable: 26 archivos y 398 pruebas en verde. `npm ci`, `test:db`, lint y build no se corrieron aquí (ver T-2.4); la ejecución real es la CI.
- [x] T-2.6 Validar el YAML (sintaxis y claves) por lectura y, si el entorno lo permite, con un validador local. No se ejecuta ni se modifica `backend/.env`.
  - Resultado (2026-11-24): Sin validador de YAML local (no hay `yaml` ni `js-yaml` en `node_modules`; no se descargan paquetes). Validado por lectura: sintaxis, indentación y claves (`on`, `permissions`, `concurrency`, `jobs.*.services`, `steps`) coinciden con el diseño. La validación real la hace Actions al primer push.
- [x] T-2.7 El usuario hace push de `desarrollo` (después del commit 2 o del 3) y observa la corrida de Actions: los jobs `backend` y `frontend` en verde, con el mismo total de pruebas que el local. La corrida de `74e6825` (sin UT-1b) debe dar U + D = 398 + 72 = 470; desde el commit de UT-1b, 402 + 72 = 474 en 33 archivos. Alternativa: ejecutar el workflow con `workflow_dispatch` desde la pestaña Actions. Si la CI muestra otro total, se investiga antes de cerrar. Registrar el enlace o resultado de la corrida.
  - Resultado (2026-11-24, usuario): corrida "Update #1" del workflow CI sobre `74e6825` (push a `desarrollo`), con Node 24 y acciones `@v7`. El intento 1 terminó en verde; el usuario la volvió a correr (intento 2, "Re-run all jobs") y también terminó en verde, en 1 min 2 s. Backend (56 s): `test:unit` 26 archivos y 398 pruebas; `test:db` 6 archivos y 72 pruebas; 398 + 72 = 470, igual que en local. Frontend (23 s): lint y build en verde.
  - Segunda corrida (2026-11-24, usuario): "Update 2 #2" sobre `9a484b7` (push a `desarrollo`, con UT-1b y UT-3), en verde en 1 min 4 s. Backend (1 min 0 s): `test:unit` 27 archivos y 402 pruebas; `test:db` 6 archivos y 72 pruebas; 402 + 72 = 474 en 33 archivos. Frontend (18 s) en verde.
- [x] T-2.8 Si 24 falla por una causa atribuible a Node (no a las pruebas), probar `22` con `workflow_dispatch`, fijar la versión que pase y registrar el resultado aquí (decisión 5, paso 5). Si el umbral de 8 s de `concurrenciaReservas.test.ts:230` falla en el runner, se reejecuta una vez y se registra como riesgo conocido, sin tocar la prueba.
  - No aplica (2026-11-24): Node 24 pasó en los dos intentos y el umbral de 8 s no falló. `.nvmrc` queda en `24`.
- [x] T-2.9 Repetir la corrida con `workflow_dispatch` y confirmar que también termina en verde (criterio de éxito 6).
  - Resultado (2026-11-24): corrida 45466100311, evento `workflow_dispatch` sobre `9a484b7` (rama `desarrollo`), disparada con `gh workflow run ci.yml --ref desarrollo`. Conclusión `success`: Backend y Frontend en verde; `test:unit` 27 archivos y 402 pruebas, `test:db` 6 archivos y 72 pruebas (474).

**Verificación UT-2:** T-2.1 a T-2.9 observados; `git status` sin cambios en `backend/tests/`.

**Commit sugerido (2):** `ci: agregar la integración continua de backend y frontend y fijar Node 24`

---

## UT-3: Documentación y convenciones (commit 3, ~75 líneas)

Satisface: D7 y criterio de éxito 8. Sección "Documentación" del diseño. Las tareas son independientes entre sí (paralelizables).

- [x] T-3.1 `.claude/skills/testing-backend/SKILL.md`: describir los proyectos `unit` y `db` y los tres scripts; agregar la sección "Clasificar una prueba nueva" (por defecto `unit`; si usa la base real, agregar a `ARCHIVOS_CON_BASE`; control: `test:unit` con `DATABASE_URL` inalcanzable); ciclo TDD con `test:unit` para iterar y `npm test` contra la base descartable para pruebas de `db`; reemplazar la frase "Sin esa variable, `npm test` omite esas pruebas" por la descripción correcta; mencionar qué corre cada job de la CI.
  - Resultado (2026-11-24): hecho. Tabla de scripts, secciones "Clasificar una prueba nueva", "Pruebas con base" e "Integración continua"; la frase vieja eliminada.
- [x] T-3.2 `docs/operacion/desarrollo-local.md`: "Versión exacta de Node: Pendiente" pasa a "Node 24 (`.nvmrc`)"; sección "Pruebas del backend" con los tres scripts y comandos en PowerShell y bash (base descartable con `migrate deploy` y `db seed`), con enlace a `variables-entorno.md`; sección breve "Integración continua".
  - Resultado (2026-11-24): hecho (Node 24, scripts, bash y PowerShell, enlace e "Integración continua").
- [x] T-3.3 `docs/operacion/variables-entorno.md`: corregir la fila de `DATABASE_URL_PRUEBA` y la sección "Base descartable para pruebas" (tres archivos de `db` sin gate; `test:db` y `npm test` exigen la base descartable; `test:unit` no la necesita). Con el visto bueno del usuario del 2026-11-24.
  - Resultado (2026-11-24): hecho. Desviación del diseño: el diseño dice "tres archivos de `db` sin gate", pero `rg skipIf` sobre `backend/tests/` muestra 4 archivos con gate (`concurrenciaReservas`, `liberarAlCrearReservaBase`, `migracionReservaInvitado`, `rutasAdminReservas`) y solo 2 sin gate (`integration` y `secretosJwt`). Los documentos dicen lo observado.
- [x] T-3.4 `openspec/config.yaml`: mantener `tdd_scope.command` y `test_command`; agregar en `projects[backend]` `test_unit_command` y `test_db_command`; actualizar `notes` y `rules.verify` según el diseño (`test:unit` sin base, `npm test` contra la base descartable, `tsc --noEmit`, y `lint` y `build` del frontend).
  - Resultado (2026-11-24): hecho; `test_unit_command` y `test_db_command` agregados, `notes` y `rules.verify` actualizados. YAML releído: comillas y sangría coinciden con el resto del archivo.
- [x] T-3.5 `.claude/commands/cerrar-sesion.md`, paso 5: exigir `npx tsc --noEmit`, `npm run test:unit` en verde y `npm test` completo (32 archivos) contra la base descartable con `migrate deploy` y `db seed`; si la base no responde, la integración se bloquea; nunca usar la `DATABASE_URL` de `backend/.env`; eliminar la tolerancia de "exactamente 5 fallas de conexión" y la línea "rige hasta que `calidad-ci` separe…"; agregar la confirmación del usuario de que la última corrida de la CI en `desarrollo` está en verde.
  - Resultado (2026-11-24): hecho; tolerancia de "5 fallas" y línea "rige hasta que `calidad-ci`…" eliminadas; agregados `test:unit`, migrate/seed, prohibición de `.env` y confirmación de la CI.
- [x] T-3.6 Relectura cruzada: los scripts, la cantidad de archivos (26 y 6) y los comandos coinciden entre los cinco archivos y con `vitest.config.ts` y `ci.yml`.
  - Resultado (2026-11-24): scripts (`test:unit`, `test:db`, `npm test`), jobs de la CI, Node 24, puerto 5434 y la secuencia migrate deploy, db seed y test coinciden entre los cinco archivos, `vitest.config.ts` y `ci.yml`. Los documentos no fijan conteos de pruebas. `rg` sobre los archivos tocados: sin "5 fallas" ni "omite esas pruebas". Diff de UT-3: 94 adiciones y 17 eliminaciones (111 líneas) en 5 archivos. `backend/tests/` sin cambios.

**Verificación UT-3:** relectura; ninguna referencia residual a "se omiten" ni a "5 fallas" (`rg` sobre los archivos tocados).

**Commit sugerido (3):** `docs: documentar los grupos de pruebas, la CI y la nueva integración diaria`

---

## UT-4: Hoja de ruta y artefactos (commit 4)

- [x] T-4.1 `docs/producto/hoja-de-ruta.md`, fila 4: pasar a "en curso" al empezar apply y a "hecho" cuando UT-2 (CI en verde) y UT-3 estén cerradas. La bitácora la actualiza `/cerrar-sesion`, no esta tarea.
  - Resultado (2026-11-24): fila 4 en "hecho", con el objetivo reescrito según lo entregado (proyectos `unit` y `db`, prueba de control y CI con Node 24). No pasó por "en curso" porque apply se hizo en la misma sesión.
- [x] T-4.2 Marcar los criterios de éxito de `proposal.md` con la evidencia de UT-0 a UT-3 y registrar en este archivo los resultados observados (línea base, `U`, `D`, versión de Node y enlace de la corrida de la CI).
  - Resultado (2026-11-24): los 9 criterios marcados con su evidencia (el de `npm test` local, 474 en 33, lo confirmó el usuario). Resultados: línea base 470 en 32; `U` = 398 (402 con UT-1b); `D` = 72; Node 24 en la CI (local v26.12.1, informativo); corridas de la CI sobre `74e6825` y `9a484b7` (push) y https://github.com/RamiroMunozz/Sistema-de-Reservas/actions/runs/45466100311 (`workflow_dispatch`). Pendiente informativo: el `npm test` local completo (474 en 33) no se volvió a correr después de UT-1b; la CI cubre ambos grupos.

**Commit sugerido (4):** `docs(openspec): agregar los artefactos de calidad-ci-backend`

---

## Orden y dependencias

- Secuencial: UT-0, luego UT-1, luego UT-2. El commit 1 va antes del 2 porque la CI usa los scripts nuevos.
- Paralelizable: T-3.1 a T-3.5 entre sí; UT-3 puede hacerse mientras se espera la corrida de la CI de T-2.7.
- UT-4 al final, cuando la CI esté en verde.

## Resumen de verificación final (antes de `sdd-verify`)

Ejecutado por el orquestador el 2026-11-24 (Node local v26.12.1), salvo donde se indica:

- [x] `vitest list`: 6 (`db`) y 27 (`unit`, con la prueba de control de UT-1b).
- [x] `test:unit` en verde con `DATABASE_URL` inalcanzable: 27 archivos y 402 pruebas.
- [x] `npm test` contra la base descartable: 474 pruebas en 33 archivos (470 de la línea base más las 4 de UT-1b). Corrido por el usuario el 2026-11-24: 33 archivos y 474 pruebas en verde (33,0 s).
- [x] `npx tsc --noEmit` (backend) sin errores; `npm run lint` y `npm run build` (frontend) en verde.
- [x] CI en verde en push (`74e6825`, `9a484b7`) y en `workflow_dispatch` (corrida 45466100311).
- [x] Los 32 archivos de prueba existentes sin cambios: `git diff --stat 6a2e254 -- backend/tests` solo muestra los 2 archivos nuevos de UT-1b (81 líneas agregadas).
