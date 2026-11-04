Objetivo: corregir paso a paso los problemas encontrados por la auditoría de seguridad y arquitectura.
Rama: fix/security-audit. Estrategia de entrega: ask-on-risk. Runner de tests: vitest (backend).

## Specs

- S1: Docker Compose debe referenciar los archivos de build existentes y la ruta de API que sirve el backend. Verificación: los valores de `dockerfile` coinciden con `DockerFile` y `VITE_API_URL` termina en `/api/v1`.
- S2: Los contextos de build de Docker deben excluir `node_modules`, `.env`, `dist` y `.git`. Verificación: existen ambos archivos `.dockerignore`.
- S3: Los handlers de reservas no deben loguear el payload del JWT. Verificación: `booking.controller.ts` no loguea `req.user`.
- S4: "Identificar y mitigar vulnerabilidades (inyecciones SQL, gestión de JWT y validación de firmas en los webhooks de Mercado Pago)." Lógica central: requiere confirmación del usuario antes de cada cambio.
- S5: "verifica que la implementación de Redis evite estrictamente las reservas duplicadas (double-booking) de las canchas." Redis no existe en el repositorio. Lógica central y migración: requiere que el usuario confirme el enfoque.
- S6: "las variables, las specs, task, logs, y todo lo que sea relacionado a este proyecto sea en español". Supuesto: aplica a todo lo que se escriba de ahora en adelante; renombrar lo ya existente queda pendiente de decisión del usuario.
- S7: "deja a gentle bien configurado, deben trabajar Gentle-ai + ODD + pi + Claude".
- S8: "Sigue con la auditoria completa, una vez finalizada dejamela en un archivo llamado auditoria.md en la raiz del proyecto."

## Tareas

- [x] T1 (S1, S2), inline, arreglos de Docker. Verificado solo con parseo de YAML; `docker compose` no está disponible en este entorno. Commit: 8971a02.
- [x] T2 (S3, S4), inline, tipar `req.user`, quitar `any` de `booking.controller.ts` y exigir ADMIN en las rutas admin de reservas. RED: un USER recibía 200, 500 y 400 en las tres rutas. GREEN: 10/10 en `tests/rutasAdminReservas.test.ts`. Commits: b02075e y 24a9868. Revisión nativa aprobada.
- [x] T7 (S7), inline, configuración de Gentle AI en el repositorio. Pi queda sin funcionar por una API key inválida, que debe corregir el usuario.
- [x] T8 (S8), inline, informe en `auditoria.md`.
- [x] T3 (S4), inline, autenticación, control de dueño y de estado en `create-preference`. RED: 8 de 9 tests fallaban. GREEN: 9/9 en `tests/preferenciaPago.test.ts`. Commit: df82fb6.
- [x] T4 (S4), inline, firma del webhook con `WebhookSignatureValidator`, control de monto, `notification_url` desde `BACKEND_URL` y sin reconfirmar sobre un turno ocupado. RED: 18 tests fallaban. GREEN: 19 en `tests/webhookPago.test.ts` y 12 en `tests/preferenciaPago.test.ts`.
- [x] T5 (S4), inline, eliminar los secretos JWT por defecto, un solo punto de verificación, HS256 y arranque fallido sin `JWT_SECRET`. RED: un token con `default_secret` y uno HS512 recibían 200. GREEN: 9/9 en `tests/secretosJwt.test.ts`.
- [x] T6 (S5), inline, restricción `EXCLUDE`, bloqueo por cancha y respuesta 409. RED: de 20 pedidos simultáneos, 11 reservaron. GREEN: 300 rondas de 10 pedidos con exactamente una reserva por turno, 0 deadlocks y 49 ms de máximo. `npm test`: 56 pasan y 10 omitidos; `tests/concurrenciaReservas.test.ts`: 10/10 en base descartable.

## Log

- L1 (2026-11-04), pedido original: "Actúa como Arquitecto de Software Senior y Especialista en Ciberseguridad. Realiza una auditoría exhaustiva de este repositorio. Tus objetivos son: Identificar y mitigar vulnerabilidades (inyecciones SQL, gestión de JWT y validación de firmas en los webhooks de Mercado Pago). Auditar la concurrencia: verifica que la implementación de Redis evite estrictamente las reservas duplicadas (double-booking) de las canchas. Detectar cuellos de botella en la arquitectura de Docker/Kubernetes y malas prácticas en el frontend (Vue) o backend (Express). Navega por los archivos de forma autónoma, lista los problemas críticos y procede a corregir los archivos defectuosos paso a paso, pidiendo mi confirmación antes de mutar la lógica central."
- L2 (2026-11-04), usuario: "los cambios que has notado los hice yo". La edición de `server.ts` y el borrado de `src/health.ts` son del usuario y quedan fuera de esta tarea.
- L3: `npm run build || true` se mantiene en el DockerFile hasta corregir los errores de `tsc`, porque quitarlo ahora rompería el build de la imagen.
- L4: El hook de pre-commit de GGA rechazó `booking.controller.ts` por usos previos de `any` y `@ts-ignore` (`AGENTS.md`, "Cero `any`"). No se salteó el hook; S3 pasó a T2.
- L6: Verificador independiente de T2 sobre b02075e: S3 cumple, alcance T2 de S4 cumple, sin bloqueantes. Advertencias previas: 500 con UUID inexistente en `PATCH` admin y `cancel`; `booking.service.ts:90` loguea `userId`. Sus sondas de 401 pasaron a `tests/rutasAdminReservas.test.ts`.
- L7 (2026-11-04), usuario: "olvidate de health.test.ts.(era un test para ver probarte si estabas trabjando bajo ODD + Gentle), deja a gentle bien configurado, deben trabajar Gentle-ai + ODD + pi + Claude. Sigue con la auditoria completa, una vez finalizada dejamela en un archivo llamado auditoria.md en la raiz del proyecto." T3 a T6 no se confirmaron y siguen pendientes.
- L8 (2026-11-04), usuario: "Primero vamos a corregir todos los errores, uno por uno como propusiste, luego antes de seguir avanzando en el proyecto me ayudaras a crear las specs necesarias para que el proyecto funcione correctamente y para que tu trabajes correctamente." Confirma T3 a T6 y el plan de `auditoria.md`, en ese orden.
- L9: Decisiones de T4. Solo se procesa `data.id` de la URL, porque es lo que cubre la firma. No se usa tolerancia de tiempo: la documentación no aclara si los reintentos renuevan `ts`, así que la protección ante repetición viene de que cada transición de estado es idempotente. Un pago aprobado sobre una reserva cancelada la reconfirma si el turno sigue libre, porque Mercado Pago permite reintentar tras un rechazo; si está ocupado, queda un aviso para revisión manual. Un pago rechazado sigue cancelando reservas activas hasta resolver A3. Se mantiene `paymentMethod: "TRANSFER"`.
- L10: El verificador de T5 detectó que el `JWT_SECRET` de `backend/.env` parece ser el valor viejo del compose, público en el historial. Debe rotarlo el usuario.
- L11: Decisiones de T6. No se usa Redis: la restricción en PostgreSQL es la garantía y no puede expirar. Bloquea toda reserva distinta de `CANCELLED`. Solo con `EXCLUDE` hubo 324 deadlocks en 2700 pedidos y esperas de hasta 9 s, sin duplicados; por eso se agregó `pg_advisory_xact_lock` por cancha. La migración se aplicó a la base de desarrollo, que no tenía solapamientos. `npm test` borró la reserva residual del 2026-11-20 al limpiar su turno.
- L12: Se versiona `20261031231330_nueva_migracion`, del usuario, porque sin ella una base nueva no coincide con `schema.prisma`.
- L13: Correcciones de los avisos sobre T3 y T4: no se cobra sin `MERCADOPAGO_WEBHOOK_SECRET` y solo se procesan IDs de pago numéricos.
- L5 (2026-11-04), usuario: "Si, pero tambien quiero que las variables, las specs, task, logs, y todo lo que sea relacionado a este proyecto sea en español".
