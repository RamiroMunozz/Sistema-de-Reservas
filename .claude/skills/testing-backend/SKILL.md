---
name: testing-backend
description: Cómo escribir y ejecutar pruebas del backend con Vitest y el ciclo TDD estricto RED, GREEN, REFACTOR. Usar al implementar o modificar cualquier código en backend/ o al agregar pruebas en backend/tests.
---

# Pruebas del backend

- Framework: Vitest (`backend/vitest.config.ts`; incluye `tests/**/*.test.ts`, entorno `node`, `testTimeout` de 10 s).
- Ejecutar: `cd backend && npm test` (`vitest run`).
- Verificación de tipos: `cd backend && npx tsc --noEmit`.
- Las pruebas HTTP usan `supertest` contra `app` (`backend/src/app.ts`).

## TDD estricto (obligatorio en el backend)

1. **RED**: escribir la prueba que describe el comportamiento y ejecutarla; debe fallar por el motivo correcto. Registrar el fallo observado.
2. **GREEN**: implementar lo mínimo para que pase. Registrar el resultado.
3. **REFACTOR**: limpiar con las pruebas en verde.

No se inventa evidencia: si no se observó el RED, no se declara. El frontend no tiene pruebas todavía (cambio `calidad-ci`).

## Convenciones

- Archivos en `backend/tests/` con nombre descriptivo en español y sufijo `.test.ts` (por ejemplo `webhookPago.test.ts`).
- Nombres de `describe` e `it` en español, en lenguaje de comportamiento ("rechaza un turno ya reservado").
- Sin `any`; fechas en UTC con `toISOString()`.
- Pruebas por escenario de la spec correspondiente; citar el ID del requisito cuando exista.

## Pruebas de concurrencia

`backend/tests/concurrenciaReservas.test.ts` usa `describe.skipIf(!process.env.DATABASE_URL_PRUEBA)`: solo corren si `DATABASE_URL_PRUEBA` está definida. Escriben y borran datos reales en la base a la que apunta Prisma (`DATABASE_URL`). El README exige que `DATABASE_URL_PRUEBA` tenga el mismo valor que `DATABASE_URL` y que sea una base descartable con las migraciones aplicadas.

El archivo no compara ambas variables: la protección depende de quien lo ejecuta. Nunca definir `DATABASE_URL_PRUEBA` apuntando a una base con datos reales. Sin esa variable, `npm test` omite esas pruebas.
