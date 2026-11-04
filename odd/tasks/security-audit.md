Objective: fix the problems found by the security and architecture audit, step by step.
Branch: fix/security-audit. Delivery strategy: ask-on-risk. Test runner: vitest (backend).

## Specs

- S1: Docker Compose must reference the existing build files and the API path the backend serves. Check: `dockerfile` values match `DockerFile`, and `VITE_API_URL` ends in `/api/v1`.
- S2: Docker build contexts must exclude `node_modules`, `.env`, `dist`, and `.git`. Check: both `.dockerignore` files exist.
- S3: Booking handlers must not log the JWT payload. Check: `booking.controller.ts` has no `req.user` log.
- S4: "Identificar y mitigar vulnerabilidades (inyecciones SQL, gestión de JWT y validación de firmas en los webhooks de Mercado Pago)." Core logic: requires user confirmation before each change.
- S5: "verifica que la implementación de Redis evite estrictamente las reservas duplicadas (double-booking) de las canchas." Redis does not exist in the repository. Core logic and migration: requires user confirmation of the approach.

## Tasks

- [x] T1 (S1, S2), inline, Docker fixes. Checked with a YAML parse only; `docker compose` is unavailable here. Commit: see `git log`.
- [ ] T2 (S3, S4), inline, type `req.user`, remove `any` from `booking.controller.ts`, admin booking routes require ADMIN. Log removal is uncommitted in the working tree. Pending confirmation.
- [ ] T3 (S4), inline, authentication and ownership on `create-preference`. Pending confirmation.
- [ ] T4 (S4), inline, Mercado Pago webhook signature and configurable `notification_url`. Pending confirmation.
- [ ] T5 (S4), inline, remove JWT secret fallbacks. Pending confirmation.
- [ ] T6 (S5), inline, database-enforced overlap prevention. Pending confirmation.

## Log

- L1 (2026-11-04), original request: "Actúa como Arquitecto de Software Senior y Especialista en Ciberseguridad. Realiza una auditoría exhaustiva de este repositorio. Tus objetivos son: Identificar y mitigar vulnerabilidades (inyecciones SQL, gestión de JWT y validación de firmas en los webhooks de Mercado Pago). Auditar la concurrencia: verifica que la implementación de Redis evite estrictamente las reservas duplicadas (double-booking) de las canchas. Detectar cuellos de botella en la arquitectura de Docker/Kubernetes y malas prácticas en el frontend (Vue) o backend (Express). Navega por los archivos de forma autónoma, lista los problemas críticos y procede a corregir los archivos defectuosos paso a paso, pidiendo mi confirmación antes de mutar la lógica central."
- L2 (2026-11-04), user: "los cambios que has notado los hice yo". The `server.ts` edit and the removal of `src/health.ts` belong to the user and stay out of this feature.
- L3: The Dockerfile `npm run build || true` stays until the `tsc` errors are fixed, because removing it now would break the image build.
- L4: The GGA pre-commit hook rejected `booking.controller.ts` for existing `any` and `@ts-ignore` usage (AGENTS.md "Cero `any`"). The hook was not bypassed; S3 moved to T2.
