Objetivo: corregir paso a paso los problemas encontrados por la auditoría de seguridad y arquitectura.
Rama: fix/security-audit. Estrategia de entrega: ask-on-risk. Runner de tests: vitest (backend).

## Specs

- S1: Docker Compose debe referenciar los archivos de build existentes y la ruta de API que sirve el backend. Verificación: los valores de `dockerfile` coinciden con `DockerFile` y `VITE_API_URL` termina en `/api/v1`.
- S2: Los contextos de build de Docker deben excluir `node_modules`, `.env`, `dist` y `.git`. Verificación: existen ambos archivos `.dockerignore`.
- S3: Los handlers de reservas no deben loguear el payload del JWT. Verificación: `booking.controller.ts` no loguea `req.user`.
- S4: "Identificar y mitigar vulnerabilidades (inyecciones SQL, gestión de JWT y validación de firmas en los webhooks de Mercado Pago)." Lógica central: requiere confirmación del usuario antes de cada cambio.
- S5: "verifica que la implementación de Redis evite estrictamente las reservas duplicadas (double-booking) de las canchas." Redis no existe en el repositorio. Lógica central y migración: requiere que el usuario confirme el enfoque.
- S6: "las variables, las specs, task, logs, y todo lo que sea relacionado a este proyecto sea en español". Supuesto: aplica a todo lo que se escriba de ahora en adelante; renombrar lo ya existente queda pendiente de decisión del usuario.

## Tareas

- [x] T1 (S1, S2), inline, arreglos de Docker. Verificado solo con parseo de YAML; `docker compose` no está disponible en este entorno. Commit: 8971a02.
- [x] T2 (S3, S4), inline, tipar `req.user`, quitar `any` de `booking.controller.ts` y exigir ADMIN en las rutas admin de reservas. RED: un USER recibía 200, 500 y 400 en las tres rutas. GREEN: 8/8 en `tests/rutasAdminReservas.test.ts`. Commit: ver `git log`.
- [ ] T3 (S4), inline, autenticación y control de dueño en `create-preference`. Pendiente de confirmación.
- [ ] T4 (S4), inline, firma del webhook de Mercado Pago y `notification_url` configurable. Pendiente de confirmación.
- [ ] T5 (S4), inline, eliminar los secretos JWT por defecto. Pendiente de confirmación.
- [ ] T6 (S5), inline, prevención de solapamientos garantizada por la base de datos. Pendiente de confirmación.

## Log

- L1 (2026-11-04), pedido original: "Actúa como Arquitecto de Software Senior y Especialista en Ciberseguridad. Realiza una auditoría exhaustiva de este repositorio. Tus objetivos son: Identificar y mitigar vulnerabilidades (inyecciones SQL, gestión de JWT y validación de firmas en los webhooks de Mercado Pago). Auditar la concurrencia: verifica que la implementación de Redis evite estrictamente las reservas duplicadas (double-booking) de las canchas. Detectar cuellos de botella en la arquitectura de Docker/Kubernetes y malas prácticas en el frontend (Vue) o backend (Express). Navega por los archivos de forma autónoma, lista los problemas críticos y procede a corregir los archivos defectuosos paso a paso, pidiendo mi confirmación antes de mutar la lógica central."
- L2 (2026-11-04), usuario: "los cambios que has notado los hice yo". La edición de `server.ts` y el borrado de `src/health.ts` son del usuario y quedan fuera de esta tarea.
- L3: `npm run build || true` se mantiene en el DockerFile hasta corregir los errores de `tsc`, porque quitarlo ahora rompería el build de la imagen.
- L4: El hook de pre-commit de GGA rechazó `booking.controller.ts` por usos previos de `any` y `@ts-ignore` (`AGENTS.md`, "Cero `any`"). No se salteó el hook; S3 pasó a T2.
- L5 (2026-11-04), usuario: "Si, pero tambien quiero que las variables, las specs, task, logs, y todo lo que sea relacionado a este proyecto sea en español".
