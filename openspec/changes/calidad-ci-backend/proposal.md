# Propuesta: calidad-ci-backend

Copia en Engram: `sdd/calidad-ci-backend/proposal`. Exploración: `openspec/changes/calidad-ci-backend/exploration.md`. Hoja de ruta: cambio N.º 4.

## Intención

El próximo cambio, `multi-tenant-negocios`, toca casi todos los servicios del backend. Hoy no hay una red de seguridad automática que lo respalde:

- Solo existe el script `npm test` (`backend/package.json:13`), que mezcla pruebas puras, pruebas con Prisma simulado y pruebas contra una base real.
- Sin base disponible, `npm test` falla: `integration`, un test de `secretosJwt` y el primer `describe` de `rutasAdminReservas` usan la base sin `skipIf`. La nota del skill `testing-backend` ("sin esa variable, `npm test` omite esas pruebas") es incompleta.
- La regla de integración diaria de `/cerrar-sesion` acepta "exactamente 5 fallas de conexión", un criterio frágil.
- No existe `.github/`: nadie verifica `tsc`, las pruebas, el lint ni el build fuera de la máquina del desarrollador. Tampoco hay una versión de Node fijada.

**Por qué ahora:** es el paso previo acordado en la hoja de ruta. Separar las pruebas y automatizar su ejecución antes de introducir el negocio como unidad de aislamiento permite detectar regresiones en cada push a `desarrollo`.

## Decisiones tomadas

| N.º | Decisión | Origen |
|---|---|---|
| D1 | Separación con proyectos de Vitest (`unit` y `db`) en `backend/vitest.config.ts`. Scripts: `test:unit` (sin base), `test:db` (base descartable) y `test` (ambos grupos). | Usuario (exploración, sección 8) |
| D2 | Los 3 archivos sin gate (`integration`, `secretosJwt` y `rutasAdminReservas`) pasan completos al grupo `db`, sin modificar su contenido. | Usuario |
| D3 | GitHub Actions con dos jobs: `backend` (servicio PostgreSQL 15, `npm ci`, `prisma generate`, `tsc --noEmit`, `test:unit`, `migrate deploy`, `db seed`, `test:db`) y `frontend` (`npm ci`, `lint`, `build`). | Usuario |
| D4 | Disparadores: `push` a `desarrollo` y `workflow_dispatch`. El proyecto no usa PR. | Usuario |
| D5 | Versión de Node fijada en `.nvmrc`, elegida con una ejecución real durante la implementación. | Usuario (pregunta abierta para apply) |
| D6 | `JWT_SECRET` ficticio en el YAML; la CI no necesita secretos de Mercado Pago. | Usuario |
| D7 | Se actualizan el skill `testing-backend`, `docs/operacion/desarrollo-local.md`, `docs/operacion/variables-entorno.md`, `openspec/config.yaml` y la regla de integración diaria de `/cerrar-sesion`. | Usuario |

## Alcance

### Dentro del alcance

1. **Proyectos de Vitest:** `backend/vitest.config.ts` define los proyectos `unit` (grupos A y B de la exploración: 26 archivos puros o con Prisma simulado) y `db` (grupo C: `concurrenciaReservas`, `liberarAlCrearReservaBase`, `migracionReservaInvitado`, `rutasAdminReservas`, `integration` y `secretosJwt`). Se conservan `globals`, entorno `node`, `testTimeout` de 10 s y `fileParallelism: false`.
2. **Scripts:** `test:unit`, `test:db` y `test` (ambos) en `backend/package.json`. El contenido de los archivos de prueba no cambia.
3. **Versión de Node:** `.nvmrc` en la raíz, con la versión que pase `npm ci`, `tsc`, las pruebas, el lint y el build en una ejecución real.
4. **Integración continua:** `.github/workflows/ci.yml` con los jobs `backend` y `frontend` según D3 y D4, `actions/setup-node` leyendo `.nvmrc` y caché de npm por lockfile. `DATABASE_URL` y `DATABASE_URL_PRUEBA` con el mismo valor, apuntando al servicio; `JWT_SECRET` ficticio. El job `backend` corre `tsc` y `test:unit` antes de preparar la base, para fallar rápido.
5. **Documentación y convenciones:**
   - Skill `testing-backend`: los tres scripts, qué va a cada proyecto y cómo clasificar una prueba nueva.
   - `docs/operacion/desarrollo-local.md`: versión de Node, cómo correr cada grupo y la base descartable.
   - `docs/operacion/variables-entorno.md`: corregir la afirmación de que sin `DATABASE_URL_PRUEBA` las pruebas con base se omiten (agregado el 2026-11-24 con el visto bueno del usuario).
   - `openspec/config.yaml`: comandos de prueba y de verificación por grupo.
   - `.claude/commands/cerrar-sesion.md`: la integración diaria exige `test:unit` en verde y `npm test` completo contra la base descartable con semilla, en lugar de aceptar 5 fallas de conexión.
6. **Hoja de ruta:** estado de la fila 4.

### Fuera del alcance

- Pruebas del frontend y su incorporación a la CI (fila 10, `calidad-ci`).
- Linter del backend.
- Quitar el `any` de `integration.test.ts:44`.
- Dividir `secretosJwt` y `rutasAdminReservas` para mockear Prisma en su parte sin base (D2).
- Relajar el umbral de 8 s de `concurrenciaReservas.test.ts:230` (se registra como riesgo conocido).
- Fechas fijas futuras de las pruebas (por ejemplo `2031-04-10`), que quedarán en el pasado dentro de unos años.
- Disparadores sobre `main` o PR, protección de ramas y despliegue (fila 11).
- `engines` en los `package.json` (D5 fija la versión solo en `.nvmrc`).

## Capacidades

> Contrato con la fase de specs. Las delta specs irían en `openspec/changes/calidad-ci-backend/specs/<dominio>/spec.md`, según `convencion-specs`.

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

Ninguna.

**Sin delta specs.** Las specs vigentes (`autenticacion`, `reservas`, `canchas`, `pagos`, `administracion`) describen comportamiento observable del producto. Este cambio solo toca herramientas de prueba, la integración continua y documentación: no agrega, modifica ni elimina ningún requisito, y el contenido de las pruebas no cambia. La fase de specs puede omitirse o registrar explícitamente que no hay deltas.

## Enfoque

- **Separación por configuración, no por nombre:** los proyectos de Vitest fijan su `include` con la lista explícita de los archivos de base; `unit` incluye `tests/**/*.test.ts` y excluye esa lista. Una prueba nueva va a `unit` por defecto y pasa a `db` solo si usa la base.
- **Verificación de la separación:** `test:unit` debe pasar sin ninguna base disponible y sin `DATABASE_URL_PRUEBA`; `test:db` contra la base descartable con migraciones y semilla. La suma de ambos debe igualar la línea base actual (470 pruebas en 32 archivos).
- **CI en dos jobs paralelos:** cada job instala con `npm ci` en su carpeta. El servicio PostgreSQL 15 usa `pg_isready` como healthcheck. Se usa `migrate deploy`, nunca `migrate dev`.
- **Versión de Node por ejecución real:** se prueba localmente o con `workflow_dispatch` y se fija en `.nvmrc` la versión que pase todo.
- **TDD:** no hay código de producción nuevo. La evidencia es de ejecución: `test:unit` sin base, `test:db` con base y la corrida de la CI en GitHub.

## Entregas

Presupuesto de revisión de ~400 líneas. Estimación total ~170 a 230 líneas, dentro del presupuesto: no hace falta dividir en varias entregas. Los commits se hacen en `desarrollo` (los hace el usuario).

| Ítem | Líneas estimadas |
|---|---|
| 1 y 2. Proyectos de Vitest y scripts | ~30 a 40 |
| 3. `.nvmrc` | ~1 |
| 4. Workflow de GitHub Actions | ~70 a 90 |
| 5. Skill, `desarrollo-local.md`, `config.yaml` y `/cerrar-sesion` | ~60 a 90 |
| 6. Hoja de ruta | ~2 |

Riesgo frente al presupuesto: bajo.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/vitest.config.ts` | Modificado | Proyectos `unit` y `db`. |
| `backend/package.json` | Modificado | Scripts `test:unit`, `test:db` y `test`. |
| `.nvmrc` | Nuevo | Versión de Node. |
| `.github/workflows/ci.yml` | Nuevo | Jobs `backend` y `frontend`. |
| `.claude/skills/testing-backend/SKILL.md` | Modificado | Scripts y clasificación de pruebas. |
| `docs/operacion/desarrollo-local.md` | Modificado | Versión de Node y ejecución por grupo. |
| `openspec/config.yaml` | Modificado | Comandos de prueba y verificación. |
| `.claude/commands/cerrar-sesion.md` | Modificado | Regla de la integración diaria. |
| `docs/producto/hoja-de-ruta.md` | Modificado | Estado de la fila 4. |
| `backend/tests/` | Sin cambios | Ningún archivo de prueba se edita. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| El umbral de 8 s de `concurrenciaReservas.test.ts:230` falla en un runner más lento | Media | Riesgo conocido, fuera del alcance; si falla, se reejecuta y se registra para un cambio posterior. |
| Un archivo clasificado como `unit` usa la base y falla sin ella | Baja | Ejecutar `test:unit` sin base disponible como verificación obligatoria. |
| La suma de `test:unit` y `test:db` no iguala la línea base (archivos omitidos o duplicados) | Baja | Comparar la cantidad de archivos y pruebas con la línea base (32 y 470). |
| La versión de Node elegida no satisface `vite ^8`, `eslint ^10` o `typescript ^7` | Media | D5: se elige con una ejecución real antes de fijarla. |
| Alguna prueba depende del orden o de datos que dejó otra, y en la CI cambia el orden | Baja | `fileParallelism: false` se mantiene; la semilla se aplica en cada corrida. |
| Diferencias de mayúsculas y minúsculas entre Windows y Linux | Baja | `forceConsistentCasingInFileNames` en `tsconfig.json` y el `tsc` de la CI lo detectan. |
| El lint o el build del frontend fallan por primera vez en la CI | Baja | Correrlos localmente antes del primer push; se corrigen solo errores que bloqueen, sin ampliar el alcance. |
| El `JWT_SECRET` ficticio del YAML se confunde con un secreto real | Baja | Valor claramente ficticio y comentario en el YAML. |
| `bcrypt` con 12 rondas hace lentos la semilla y el login | Baja | Aceptado; el `testTimeout` de 10 s alcanza localmente. |

## Plan de reversa

- **Sin migraciones ni código de producción:** el cambio no toca `schema.prisma`, la base ni `backend/src`.
- **Por commit:** cada unidad (separación de pruebas, `.nvmrc` y CI, documentación) es un commit independiente en `desarrollo`; se revierte con `git revert`.
- **CI:** borrar o revertir `.github/workflows/ci.yml` la desactiva por completo; también puede deshabilitarse el workflow desde GitHub sin tocar el repositorio.
- **Pruebas:** revertir `vitest.config.ts` y `package.json` restaura el `npm test` único de hoy; ningún archivo de prueba cambia, así que no hay contenido que recuperar.

## Dependencias

- Base descartable `reservas_prueba` (puerto 5434) para verificar `test:db` localmente.
- Acceso del usuario al repositorio en GitHub para hacer push a `desarrollo` y observar la corrida de Actions (el push lo hace el usuario).
- Ninguna dependencia de otros cambios: `reserva-invitado` ya está archivado.

## Criterios de éxito

- [ ] `cd backend && npm run test:unit` pasa sin ninguna base disponible y sin `DATABASE_URL_PRUEBA`.
- [ ] `cd backend && npm run test:db` pasa contra la base descartable con migraciones y semilla.
- [ ] `cd backend && npm test` corre ambos grupos y suma las mismas 470 pruebas en 32 archivos de la línea base.
- [ ] Ningún archivo de `backend/tests/` cambia de contenido.
- [ ] `.nvmrc` existe y la CI usa esa versión.
- [ ] Un push a `desarrollo` dispara el workflow y los jobs `backend` y `frontend` terminan en verde; `workflow_dispatch` también lo ejecuta.
- [ ] El workflow no usa secretos de Mercado Pago ni secretos del repositorio.
- [ ] El skill `testing-backend`, `desarrollo-local.md`, `openspec/config.yaml` y `/cerrar-sesion` describen los tres scripts y la nueva regla de integración diaria.
- [ ] La fila 4 de la hoja de ruta refleja el estado del cambio.
