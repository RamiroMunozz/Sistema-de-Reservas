---
name: testing-backend
description: Cómo escribir y ejecutar pruebas del backend con Vitest y el ciclo TDD estricto RED, GREEN, REFACTOR. Usar al implementar o modificar cualquier código en backend/ o al agregar pruebas en backend/tests.
---

# Pruebas del backend

- Framework: Vitest (`backend/vitest.config.ts`; entorno `node`, `testTimeout` de 10 s, archivos en serie).
- Dos proyectos de Vitest:
  - `unit`: todo `tests/**/*.test.ts` salvo `ARCHIVOS_CON_BASE`. No usa la base de datos.
  - `db`: los archivos de `ARCHIVOS_CON_BASE`. Usan la base real y solo se corren contra la base descartable.
- Scripts (desde `backend/`):

| Script | Qué corre | Base |
|---|---|---|
| `npm run test:unit` | proyecto `unit` | No la necesita |
| `npm run test:db` | proyecto `db` | Descartable, con migraciones y semilla |
| `npm test` | ambos proyectos (`vitest run`) | Descartable, con migraciones y semilla |

- Verificación de tipos: `cd backend && npx tsc --noEmit`.
- Las pruebas HTTP usan `supertest` contra `app` (`backend/src/app.ts`).

## TDD estricto (obligatorio en el backend)

1. **RED**: escribir la prueba que describe el comportamiento y ejecutarla; debe fallar por el motivo correcto. Registrar el fallo observado.
2. **GREEN**: implementar lo mínimo para que pase. Registrar el resultado.
3. **REFACTOR**: limpiar con las pruebas en verde.

Para iterar se usa `npm run test:unit`. Cuando la prueba es de `db`, se corre `npm test` (o `npm run test:db`) contra la base descartable.

No se inventa evidencia: si no se observó el RED, no se declara. El frontend no tiene pruebas todavía (cambio `calidad-ci`).

## Convenciones

- Archivos en `backend/tests/` con nombre descriptivo en español y sufijo `.test.ts` (por ejemplo `webhookPago.test.ts`).
- Nombres de `describe` e `it` en español, en lenguaje de comportamiento ("rechaza un turno ya reservado").
- Sin `any`; fechas en UTC con `toISOString()`.
- Pruebas por escenario de la spec correspondiente; citar el ID del requisito cuando exista.

## Clasificar una prueba nueva

- Por defecto va al proyecto `unit`: no hace falta tocar la configuración.
- Si usa la base real (no mockea `src/core/config/prisma.js`), se agrega su ruta a `ARCHIVOS_CON_BASE` en `backend/tests/clasificacion/archivosConBase.ts`, la fuente única que usa `vitest.config.ts`. La prueba `controlClasificacion.test.ts` falla si un archivo menciona `DATABASE_URL_PRUEBA` y no está en esa lista; no detecta una prueba con base que no use esa variable, así que la revisión sigue siendo necesaria.
- Control: `npm run test:unit` debe pasar con una `DATABASE_URL` inalcanzable (puerto cerrado) y sin `DATABASE_URL_PRUEBA`. Si falla por conexión, la prueba está mal clasificada.

```bash
cd backend
DATABASE_URL="postgresql://sin_base:sin_base@127.0.0.1:1/sin_base" npm run test:unit
```

## Fixtures de dos negocios

Las pruebas de aislamiento (`aislamiento*.test.ts`, `negociosPorSlug.test.ts`) usan `backend/tests/ayudantes/negociosDePrueba.ts`:

- `crearNegocioDePrueba()`: crea un negocio con slug único (`prueba-<id>`), distinto de `principal`. Se crean dos (A y B) y se opera como el dueño de A con ids de B.
- `firmarToken(secreto, payload)`: firma un token con el secreto de la prueba (nunca el de `.env`).
- `borrarNegocioDePrueba(idNegocio)`: borra el negocio y todo lo que le pertenece, en orden de dependencia; va en `afterAll`.
- `tests/ayudantes/tokens.ts` (`payloadDePrueba`): arma el payload según el rol (`JUGADOR` o `DUENO`) para las pruebas sin base.

Cada prueba de aislamiento comprueba que la respuesta con un id ajeno es la misma que con un id inexistente y que el recurso ajeno no cambió.

## Pruebas con base (proyecto `db`)

Escriben y borran datos reales en la base a la que apunta Prisma (`DATABASE_URL`). Por eso `test:db` y `npm test` se corren solo contra la base descartable `reservas_prueba`, con `DATABASE_URL` y `DATABASE_URL_PRUEBA` definidas en línea con su URL, después de `prisma migrate deploy` y `prisma db seed` (ver `docs/operacion/variables-entorno.md`, "Base descartable para pruebas"). Se recarga la semilla antes de cada corrida.

Tres archivos del proyecto `db` (`concurrenciaReservas`, `liberarAlCrearReservaBase` y `migracionReservaInvitado`) usan `describe.skipIf(!DATABASE_URL_PRUEBA)`. Los otros tres usan la base sin ese gate y fallan sin base: `integration.test.ts`, `secretosJwt.test.ts` y el primer `describe` de `rutasAdminReservas.test.ts` (su segundo `describe` sí tiene el gate). El README exige que `DATABASE_URL_PRUEBA` tenga el mismo valor que `DATABASE_URL`. Ningún archivo compara las variables: la protección depende de quien lo ejecuta. Nunca correr `db` con una `DATABASE_URL` que apunte a una base con datos reales.

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `desarrollo` y a mano (`workflow_dispatch`), con Node de `.nvmrc`:

- Job `backend`: `npm ci`, `prisma generate`, `tsc --noEmit`, `test:unit` con `DATABASE_URL` inalcanzable, `migrate deploy`, `db seed` y `test:db` contra un servicio `postgres:15`.
- Job `frontend`: `npm ci`, `npm run lint` y `npm run build`.
