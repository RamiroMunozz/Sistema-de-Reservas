# Progreso de apply: deuda-auditoria

Estado: todas las tareas (T-1.1 a T-7.1) completas. Sin commits (los hace el usuario).

Línea base (T-1.1): 6 fallas, 90 pasan, 18 omitidas; todas por falta de PostgreSQL (integration.test.ts suite, 5 en rutasAdminReservas.test.ts, 1 en secretosJwt.test.ts "acepta un token emitido por la aplicación"). Final: 6 fallas (mismas), 110 pasan, 18 omitidas.

RED observado:
- ADM-003: 4 casos con 200 en lugar de 400 (las cuatro fechas inexistentes).
- CAN-015: 3 rutas con 404 en lugar de 400.
- CAN-010: `data` con `isActive: true`/`isIndoor: false` agregados (3 de 4 casos).
- ADM-002: `totalRevenueARS` 0.30000000000000004 en lugar de 0.3.

Verificación final: tsc sin errores; build sin errores; `rg any|as unknown as` en backend/src: solo `core/config/security.ts:47` (fuera de alcance).
