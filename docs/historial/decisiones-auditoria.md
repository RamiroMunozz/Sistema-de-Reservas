# Decisiones de la corrección de la auditoría

Registro de las tareas y decisiones tomadas al corregir los hallazgos de `auditoria-seguridad.md` (noviembre de 2026, rama `fix/security-audit`, integrada en `main`). Explica por qué el código actual se comporta como lo hace.

## Tareas

| Tarea | Alcance | Evidencia |
|---|---|---|
| T1 | Docker Compose referencia los Dockerfiles existentes y la ruta `/api/v1`; `.dockerignore` en backend y frontend. | Solo se validó el YAML; `docker compose` no estaba disponible. Commit `8971a02`. |
| T2 | Tipado de `req.user`, sin `any` en `booking.controller.ts`, sin loguear el payload del JWT y rol ADMIN exigido en las rutas admin de reservas. | RED: un USER recibía 200, 500 y 400. GREEN: 10/10 en `tests/rutasAdminReservas.test.ts`. Commits `b02075e` y `24a9868`. |
| T3 | Autenticación, control de dueño y de estado en `create-preference`. | RED: 8 de 9 fallaban. GREEN: 9/9 en `tests/preferenciaPago.test.ts`. Commit `df82fb6`. |
| T4 | Firma del webhook (`WebhookSignatureValidator`), control de monto, `notification_url` desde `BACKEND_URL`, sin reconfirmar sobre un turno ocupado. | RED: 18 fallaban. GREEN: 19 en `tests/webhookPago.test.ts` y 12 en `tests/preferenciaPago.test.ts`. |
| T5 | Sin secretos JWT por defecto, un solo punto de verificación, HS256 y arranque fallido sin `JWT_SECRET`. | RED: tokens con `default_secret` y HS512 recibían 200. GREEN: 9/9 en `tests/secretosJwt.test.ts`. |
| T6 | Restricción `EXCLUDE`, bloqueo por cancha y respuesta 409. | RED: de 20 pedidos simultáneos, 11 reservaron. GREEN: 300 rondas de 10 pedidos con exactamente una reserva por turno, 0 deadlocks y 49 ms de máximo. `tests/concurrenciaReservas.test.ts`: 10/10 en base descartable. |
| T7 | Configuración de Gentle AI en el repositorio. | Pi quedó sin funcionar por una API key inválida. |
| T8 | Informe en `auditoria-seguridad.md`. | — |
| T9 | DTOs en reservas, rate limit de autenticación, CORS con `FRONTEND_URL`, `lock_timeout`, errores internos ocultos y disponibilidad que no marca libre lo completado. | RED: 23 de 28 fallaban. GREEN: `npm test` con 84 pasan y 12 omitidos; concurrencia 12/12 en base descartable. |

## Decisiones

### Webhook de Mercado Pago (T4)

- Solo se procesa `data.id` de la URL, porque es lo que cubre la firma, y solo IDs de pago numéricos.
- No se usa tolerancia de tiempo: la documentación no aclara si los reintentos renuevan `ts`. La protección ante repetición viene de que cada transición de estado es idempotente.
- Un pago aprobado sobre una reserva cancelada la reconfirma si el turno sigue libre, porque Mercado Pago permite reintentar tras un rechazo. Si el turno está ocupado, queda un aviso para revisión manual.
- Un pago rechazado sigue cancelando reservas activas hasta resolver el punto A3 de la auditoría.
- No se cobra si falta `MERCADOPAGO_WEBHOOK_SECRET`.
- Se mantiene `paymentMethod: "TRANSFER"`.

### Prevención de solapamiento (T6)

- No se usa Redis: la restricción en PostgreSQL es la garantía y no puede expirar.
- La restricción bloquea toda reserva distinta de `CANCELLED`.
- Medición: solo con `EXCLUDE` hubo 324 deadlocks en 2700 pedidos y esperas de hasta 9 s, sin duplicados. Por eso se agregó `pg_advisory_xact_lock` por cancha (ver ADR 0003).
- Se versiona la migración `20261031231330_nueva_migracion`, porque sin ella una base nueva no coincide con `schema.prisma`.

### Validación y errores (T9)

- La regla de turno pasado aplica solo a usuarios; el admin puede registrar turnos pasados.
- La duración máxima y los horarios de cada cancha quedan para las specs, porque no había criterio definido.
- Las respuestas de error de reservas pasan de `message` a `detail`; el frontend lee ambos.

### Build del backend

- `npm run build || true` se mantiene en el `DockerFile` del backend hasta corregir los errores de `tsc`; quitarlo rompería el build de la imagen. Pendiente en el cambio `deuda-auditoria`.

## Pendientes heredados

- Rotar `JWT_SECRET` de `backend/.env`: parece ser el valor viejo del compose, público en el historial.
- `PATCH` admin y `cancel` responden 500 con un UUID inexistente.
- `booking.service.ts` loguea `userId`.

Estos puntos se siguen en el cambio `deuda-auditoria` de la hoja de ruta.
