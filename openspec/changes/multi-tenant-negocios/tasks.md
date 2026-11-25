# Tareas: multi-tenant-negocios

Copia en Engram: `sdd/multi-tenant-negocios/tasks`. Entradas: `proposal.md` (D1 a D10), `specs/*/spec.md` (NEG-001 a NEG-012 y deltas de `autenticacion`, `administracion`, `canchas`, `reservas` y `pagos`) y `design.md` (decisiones 1 a 8, entregas E1 a E6). Skills: `testing-backend`, `prisma-migraciones`, `dominio-reservas`.

## Pronóstico de carga de revisión

| Campo | Valor |
|---|---|
| Líneas de cambio estimadas (adiciones + eliminaciones, código y pruebas, sin specs) | ~2.400 en total (rango 2.200 a 2.700) |
| Chained PRs recommended | No (el proyecto no usa PR; los commits son granulares en `desarrollo`, uno por unidad o subunidad de trabajo) |
| 400-line budget risk | High (a nivel de cambio total); por entrega, Medium en E3a y E5 y Low en el resto |
| Delivery strategy | ask-on-risk, sin cadena: se parte en commits dentro de `desarrollo` |

Decision needed before apply: Resuelta. El usuario eligió partir por subunidades (2026-11-24): cada subunidad es un commit de menos de 400 líneas en `desarrollo`; si una se pasa al implementarla, se corta en el punto previsto. Sin excepción de tamaño.
Chained PRs recommended: No
400-line budget risk: High (cambio total; cada entrega se mantiene por debajo de ~400 con los cortes previstos)

### Estimación por entrega

| Entrega | Contenido | Líneas estimadas | Riesgo de 400 líneas | Corte previsto |
|---|---|---|---|---|
| E1 (UT-1) | Modelo, M1, semilla, `negocioId` al crear, fixtures y `migracionNegocios` | ~320 (la regeneración de `migration.sql` pesa, pero es SQL revisado) | Low | UT-1a (SQL y esquema) y UT-1b (código y pruebas) |
| E2 (UT-2) | M2, payload Zod, `soloDueno`, roles en 13 pruebas y frontend | ~300 a 350 (el renombre de roles en las pruebas es mecánico) | Medium | UT-2a (backend) y UT-2b (pruebas y frontend) |
| E3a (UT-3) | Pertenencia en administración y canchas, `GET /admin/complexes`, métricas, listado y agenda | ~380 | Medium | UT-3a (canchas, seña y complejos) y UT-3b (métricas, listado y agenda) |
| E3b (UT-4) | Reservas y pagos, negocio activo, "Mis reservas" | ~340 | Low | Commit único; partir en dos si pasa de 400 |
| E4 (UT-5) | Alta de negocio y dueño por `SUPER_ADMIN` | ~280 | Low | UT-5a (slug y DTO) y UT-5b (servicio, ruta y alta) |
| E5 (UT-6) | Resolutor, rutas por slug, compatibilidad `principal`, tope por teléfono por negocio | ~380 | Medium | UT-6a (resolutor y catálogo) y UT-6b (alta de invitado y tope por teléfono) |
| E6 (UT-7) | Frontend `/:slug`, panel con selector, negocio en "Mis reservas" y retiro de rutas viejas | ~300 | Low | UT-7a (rutas y `BookingsPage`) y UT-7b (panel y "Mis reservas") |
| Docs (UT-8) | Renombre mecánico de roles en specs vigentes, ADR, glosario, skills, hoja de ruta | ~80 de documentación (fuera del presupuesto de código) | Low | Commit único |

Las líneas son de código y pruebas, sin specs. Si una subunidad real pasa de 400 líneas sin un corte limpio, el apply se detiene y consulta.

## Suggested Work Units

| Unidad | Objetivo | Depende de | Paralelo | Comando de prueba focalizado | Límite de reversa |
|---|---|---|---|---|---|
| UT-0 | Línea base, respaldo y comprobación de supuestos de base | Nada | No | `npm test` contra `reservas_prueba` | N/A |
| UT-1 | E1: modelo y M1 | UT-0 | No | `npm run test:db -- migracionNegocios` | SQL de reversa de M1 (design) |
| UT-2 | E2: roles y JWT | UT-1 | No | `npm run test:unit -- payloadJwt` | SQL de reversa de M2 |
| UT-3 | E3a: administración y canchas | UT-2 | Con UT-4 y UT-5 (un solo escritor: orden sugerido 3, 4, 5) | `npm run test:db -- aislamientoAdmin` | `git revert` |
| UT-4 | E3b: reservas y pagos | UT-2 | Con UT-3 y UT-5 | `npm run test:db -- aislamientoReservasPagos` | `git revert` |
| UT-5 | E4: alta de negocio | UT-2 | Con UT-3 y UT-4 | `npm run test:unit -- slugNegocio`; `npm run test:db -- altaNegocio` | `git revert` |
| UT-6 | E5: rutas por slug | UT-3, UT-4 y UT-5 (necesita `validarTurnoReservable` con `idNegocio` de UT-4) | No | `npm run test:db -- negociosPorSlug` | `git revert` |
| UT-7 | E6: frontend | UT-3, UT-4 y UT-6 | No | Manual con chrome-devtools; `npm run lint` y `npm run build` | `git revert` |
| UT-8 | Documentación y renombre de specs | UT-7 | No | Relectura y `rg` | `git revert` |

Orden estricto: UT-0 → UT-1 → UT-2 → (UT-3, UT-4, UT-5 en cualquier orden, sin ejecución simultánea de escritores) → UT-6 → UT-7 → UT-8.

## Convenciones de ejecución

- **TDD estricto en el backend.** Cada tarea de comportamiento lista la prueba que falla primero (RED), la implementación (GREEN) y el refactor. La tarea se marca hecha solo con el RED y el GREEN observados y registrados. El frontend no tiene pruebas hasta N.º 10: se verifica con `npm run lint`, `npm run build` y la prueba manual. Las tareas de SQL y configuración no tienen RED posible por sí solas; su prueba es la de base (`migracionNegocios`) o la ejecución real.
- **Proyectos de Vitest.** `unit` no usa base. `db` usa `DATABASE_URL_PRUEBA` (base descartable `reservas_prueba`, puerto 5434). Toda prueba nueva con base se registra en `backend/tests/clasificacion/archivosConBase.ts` en la misma tarea que la crea; la prueba de control lo exige.
- **Quién ejecuta.** Los agentes no commitean ni leen o modifican `.env`. Los comandos que usan la base (migraciones, semilla, `test:db`, `npm test`, `pg_dump`) los corre el usuario con `!`, con `DATABASE_URL` definida en línea, nunca con la de `backend/.env` para `npm test`. Los commits los hace el usuario a mano.
- **Verificación al cerrar cada unidad** (comandos de cierre): `cd backend && npx tsc --noEmit`; `npm run test:unit` con `DATABASE_URL` inalcanzable (puerto 1); `npm test` contra `reservas_prueba` con la semilla recargada. Si la unidad toca el frontend: `cd frontend && npm run lint && npm run build`.
- **Revisión `revisor-multitenant`** (agente del proyecto) al cierre de UT-3, UT-4 y UT-6, y también de UT-5 y UT-2 por tocar autenticación (ver cada unidad). Los hallazgos críticos se corrigen antes del commit.
- Sin `any`. UTC sin cambios. Todo en español. `AGENTS.md` prevalece: controladores delgados, Prisma solo en servicios.
- Cada unidad termina con el mensaje de commit sugerido (Conventional Commits en español, sin atribución a IA).
- Cada tarea cita el requisito que satisface (Spec) y la decisión del diseño (Dis).

---

## UT-0: Línea base, respaldo y supuestos de base (sin commit)

- [x] T-0.1 Registrar `node --version`, `git status` y la rama (`desarrollo`). Spec: N/A. Dis: Estrategia de pruebas.
  - Evidencia (2026-11-24): Node v26.12.1; rama `desarrollo` sincronizada con `origin/desarrollo` en `0e40d53`; sin cambios salvo `openspec/changes/multi-tenant-negocios/` (artefactos SDD sin commitear). `npx tsc --noEmit` del backend sin errores; `npm run lint` y `npm run build` del frontend sin errores.
- [ ] T-0.2 Línea base: el usuario corre `npx prisma migrate deploy` y `npx prisma db seed` sobre `reservas_prueba`, luego `npm test`. Registrar el resultado (esperado 33 archivos y 478 pruebas en verde), `npx tsc --noEmit` sin errores y `npm run lint` y `npm run build` del frontend. Si difiere, detener y consultar.
  - Evidencia (2026-11-24, ejecutado por el usuario): `migrate deploy` sobre `reservas_prueba` sin migraciones pendientes (5 encontradas); semilla cargada; `npm test`: 33 de 33 archivos y 478 de 478 pruebas en verde (36,9 s). `tsc`, lint y build: ver T-0.1.
- [x] T-0.3 Respaldo de la base de desarrollo: el usuario corre `pg_dump` de `sports_booking_postgres` (puerto 5433) a un archivo fuera del repositorio y registra la ruta y el tamaño. Dis: Migración y despliegue, paso 1.
  - Evidencia (2026-11-24): `pg_dump -U dev_user -d sports_booking_db -Fc` a `D:/USUARIO/Desktop/SistemaReserva/respaldos/antes-multi-tenant-2026-11-24.dump` (22 365 bytes). `pg_restore -l` lo lee y lista 7 entradas `TABLE DATA`.
- [x] T-0.4 Comprobación del supuesto de la decisión 2 en `reservas_prueba` (se repite después de escribir M1 en UT-1): `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <descartable> --script` no propone `DROP` alguno de `bookings_sin_solapamiento`, `bookings_horario_valido`, `bookings_titular_valido`, `complexes_porcentaje_sena_valido`, restricciones de `booking_payments`, ni del trigger. Si lo propusiera, se registra y se cae a "solo aplicación" (consultar antes). Skill: `prisma-migraciones`.
  - Evidencia (2026-11-24): con la base de sombra separada `reservas_sombra` (en el contenedor `reservas_prueba`, para no borrar `reservas_prueba`), `prisma migrate diff` devuelve `-- This is an empty migration.`: Prisma no propone `DROP` de ninguna restricción manual vigente. La parte del trigger se repite en UT-1, cuando M1 exista.
- [x] T-0.5 Comprobación del supuesto de la decisión 6 en `reservas_prueba` (script SQL descartable, no versionado): en una sola transacción, `ALTER TYPE "Role" RENAME VALUE ...`, `ADD VALUE 'SUPER_ADMIN'` y `ADD CONSTRAINT users_negocio_segun_rol CHECK (("role" = 'DUENO') = ("negocio_id" IS NOT NULL))` (con una columna `negocio_id` de prueba). Registrar si PostgreSQL 15 lo permite. Si no, M2 se parte en una tercera migración `20261125120200_roles_negocio_check` y se registra en el diseño. Dis: Decisión 6.
  - Evidencia (2026-11-24): en `reservas_prueba`, dentro de `BEGIN` … `ROLLBACK`, los dos `RENAME VALUE`, `ADD VALUE 'SUPER_ADMIN'` y el `CHECK` con `'DUENO'` se aplican sin error ("CHECK con DUENO aceptado"). Tras el `ROLLBACK`, el enum vuelve a `{USER,ADMIN}`. M2 puede ser una sola migración; no hace falta la tercera.
- [x] T-0.6 Inventario de pruebas que cambian por entrega (tablas de la decisión 7): confirmar con `rg` los archivos con `"USER"`, `"ADMIN"`, `role:` y fixtures de `Booking` y `Complex`. Registrar la lista real en este archivo (reemplaza la estimada).
  - Evidencia (2026-11-24), `rg` de `"USER"`, `"ADMIN"`, `role:`, `Role.` y `prisma.(complex|booking).create` en `backend/tests` (102 coincidencias en 13 archivos): `reembolsoPago` (20), `validacionReservas` (17), `rutasAdminReservas` (14), `depositPercent` (12), `cancelacionBajoBloqueo` (9), `concurrenciaReservas` (8), `validacionCanchas` (6), `respuestasListaBlanca` (5), `liberarAlCrearReserva` (4), `liberarAlCrearReservaBase` (4), `metricasAdmin` (1), `preferenciaPago` (1), `secretosJwt` (1).

Verificación: línea base registrada, respaldo hecho y los dos supuestos de base comprobados.

---

## UT-1: Modelo y migración M1 (E1)

Spec: NEG-001, NEG-007 (aislamiento por columna), NEG-012 (migración a `principal`), RES-001 y RES-004 (la reserva lleva el negocio de la cancha). Dis: Decisiones 2 y 6.

### UT-1a: Esquema, SQL de M1 y semilla

> Decisión del usuario (2026-11-24, opción B): para que el commit de UT-1a deje `tsc` y todas las suites en verde, el subconjunto mínimo de T-1.7 y T-1.8 se movió a UT-1a (tareas T-1.6b y T-1.6c). RED observado de ese subconjunto: tras M1 y el cliente regenerado, `tsc` daba 6 errores TS2322 y fallaban 5 archivos de `db` (`concurrenciaReservas`, `integration`, `liberarAlCrearReservaBase`, `migracionReservaInvitado`, `rutasAdminReservas`); tras el cambio de código, 26 pruebas de `unit` fallaban por simulaciones de cancha sin `complex`.

- [x] T-1.1 RED: crear `backend/tests/migracionNegocios.test.ts` (proyecto `db`, `describe.skipIf(!DATABASE_URL_PRUEBA)`) con casos de la entrega 1 que fallan sin M1: existe la tabla `negocios` con el negocio `principal`; `complexes.negocio_id` y `bookings.negocio_id` son `NOT NULL`; todo complejo y reserva existentes apuntan a `principal`; el trigger `bookings_negocio_coherente` rechaza con `check_violation` una reserva cuyo `negocio_id` no coincide con el de su cancha; `users_un_dueno_por_negocio` rechaza un segundo usuario con el mismo `negocio_id`. Registrarla en `archivosConBase.ts`. Observar RED (el usuario corre `npm run test:db -- migracionNegocios`).
  - Evidencia (2026-11-24): `migracionNegocios.test.ts` creado (9 casos: tabla y negocio `principal`, `negocio_id` NOT NULL en `complexes` y `bookings`, nulable en `users`, sin huérfanos, trigger acepta y rechaza con `23514`, `users_un_dueno_por_negocio` rechaza el segundo dueño y no limita a usuarios sin negocio) y registrado en `archivosConBase.ts`. RED observado contra `reservas_prueba` sin M1: 9 de 9 fallan (`column "negocio_id" of relation "users" does not exist`, tabla `negocios` inexistente).
- [x] T-1.2 Modificar `backend/prisma/schema.prisma`: modelo `Negocio` (id, nombre, slug único, activo con default `true`, createdAt); `negocioId` y relación en `Complex` y `Booking` (obligatorios) y en `User` (opcional); índices `complexes(negocio_id)`, `bookings(negocio_id, start_time)` y `bookings(negocio_id, guest_phone, status)` (reemplaza `bookings_guest_phone_status_idx`); comentarios sobre las restricciones manuales (`users_un_dueno_por_negocio`, trigger `bookings_negocio_coherente`). Mapas de columna en `snake_case` como el resto del esquema.
  - Evidencia (2026-11-24): `schema.prisma`: modelo `Negocio` (`@@map("negocios")`), `negocioId` obligatorio en `Complex` y `Booking`, opcional en `User`, índices `complexes(negocio_id)`, `bookings(negocio_id, start_time)` y `bookings(negocio_id, guest_phone, status)` (reemplaza el de `guest_phone, status`), comentarios de `users_un_dueno_por_negocio` y del trigger `bookings_negocio_coherente`. Columnas en `snake_case`.
- [x] T-1.3 Generar M1 con `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --script` (no `migrate dev`) en `backend/prisma/migrations/20261125120000_negocios/migration.sql` y editar a mano en este orden: crear `negocios`; `INSERT` de "Negocio principal" (`principal`, `gen_random_uuid()`); columnas nulables; `UPDATE` de `complexes`, `bookings` (desde el complejo de su cancha) y `users` (solo `role = 'ADMIN'`); `SET NOT NULL`; claves foráneas `ON DELETE RESTRICT`; índices; restricción `users_un_dueno_por_negocio` (EXCLUDE parcial); función y trigger `bookings_negocio_coherente` (SQL de "Migración y despliegue"). Revisar a mano que no haya `DROP` de `bookings_sin_solapamiento`, `bookings_horario_valido`, `bookings_titular_valido`, `complexes_porcentaje_sena_valido` ni restricciones de `booking_payments`.
  - Evidencia (2026-11-24): `migrate diff` generó el SQL base (solo un `DROP INDEX bookings_guest_phone_status_idx`, el reemplazado). `20261125120000_negocios/migration.sql` (90 líneas) editado a mano en el orden pedido. `rg DROP` en la migración: solo ese índice; ningún `DROP` de `bookings_sin_solapamiento`, `bookings_horario_valido`, `bookings_titular_valido`, `complexes_porcentaje_sena_valido` ni de `booking_payments`.
- [x] T-1.4 Repetir T-0.4 con M1 escrita (el `migrate diff` posterior no propone `DROP`). Registrar el resultado. Si propone alguno, detener y consultar.
  - Evidencia (2026-11-24): con M1 en `prisma/migrations`, `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --shadow-database-url .../reservas_sombra --script` devuelve `-- This is an empty migration.` (sin `DROP` y sin desvío entre esquema y migraciones). Tras aplicar M1, `pg_constraint` conserva las 4 restricciones manuales previas y existen `users_un_dueno_por_negocio` y el trigger `bookings_negocio_coherente`.
- [x] T-1.5 Ensayo en la base descartable: el usuario aplica `migrate deploy` en `reservas_prueba` con datos de semilla y comprueba el resultado con consultas; luego prueba el SQL de reversa de M1 (design) y vuelve a aplicar M1. Registrar ambos resultados.
  - Evidencia (2026-11-24): en `reservas_prueba`, con datos legados (semilla vieja más una reserva de invitado insertada a mano), `migrate deploy` aplicó M1: `principal` con 1 complejo, 1 reserva y 1 usuario (solo `admin@sportsbooking.com`, `ADMIN`; el `USER` quedó sin negocio). Reversa de M1 (SQL del diseño, en una transacción): `negocios` y las columnas `negocio_id` desaparecen, la reserva sigue (1), las 4 restricciones manuales intactas, 0 registros de M1 en `_prisma_migrations`. `migrate deploy` la reaplicó: 1 negocio, 1 reserva y 1 dueño con negocio.
- [x] T-1.6 Modificar `backend/prisma/seed.ts`: negocio `principal`, complejo con `negocioId`, dueño `admin@sportsbooking.com` con `negocioId` (rol `ADMIN` todavía), jugador `jugador@example.com`; al limpiar, borrar `negocios` al final. Regenerar el cliente (`npx prisma generate`). GREEN parcial: ejecutar `npm run test:db -- migracionNegocios` (los casos de SQL pasan).
  - Evidencia (2026-11-24): `seed.ts` crea `principal`, el complejo y el dueño (`ADMIN`) con `negocioId`, el jugador sin negocio, y borra `negocios` al final; `prisma generate` hecho. GREEN: `npm run test:db -- migracionNegocios`: 1 archivo, 9 de 9 pruebas. Aviso: con el cliente regenerado, `tsc` y 5 archivos de `db` fallan hasta UT-1b (ver el informe del apply).
- [x] T-1.6b (movida desde T-1.8) Código mínimo: `validarTurnoReservable` obtiene la cancha con `include: { complex: { select: { negocioId: true } } }` y devuelve `idNegocio`; `createBooking`, `createAdminBooking` y `ReservaInvitadoService.crear` escriben `negocioId: idNegocio` (nunca un dato del cliente); `"negocioId"` en el `Omit` de `VistaReservaAdmin`. Sin el parámetro `idNegocio` de entrada ni el `depositPercent` devuelto (quedan en T-1.8 de UT-1b).
  - Evidencia (2026-11-24): GREEN: `npx tsc --noEmit` sin errores en `src`; `npm run test:unit` (`DATABASE_URL` inalcanzable) 27 de 27 archivos y 406 de 406 pruebas, tras agregar `complex: { negocioId }` a las simulaciones de cancha de `liberarAlCrearReserva`, `reservaInvitadoCrear` y `validacionReservas`.
- [x] T-1.6c (movida desde T-1.7) Fixtures mínimos de `db`: `negocio_id` coherente con el del complejo (`principal`) en los INSERT de `complexes` y `bookings` de `liberarAlCrearReservaBase`, `migracionReservaInvitado` y `rutasAdminReservas`, y en `prisma.complex.create` y `prisma.booking.create` de `concurrenciaReservas` (`integration` no necesitó cambios). Sin ayudante `negociosDePrueba.ts` ni aserciones nuevas.
  - Evidencia (2026-11-24): `npx tsc --noEmit` sin errores (incluidas las pruebas); semilla recargada y `npm test` contra `reservas_prueba`: 34 de 34 archivos y 487 de 487 pruebas en verde (línea base 478 más las 9 de `migracionNegocios`); las pruebas de concurrencia siguen en verde.

### UT-1b: Código que escribe `negocioId` y fixtures

- [x] T-1.7 (resto; el subconjunto mínimo de fixtures de `db` y de simulaciones de cancha ya está en T-1.6c) RED: crear `backend/tests/ayudantes/negociosDePrueba.ts` (`crearNegocioDePrueba`, `firmarToken` y `borrarNegocioDePrueba`; no termina en `.test.ts`). Actualizar las pruebas existentes de la entrega 1 (tabla de la decisión 7: `concurrenciaReservas`, `liberarAlCrearReservaBase`, `migracionReservaInvitado`, `integration`, `rutasAdminReservas` con `negocioId` coherente; `validacionReservas`, `liberarAlCrearReserva`, `reservaInvitadoCrear` y `cancelacionBajoBloqueo` con simulaciones que devuelven la cancha con su `complex`). Agregar a `reservaInvitadoCrear` y a `validacionReservas` aserciones de que `booking.create` recibe `negocioId` igual al del complejo de la cancha. Observar RED.
  - Evidencia (2026-11-24): creado `tests/ayudantes/negociosDePrueba.ts` (`crearNegocioDePrueba`, `firmarToken`, `borrarNegocioDePrueba`; no termina en `.test.ts`, `controlClasificacion` sigue en verde); `firmarToken` lo usa `liberarAlCrearReservaBase`. Aserciones de que `booking.create` recibe `negocioId` igual al del complejo de la cancha en `reservaInvitadoCrear` y en `validacionReservas` (`createBooking` y `createAdminBooking`). RED: como el código de T-1.6b ya existía, esas aserciones pasaban de entrada; se observó RED por mutación (con `negocioId` fijo a un UUID cualquiera en `booking.service.ts` y `reservaInvitado.service.ts`: 3 pruebas fallan, una en `reservaInvitadoCrear` y dos en `validacionReservas`; luego se restauró). Las simulaciones de cancha con `complex` y los fixtures de `db` ya estaban en T-1.6c.
- [x] T-1.8 (resto; `idNegocio` devuelto y `negocioId` al crear ya están en T-1.6b) GREEN: modificar `validarTurnoReservable` en `booking.service.ts` para obtener `court → complex → negocioId`, devolver `idNegocio` y `depositPercent` (parámetro `idNegocio: string | null` ya declarado, sin efecto aún); `createBooking`, `createAdminBooking` y `ReservaInvitadoService.crear` escriben `negocioId` con ese valor (nunca con un dato del cliente). Agregar `"negocioId"` al `Omit` de `VistaReservaAdmin` en `vistaAdmin.ts` (la lista blanca no lo expone).
  - Evidencia (2026-11-24): `validarTurnoReservable` devuelve también `depositPercent` (el `include` del complejo selecciona `negocioId` y `depositPercent`). No se agregó el parámetro de entrada `idNegocio: string | null`: la tarea lo daba por declarado, pero no existía, y un parámetro sin efecto sería código muerto; se agrega en UT-4 (T-4.2), donde actúa. El resto (`idNegocio` y `negocioId` al crear, `Omit` en `vistaAdmin.ts`) estaba en T-1.6b.
- [x] T-1.9 REFACTOR: quitar de `ReservaInvitadoService.crear` la consulta extra al complejo si `validarTurnoReservable` ya devuelve `depositPercent` (queda con el diseño de E5; aquí solo si no rompe pruebas). Sin cambio de comportamiento observable.
  - Evidencia (2026-11-24): RED: se quitó de `reservaInvitadoCrear` la simulación de `complex.findUniqueOrThrow` y el porcentaje pasó a `cancha().complex.depositPercent`: 19 pruebas fallaban (la consulta extra al complejo). GREEN: `ReservaInvitadoService.crear` usa el `depositPercent` devuelto y ya no consulta el complejo; `npm run test:unit`: 27 de 27 archivos, 406 de 406.
- [x] T-1.10 Prueba de aislamiento de coherencia: caso en `migracionNegocios` o `validacionReservas` que confirme que las tres rutas de creación (`createBooking`, `createAdminBooking` y la de invitado) producen `negocioId` coherente (el trigger no rechaza ninguna).
  - Evidencia (2026-11-24): nuevo `describe` en `migracionNegocios` con un negocio distinto de `principal` y un usuario sin negocio: `createBooking`, `createAdminBooking` y `ReservaInvitadoService.crear` crean reservas con el `negocio_id` del complejo de la cancha (el trigger no rechaza ninguna). RED por mutación (`negocioId` fijo a un UUID cualquiera en `createBooking`: falla); GREEN: `migracionNegocios` 10 de 10; `npm test` completo 34 de 34 archivos, 488 de 488.

Verificación de cierre: `npx tsc --noEmit`; `npm run test:unit` (inalcanzable); `npm test` contra `reservas_prueba` con la semilla recargada (las pruebas de concurrencia siguen en verde); `bookings_sin_solapamiento` intacta.

Commits sugeridos:
- `feat(negocios): agregar el modelo Negocio y la migración de datos a principal` (UT-1a)
- `feat(reservas): fijar negocioId al crear reservas y verificarlo con un trigger` (UT-1b)

---

## UT-2: Roles y autenticación (E2)

Spec: AUT-001, AUT-006, AUT-009, AUT-012, AUT-014, AUT-015, RES-017, ADM-001, ADM-009. Dis: Decisiones 1, 6 y 8.

### UT-2a: Backend

- [x] T-2.1 RED: crear `backend/tests/payloadJwt.test.ts` (proyecto `unit`, `supertest` contra `app` con Prisma simulado): token con `USER` o `ADMIN` → 401 "Token inválido o expirado."; `DUENO` sin `negocioId` o con `negocioId` que no es UUID → 401; `JUGADOR` en una ruta de dueño → 403; `SUPER_ADMIN` en rutas de dueño (administración, `bookings/admin`, reembolso) → 403; `DUENO` con `negocioId` válido → pasa la autenticación y deja `req.idNegocio`; `armarPayloadJwt` lanza para un `DUENO` sin negocio. Observar RED.
  - Evidencia (2026-11-24): RED: `npm run test:unit -- payloadJwt` falló por el motivo correcto (`Cannot find module .../middlewares/negocio.js`: no existía `soloDueno`). GREEN tras T-2.2 y T-2.3: 1 archivo, 23 de 23 pruebas (tokens `USER`/`ADMIN` → 401 en las 3 áreas; `DUENO` sin `negocioId` o con uno que no es UUID → 401; `userId` que no es UUID → 401; `JUGADOR` y `SUPER_ADMIN` → 403 en administración, `bookings/admin` y reembolso; `DUENO` válido deja `req.idNegocio` en una aplicación mínima con `soloDueno`; el `negocioId` de un `JUGADOR` no llega al payload; `armarPayloadJwt` lanza para un `DUENO` sin negocio).
- [x] T-2.2 Modificar `backend/src/core/config/security.ts`: tipo `Rol`, unión `JwtPayload`, `payloadJwtSchema` (Zod, unión discriminada), `verifyAccessToken` con `parse` en lugar de `as unknown as JwtPayload`, `armarPayloadJwt`.
  - Evidencia (2026-11-24): `security.ts`: tipo `Rol`, unión `JwtPayload`, `payloadJwtSchema` (Zod 4, `z.discriminatedUnion`, `z.uuid()`), `verifyAccessToken` con `parse` (sin `as unknown as JwtPayload`) y `armarPayloadJwt`. Se cierra la deuda `security.ts:47`.
- [x] T-2.3 Modificar `role.middleware.ts` (`requireRole(roles: readonly Rol[])` tipado) y `express.d.ts` (`idNegocio?: string`). Crear `backend/src/core/middlewares/negocio.ts` con `asignarNegocioDelDueno` y `obtenerIdNegocio` (lanza `Error` de programación si falta). Cadena `soloDueno` en `admin.routes.ts`, `booking.routes.ts` y `payments.routes.ts` en lugar de `requireRole(["ADMIN"])`.
  - Evidencia (2026-11-24): `requireRole(allowedRoles: readonly Rol[])`; `express.d.ts` con `idNegocio?: string`; nuevo `core/middlewares/negocio.ts` con `asignarNegocioDelDueno`, `soloDueno` (cadena `[authenticate, requireRole(["DUENO"]), asignarNegocioDelDueno]`, definida una vez y reutilizada) y `obtenerIdNegocio`. `admin.routes.ts`, `booking.routes.ts` y `payments.routes.ts` usan `soloDueno`. Desvío menor: `soloDueno` vive en `negocio.ts` y no se repite en cada archivo de rutas.
- [x] T-2.4 Modificar `auth.service.ts`: `login` y `register` arman el payload con `armarPayloadJwt` y seleccionan `negocioId`; el registro crea `JUGADOR`. Prueba unitaria (RED primero) de que `register` crea con rol `JUGADOR` y de que `login` de un dueño firma `negocioId`.
  - Evidencia (2026-11-24): RED: nuevo `tests/authRoles.test.ts` (unit, Prisma simulado): 2 de 4 fallaron (`register` no fijaba `role: "JUGADOR"` y `login` de un dueño no firmaba `negocioId`: `ZodError` en `negocioId`). GREEN: `AuthService` usa `armarPayloadJwt`, el registro crea `role: "JUGADOR"` y selecciona `negocioId` (sin devolverlo en `user`); 4 de 4.
- [x] T-2.5 Crear M2 en `backend/prisma/migrations/20261125120100_roles_negocio/migration.sql` con `prisma migrate diff` y edición a mano: `RENAME VALUE` de `USER` y `ADMIN`, `ADD VALUE 'SUPER_ADMIN'` (sin usar el literal), `SET DEFAULT 'JUGADOR'` y la restricción `users_negocio_segun_rol` (según T-0.5). Actualizar el enum `Role` en `schema.prisma`. Probar la reversa de M2 en la base descartable.
  - Evidencia (2026-11-24): M2 `20261125120100_roles_negocio` escrita a mano: dos `RENAME VALUE`, `ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'`, `SET DEFAULT 'JUGADOR'` y `users_negocio_segun_rol`; en UNA sola migración (T-0.5). Enum `Role` y `@default(JUGADOR)` en `schema.prisma`. `migrate deploy` sobre `reservas_prueba` con filas legadas (`ADMIN`/`USER`): pasaron a `DUENO`/`JUGADOR`. `prisma migrate diff` posterior (sombra `reservas_sombra`): `This is an empty migration.`; `bookings_negocio_coherente`, `users_un_dueno_por_negocio` y `users_negocio_id_fkey` intactos. Ensayo de reversa del diseño (BEGIN/COMMIT, incluido borrar la fila de `_prisma_migrations`): los roles volvieron a `USER`/`ADMIN` y `migrate deploy` reaplicó M2 sin error. Desvío: `ADD VALUE IF NOT EXISTS` (el diseño decía `ADD VALUE` a secas) porque PostgreSQL no quita valores de un enum y, sin `IF NOT EXISTS`, reaplicar tras la reversa falla.
- [x] T-2.6 Modificar la semilla: roles nuevos, dueño `DUENO` con `negocioId`, `SUPER_ADMIN` `plataforma@sportsbooking.com` con contraseña fija de desarrollo. Regenerar el cliente Prisma.
  - Evidencia (2026-11-24): `seed.ts`: `DUENO` con `negocioId`, `JUGADOR` y `SUPER_ADMIN` `plataforma@sportsbooking.com` con contraseña fija de desarrollo `PlataformaPass123`; `prisma generate` hecho. Semilla recargada: 3 usuarios (`DUENO` con negocio, `JUGADOR` y `SUPER_ADMIN` sin negocio).
- [x] T-2.7 RED y GREEN de `migracionNegocios` (ampliar): `users_negocio_segun_rol` rechaza un `DUENO` sin negocio y un `JUGADOR` o `SUPER_ADMIN` con negocio.
  - Evidencia (2026-11-24): `migracionNegocios` ampliada (5 casos nuevos; `insertarUsuario` ahora recibe el rol: `DUENO` con negocio, `JUGADOR` sin él). RED por mutación: con `users_negocio_segun_rol` quitada de `reservas_prueba`, 3 de 15 fallaron (`DUENO` sin negocio, `JUGADOR` con negocio y `SUPER_ADMIN` con negocio); restaurada la restricción, 15 de 15.

### UT-2b: Fixtures y frontend

- [x] T-2.8 Migrar los 13 archivos de prueba con roles (lista real de T-0.6): `"USER"` → `"JUGADOR"`, `"ADMIN"` → `"DUENO"` con `negocioId` UUID válido en el payload firmado. Observar RED al cambiar el código (con M2 aplicada) y GREEN al terminar.
  - Evidencia (2026-11-24): RED: con el código y M2 aplicados y las pruebas con roles viejos, `test:unit` dio 140 fallos de 433 (tokens `USER`/`ADMIN` → 401). Nuevo `tests/ayudantes/tokens.ts` (`payloadDePrueba`, `RolDePrueba`, `ID_NEGOCIO_DE_PRUEBA`; no termina en `.test.ts`); los 13 archivos con roles usan `"JUGADOR"`/`"DUENO"` con `negocioId` UUID y `negociosDePrueba.firmarToken` toma un `JwtPayload`. GREEN: `tsc --noEmit` sin errores; `test:unit` (`DATABASE_URL` inalcanzable) 29 de 29 archivos, 433 de 433; `npm test` contra `reservas_prueba` (M1 y M2, semilla recargada) 36 de 36 archivos, 520 de 520.
- [x] T-2.9 Frontend (decisión 8): `types/index.ts` (`role: "SUPER_ADMIN" | "DUENO" | "JUGADOR"`), `ProtectedRoute.tsx`, `App.tsx` (`requiredRole="DUENO"`), `Navbar.tsx` (`isDueno`) y `AuthContext.tsx` (descarta la sesión guardada con rol desconocido). Sin `any`; cumple `eslint-plugin-react-hooks`.
  - Evidencia (2026-11-24): `types/index.ts` (`Rol`, `User.role: Rol`), `ProtectedRoute.tsx` (`requiredRole?: Rol`, comparación exacta), `App.tsx` (`requiredRole="DUENO"`), `Navbar.tsx` (`isDueno`) y `AuthContext.tsx` (descarta la sesión guardada con un rol fuera de `ROLES_VALIDOS` y borra `token` y `user`). Sin `any`. `npm run lint`: sin errores; `npm run build`: OK (1880 módulos).
- [ ] T-2.10 Prueba manual con chrome-devtools: iniciar sesión como dueño de la semilla (entra a `/admin`), como jugador (no entra), con una sesión guardada vieja (se descarta y vuelve a `/login`). Registrar el resultado.
  - Pendiente (2026-11-24): se posterga hasta que el usuario aplique M1 y M2 en la base de desarrollo; se hace junto con la prueba manual de UT-7.
- [x] T-2.11 Revisión `revisor-multitenant` de `security.ts`, `negocio.ts` y las rutas con `soloDueno`.
  - Evidencia (2026-11-24): revisión del diff de UT-1a, UT-1b y UT-2 sin hallazgos críticos. El cliente no elige rol ni negocio; el negocio del dueño sale solo del claim firmado; los tokens viejos, manipulados o con `alg` distinto se rechazan; ningún camino escribe `negocioId` desde el cuerpo. Advertencias:
    - W1: el trigger `bookings_negocio_coherente` no cubre cambios de `courts.complex_id` ni de `complexes.negocio_id`. Hoy ningún código los modifica. En UT-3, el `PATCH` de canchas NO debe aceptar `complexId` (con prueba). Mover un complejo de negocio queda para N.º 9, con su propia protección.
    - W2: la semilla crea un `SUPER_ADMIN` con contraseña fija y borra todo sin control de entorno. Pendiente de decisión del usuario (no se amplía el alcance sin su OK).
  - Sugerencias: revalidar el negocio y `activo` contra la base en N.º 9; mensaje claro en M1 si hay más de un `ADMIN` (la base de desarrollo tiene uno solo); simplificar el `select` de `negocioId` en el registro; `obtenerIdNegocio` y `req.idNegocio` se empiezan a usar en UT-3.

Verificación de cierre: `tsc --noEmit`; `test:unit`; `npm test` contra la base descartable con M1 y M2 y semilla recargada; `npm run lint` y `npm run build` del frontend. Se avisa al usuario de que los tokens vigentes dejan de ser válidos.

Commits sugeridos:
- `feat(auth): renombrar los roles a JUGADOR y DUENO y validar el payload del JWT con Zod` (UT-2a)
- `test(roles): migrar los fixtures a los roles nuevos y ajustar los roles del frontend` (UT-2b)

---

## UT-3: Pertenencia en administración y canchas (E3a)

Spec: ADM-001 a ADM-009, ADM-015, ADM-019, CAN-009, CAN-010, CAN-011, NEG-007 (aislamiento "ajeno → 404"). Dis: Decisión 4 y tabla de verificaciones.

### UT-3a: Canchas, seña y complejos

- [x] T-3.1 RED: crear `backend/tests/aislamientoAdmin.test.ts` (proyecto `db`; dos negocios con el ayudante; registrar en `archivosConBase.ts`) con casos "ajeno → 404" para: `createCourt` con `complexId` de B → 404 igual que inexistente; `updateCourt` sobre cancha de B → 404 y, si llega `complexId` de B, 404 del complejo; `getDepositPercent` y `updateDepositPercent` de un complejo de B → 404; `GET /admin/complexes` solo devuelve los complejos de A con `depositPercent` y canchas activas. Cada caso verifica que el recurso de B no cambió. Observar RED.
  - Evidencia (2026-11-24): `tests/aislamientoAdmin.test.ts` (proyecto `db`, 2 negocios con `negociosDePrueba`) registrado en `archivosConBase.ts`. RED contra `reservas_prueba`: 8 de 11 fallaban (`createCourt` y `getDepositPercent`/`updateDepositPercent` ajenos, `updateCourt` ajeno, `complexId` ajeno movía la cancha, `GET /admin/complexes` 404); pasaban 3 (crear y editar con recursos propios y el 403 del `JUGADOR`, que ya cubría `soloDueno`). GREEN: 11 de 11. Desvío revertido por decisión del usuario (2026-11-24): una primera versión hacía que el `PATCH` descartara `complexId` (lectura estricta de W1); se volvió a CAN-010 y la decisión 4. Comportamiento final: `updateCourtSchema` acepta `complexId`; `updateCourt` exige cancha propia (404 "Cancha no encontrada") y, si llega `complexId`, que sea del mismo negocio (`buscarComplejoPropio`): ajeno o inexistente → 404 "El complejo especificado no existe" sin modificar la cancha; uno propio mueve la cancha y sus reservas conservan `negocio_id` (el trigger no rechaza). RED de la corrección: 2 de 14 fallaban en `aislamientoAdmin` (complexId ajeno respondía 200 sin mover; mover a un complejo propio no movía). GREEN: 14 de 14; `validacionCanchas` ganó 2 casos del `complexId` (verifica el complejo por negocio; ajeno → 404 sin escribir; su RED por separado no se observó). `npm test`: 38 archivos, 542 pruebas. Las respuestas ajeno vs inexistente se comparan sin `instance` (repite la ruta pedida).
- [x] T-3.2 Crear `backend/src/modules/negocios/pertenencia.ts` (`buscarComplejoPropio`, `buscarCanchaPropia`, `buscarReservaPropia`, `buscarPagoPropio`; `findFirst` con el negocio en el `where`; cliente opcional para transacciones; lanza el `NotFoundError` de cada operación).
  - Evidencia (2026-11-24): `src/modules/negocios/pertenencia.ts` (76 líneas) con las cuatro funciones; firma `(idNegocio, id, mensaje?, cliente?)` con el mensaje de 404 por defecto de cada recurso. `buscarReservaPropia` y `buscarPagoPropio` quedan sin llamadores hasta UT-4. Se prueban a través de `aislamientoAdmin` (complejo y cancha) y de las pruebas unitarias que fijan el `where`.
- [x] T-3.3 GREEN: `admin.service.ts` recibe `idNegocio` como primer parámetro en `createCourt`, `updateCourt`, `getDepositPercent` y `updateDepositPercent`; nuevo `listarComplejos(idNegocio)` ordenado por `createdAt`; `admin.controller.ts` pasa `obtenerIdNegocio(req)`; `admin.routes.ts` agrega `GET /admin/complexes`. Migrar las simulaciones de `depositPercent`, `validacionCanchas` y `metricasAdmin` de `findUnique` a `findFirst` (tabla de la decisión 7).
  - Evidencia (2026-11-24): `AdminService.createCourt/updateCourt/getDepositPercent/updateDepositPercent(idNegocio, ...)` con `pertenencia.ts`; nuevo `listarComplejos(idNegocio)` (por `createdAt`, con `id`, `name`, `address`, `depositPercent` y canchas activas); controlador con `obtenerIdNegocio(req)`; `GET /admin/complexes`; `updateCourtSchema` sin `complexId`. Simulaciones migradas a `findFirst`: `depositPercent` (el `where` ahora exige `negocioId`) y `validacionCanchas` (más una prueba: busca por id y negocio y descarta un `complexId` del cuerpo; `findUnique` queda para las rutas públicas). GREEN: `aislamientoAdmin` 11 de 11 (luego 14 con UT-3b); `test:unit` 29 archivos verdes.
- [x] T-3.4 Prueba unitaria de matriz de roles para `GET /admin/complexes` (403 a `JUGADOR` y `SUPER_ADMIN`).
  - Evidencia (2026-11-24): `tests/complejosAdmin.test.ts` (unit, 4 casos: 401 sin token, 403 a `JUGADOR` y `SUPER_ADMIN` sin consultar la base, 200 a `DUENO` con `where: { negocioId }` del token). Sin RED posible: la ruta y la cadena `soloDueno` ya existían desde T-3.3; la matriz verifica el comportamiento heredado. GREEN: 4 de 4.

### UT-3b: Métricas, listado y agenda

- [x] T-3.5 RED: ampliar `aislamientoAdmin.test.ts`: métricas de A no incluyen reservas ni recaudación de B; listado completo (ADM-008) y agenda diaria de A no contienen reservas de B.
  - Evidencia (2026-11-24): `describe` nuevo en `aislamientoAdmin` (una reserva de 1000 en A y otra de 2500 en B, de jugadores sin negocio). RED: 3 de 3 fallaban (métricas, `/bookings/admin/all` y `/admin/daily` mostraban las dos). GREEN: 14 de 14.
- [x] T-3.6 GREEN: `getMetrics`, `getAllBookingsForAdmin` y `getDailyBookingsForAdmin` filtran con `where.negocioId` (`booking.service.ts`, `admin.service.ts`); controladores pasan el negocio.
  - Evidencia (2026-11-24): `getMetrics(idNegocio, dto)`, `getAllBookingsForAdmin(idNegocio)` y `getDailyBookingsForAdmin(idNegocio, fecha)` con `where.negocioId`; controladores con `obtenerIdNegocio(req)`. Pruebas migradas: `disponibilidad` (nueva firma y `negocioId` en el `where`), `metricasAdmin` (+1 caso de `negocioId` del token) y `rutasAdminReservas` (el segundo `describe` usa un token con el negocio `principal`, dueño de sus fixtures). Verificación de cierre: `tsc` sin errores; `test:unit` (`DATABASE_URL` inalcanzable) 30 archivos, 439 pruebas; semilla recargada y `npm test` contra `reservas_prueba`: 38 archivos, 540 pruebas en verde.
- [x] T-3.7 Revisión `revisor-multitenant` del diff de UT-3.
  - Evidencia (2026-11-24): sin hallazgos críticos ni advertencias. El negocio sale solo del token; `pertenencia.ts` busca por id y negocio en una sola consulta y responde igual para un recurso ajeno o inexistente; los listados, las métricas y la agenda filtran por `negocioId`; `GET /admin/complexes` no expone `negocioId` ni datos de Mercado Pago.
  - Sugerencias:
    - S1: hacer el `update` de cancha y seña con el negocio en el `where`, como defensa en profundidad. No es explotable hoy porque ningún código cambia el negocio de un complejo; se evalúa en N.º 9.
    - S2 (revisada por el orquestador): el revisor afirmó que ninguna restricción de base asegura que `booking.negocio_id` coincida con el negocio de la cancha. Es incorrecto: lo garantiza el trigger `bookings_negocio_coherente` de M1. Sí aplica su recomendación para UT-4: `createAdminBooking` debe rechazar una cancha de otro negocio.
    - S3: el dueño ve el email del jugador que reservó en su negocio. Es una decisión aceptada (cuenta global, D8).

Verificación de cierre: comandos de cierre (sin frontend).

Commits sugeridos:
- `feat(admin): verificar la pertenencia en canchas, seña y complejos del dueño` (UT-3a)
- `feat(admin): limitar métricas, listado y agenda al negocio del dueño` (UT-3b)

---

## UT-4: Pertenencia en reservas y pagos (E3b)

Spec: RES-005, RES-010, RES-013, RES-015, RES-016, RES-021, RES-036, PAG-024, NEG-007, NEG-009 (negocio activo). Dis: Decisiones 2 y 4.

- [x] T-4.1 RED: crear `backend/tests/aislamientoReservasPagos.test.ts` (proyecto `db`; registrar en `archivosConBase.ts`): `updateBookingStatus` sobre reserva de B → 404 y la reserva de B no cambia; `createAdminBooking` con `courtId` de B → 400 "La cancha no existe." igual que inexistente; reembolso de un pago de B → 404 "Pago no encontrado." sin tocar Mercado Pago; jugador reserva en negocio inactivo → 400 "La cancha no existe."; jugador reserva en un negocio activo cualquiera (cuenta global); `my-bookings` incluye `negocio: { nombre, slug }` de reservas de dos negocios. Observar RED.
  - Evidencia (2026-11-24): `tests/aislamientoReservasPagos.test.ts` (proyecto `db`, 8 casos, 3 negocios con `negociosDePrueba`: A, B e inactivo; Mercado Pago simulado) registrado en `archivosConBase.ts`. RED contra `reservas_prueba`: 5 de 8 fallaban por el motivo correcto (cambio de estado de una reserva de B respondía 200 y la cancelaba; `createAdminBooking` con cancha de B daba 201; reembolso de un pago de B daba 200 y llamaba a Mercado Pago; reserva en negocio inactivo daba 201; `my-bookings` sin `negocio`); pasaban 3 (crear con cancha propia, reembolso propio y el jugador reservando en A y en B con la misma cuenta, que ya funcionaba). GREEN: 8 de 8. Las respuestas ajeno vs inexistente se comparan sin `instance`.
- [x] T-4.2 GREEN: `validarTurnoReservable` aplica `complex: { negocioId?, negocio: { activo: true } }` según `idNegocio` (`null` para el jugador); `updateBookingStatus` usa `buscarReservaPropia` fuera del bloqueo y relee con `negocioId` dentro; `createAdminBooking` pasa `idNegocio`; `getUserBookings` agrega `negocio: { select: { nombre, slug } }`; `getOccupiedSlots` filtra por `negocioId` (queda listo para E5). `payment.service.ts` y `payment.controller.ts`: `reembolsarPago(idNegocio, idPago)` con `buscarPagoPropio`. `booking.controller.ts` pasa `obtenerIdNegocio(req)` en las rutas del dueño.
  - Evidencia (2026-11-24): `validarTurnoReservable(courtId, inicio, fin, idNegocio: string | null)` busca con `court.findFirst` y `complex: { negocioId?, negocio: { activo: true } }` (cancha ajena, de negocio inactivo o inexistente: 400 "La cancha no existe."); `createBooking` y `ReservaInvitadoService.crear` pasan `null` (esta última recibe `idNegocio` en UT-6); `createAdminBooking(idNegocio, datos, idAdmin)`; `updateBookingStatus(idNegocio, id, status)` usa `buscarReservaPropia` fuera del bloqueo y `findFirst` con `negocioId` dentro, conservando `conBloqueoDeCancha`; `getUserBookings` incluye `negocio: { select: { nombre, slug } }`; `getOccupiedSlots(courtId, fecha, idNegocio | null)` filtra por `negocioId` cuando no es `null` (la ruta vieja `/bookings/availability` pasa `null` hasta UT-6); `PaymentService.reembolsarPago(idNegocio, idPago)` con `buscarPagoPropio`, sin llamar a Mercado Pago para un pago ajeno. GREEN: `aislamientoReservasPagos` 8 de 8. Pruebas unitarias nuevas: `validarTurnoReservable` con y sin negocio (5), el `where` con el negocio del token en cambio de estado (fuera y dentro del bloqueo), creación del dueño y del jugador, `getOccupiedSlots` con y sin negocio (RED por mutación: sin el filtro falla `getOccupiedSlots filtra por negocioId`; restaurado).
- [x] T-4.3 Migrar simulaciones de `reembolsoPago`, `validacionReservas` y `respuestasListaBlanca` (tabla de la decisión 7). Confirmar que `cancelBooking` del jugador y el webhook no cambian.
  - Evidencia (2026-11-24): RED al cambiar el código: `test:unit` 76 de 443 fallaban (simulaciones de `court.findUnique`, `booking.findUnique` del cambio de estado y `bookingPayment.findUnique`). Migradas a `findFirst`: `validacionReservas`, `liberarAlCrearReserva`, `reservaInvitadoCrear`, `limitadorCreacionRuta` (cancha), `cancelacionBajoBloqueo` y `respuestasListaBlanca` (reserva fuera y dentro del bloqueo; `findUnique` queda para `cancelBooking`) y `reembolsoPago` (el `where` ahora exige `booking.negocioId` del token). `migracionNegocios` pasa el negocio a `createAdminBooking`; `concurrenciaReservas` y `liberarAlCrearReservaBase` firman el token de dueño con el negocio `principal`, dueño de sus fixtures (3 fallos de `db` hasta entonces). `cancelBooking` y el webhook no cambiaron (sus pruebas siguen en verde). GREEN: `tsc` limpio; `test:unit` (`DATABASE_URL` inalcanzable) 30 archivos, 450 pruebas; semilla recargada y `npm test` contra `reservas_prueba`: 39 archivos, 559 pruebas.
- [x] T-4.4 Revisión `revisor-multitenant` del diff de UT-4 (reservas, pagos, `validarTurnoReservable`).
  - Evidencia (2026-11-24): sin hallazgos críticos y sin fugas nuevas entre negocios.
    - Una cancha, reserva o pago ajeno responde igual que uno inexistente.
    - El reembolso ajeno no llega a Mercado Pago.
    - El negocio sale solo del token.
    - La verificación decisiva de `updateBookingStatus` se hace dentro del bloqueo por cancha, y el trigger impide que una reserva cambie de negocio.
  - A1 (advertencia): el dueño de un negocio inactivo sigue operando con su token, salvo para crear reservas. En N.º 5 no hay forma de desactivar un negocio (D4 y D9), y el diseño ya preveía que el panel siga funcionando. Queda para N.º 9, junto con la revalidación de `activo` en `asignarNegocioDelDueno`.
  - S1 (sugerencia, seguimiento): `createBooking` y `getUserBookings` devuelven la fila completa de la reserva al jugador, incluidos `negocioId`, `accessTokenHash`, `mpPreferenceId` y `depositPaidAtCancel`. No cruza negocios: son datos del propio jugador y el comportamiento es previo, salvo `negocioId`. Se propone una vista de lista blanca para el jugador, a decidir por el usuario.
  - S2: carrera de doble reembolso previa, no introducida por UT-4 y mitigada por la consulta a Mercado Pago.
  - S3: casos de prueba opcionales.
  - Pendientes de UT-6 confirmados: disponibilidad y reserva de invitado reciben `null`, y el tope por teléfono sigue siendo global.

Verificación de cierre: comandos de cierre (sin frontend); las pruebas de concurrencia en verde.

Commit sugerido: `feat(reservas): verificar la pertenencia en reservas y pagos del dueño y mostrar el negocio en Mis reservas`

---

## UT-5: Alta de negocio y dueño por SUPER_ADMIN (E4)

Spec: NEG-002 a NEG-006, NEG-008, NEG-010, NEG-011, AUT-015. Dis: Decisión 3 (slugs) y "Contrato HTTP del alta".

### UT-5a: Slug y DTO

- [ ] T-5.1 RED: crear `backend/tests/slugNegocio.test.ts` (proyecto `unit`): formato `^[a-z0-9]+(?:-[a-z0-9]+)*$`, longitud de 3 a 40, cada slug de `SLUGS_RESERVADOS` rechazado, `altaNegocioSchema` rechaza contraseña débil con las mismas reglas de `auth.dto.ts`. Observar RED.
- [ ] T-5.2 GREEN: crear `backend/src/modules/negocios/slug.ts` (`FORMATO_SLUG`, `SLUGS_RESERVADOS`, `esSlugValido`) y `negocio.dto.ts` (`slugSchema`, `altaNegocioSchema`).

### UT-5b: Servicio, ruta y alta

- [ ] T-5.3 RED: crear `backend/tests/altaNegocio.test.ts` (proyecto `db`; registrar en `archivosConBase.ts`): `SUPER_ADMIN` crea negocio y dueño → 201 sin `passwordHash`; slug mal formado o reservado → 400; slug repetido → 409 "El slug ya está en uso."; email en uso → 409 sin dejar negocio huérfano (alta atómica); `DUENO` y `JUGADOR` → 403; sin token → 401; el dueño creado puede iniciar sesión con `negocioId` en el token; un segundo dueño para el mismo negocio lo rechaza la base. Observar RED.
- [ ] T-5.4 GREEN: `negocio.service.ts` (`crearConDueno` en una `$transaction`, `P2002` en carrera → 409), `negocio.controller.ts` (`crear`), `plataforma.routes.ts` (`POST /negocios` con `authenticate` y `requireRole(["SUPER_ADMIN"])`) y montaje de `/api/v1/plataforma` en `app.ts`.
- [ ] T-5.4b Semilla protegida contra producción (advertencia W2 de T-2.11; decisión del usuario del 2026-11-24). RED: prueba `unit` que importa la función de guarda de la semilla y espera que lance un error con `NODE_ENV=production` (y que no lance con `development` o `test`). GREEN: `backend/prisma/seed.ts` aborta antes de cualquier `deleteMany` si `NODE_ENV === "production"`, con un mensaje claro. No se lee la contraseña del `SUPER_ADMIN` desde una variable de entorno (queda para N.º 11 `despliegue`). La CI corre la semilla sin `NODE_ENV=production`: comprobar que sigue funcionando.
- [ ] T-5.5 Revisión `revisor-multitenant` del alta (contraseña, escalada de rol y alcance del `SUPER_ADMIN`).

Verificación de cierre: comandos de cierre (sin frontend).

Commits sugeridos:
- `feat(negocios): agregar el formato del slug y los slugs reservados` (UT-5a)
- `feat(negocios): permitir al SUPER_ADMIN crear un negocio con su dueño` (UT-5b)

---

## UT-6: Rutas por slug y tope por teléfono por negocio (E5)

Spec: NEG-003 a NEG-006, NEG-009, CAN-001, CAN-004, CAN-007, CAN-008, CAN-013, RES-012, RES-023, RES-031. Dis: Decisiones 3 y 4.

### UT-6a: Resolutor y catálogo

- [ ] T-6.1 RED: crear `backend/tests/negociosPorSlug.test.ts` (proyecto `db`; registrar en `archivosConBase.ts`): `GET /negocios/:slug` → 200 `{ nombre, slug }`; slug inexistente, inactivo o mal formado → 404 "Negocio no encontrado." (el mismo mensaje; el mal formado no consulta la base); catálogo, detalle y disponibilidad de `/negocios/:slug/courts...` solo con canchas del slug; cancha de otro negocio por id → 404; `/negocios/:slug/bookings/availability` solo del negocio del slug. Observar RED.
- [ ] T-6.2 GREEN: ampliar `negocio.ts` con `crearResolverNegocio`, `resolverNegocio` y `resolverNegocioFijo`; `NegocioService.resolverPorSlug` (`activo: true`); `negocio.controller.ts` (`obtener`); crear `negocio.routes.ts`; montaje de `/api/v1/negocios` en `app.ts`; `express.d.ts` con `negocio?: NegocioPublico`. `court.service.ts`, `court.controller.ts` y `getOccupiedSlots` filtran por `idNegocio`. Rutas viejas (`/courts/*`, `/bookings/availability`) montadas con `resolverNegocioFijo("principal")`.
- [ ] T-6.3 Migrar `disponibilidad` a las rutas por slug y a la simulación de `negocio.findFirst`.

### UT-6b: Alta de invitado y tope por teléfono

- [ ] T-6.4 RED: ampliar `negociosPorSlug.test.ts`: `POST /negocios/:slug/bookings` solo acepta canchas del slug (cancha de B → 400 "La cancha no existe."); el limitador corre antes del resolutor (RES-030); el mismo teléfono reserva en dos negocios sin consumir el tope del otro (RES-031); la ruta vieja `POST /public/bookings` sigue funcionando para `principal`. Prueba unitaria (RED primero) de que `bloquearTelefono` usa la clave `pg_advisory_xact_lock(2, hashtext(idNegocio || ':' || telefono))` y cuenta con `negocioId`.
- [ ] T-6.5 GREEN: `bloqueoCancha.ts` (`bloquearTelefono(tx, idNegocio, telefono)`), `reservaInvitado.service.ts` (`crear(idNegocio, datos)` con `validarTurnoReservable(..., idNegocio)` y `depositPercent` devuelto, sin la consulta extra al complejo), `public.routes.ts` con ambos montajes. Migrar `reservaInvitadoCrear`, `limitadorCreacionRuta` y `datosInvitado`.
- [ ] T-6.6 Revisión `revisor-multitenant` del diff de UT-6 (resolutor, tope por teléfono y rutas por token sin cambios).

Verificación de cierre: comandos de cierre (sin frontend); la reserva de invitado y el webhook siguen funcionando para `principal`.

Commits sugeridos:
- `feat(negocios): resolver el negocio por slug en el catálogo y la disponibilidad` (UT-6a)
- `feat(reservas): crear la reserva de invitado por slug y limitar el tope por teléfono a cada negocio` (UT-6b)

---

## UT-7: Frontend por slug y panel con selector (E6)

Spec: AUT-012, AUT-014, CAN-013, RES-010, RES-021, ADM-009, NEG-005. Dis: Decisiones 3 (frontend), 5 y 8.

- [ ] T-7.1 `App.tsx`: ruta `/:slug` → `BookingsPage`; `/` redirige a `/principal`; confirmar que `/login`, `/admin`, `/mis-reservas` y `/reserva/:codigo` mantienen prioridad.
- [ ] T-7.2 `BookingsPage.tsx`: slug de `useParams`, llamadas a `/negocios/:slug/...`, mensaje de "negocio no encontrado" ante 404. Tipos sin `any`.
- [ ] T-7.3 `AdminDashboard.tsx`: cargar `GET /admin/complexes` en lugar de `/courts`; `idComplejoSeleccionado` (por defecto el primero) con selector solo si hay más de un complejo; seña y alta de cancha usan el complejo seleccionado; selector de cancha de la reserva manual agrupado por complejo. Sin `setState` síncrono en el cuerpo de un `useEffect`.
- [ ] T-7.4 `MyBookingsPage.tsx` y `types/index.ts`: mostrar el negocio de cada reserva (`negocio: { nombre, slug }`).
- [ ] T-7.5 Backend: retirar de `court.routes.ts`, `booking.routes.ts` y `public.routes.ts` los montajes `resolverNegocioFijo("principal")`; migrar las pruebas que usaban las rutas viejas. RED primero: prueba que las rutas viejas ya responden 404 (en `negociosPorSlug`).
- [ ] T-7.6 Prueba manual con chrome-devtools (el frontend no tiene pruebas hasta N.º 10): `/` → `/principal`, reserva de invitado en `/principal`, `/slug-inexistente` con mensaje de no encontrado, panel del dueño con selector (con un segundo complejo creado por la API), "Mis reservas" con negocio, sesión vieja descartada. Registrar capturas o resultados.

Verificación de cierre: comandos de cierre con frontend (`npm run lint` y `npm run build`).

Commits sugeridos:
- `feat(frontend): servir la página de reservas por slug y redirigir la raíz a principal` (UT-7a)
- `feat(frontend): elegir el complejo en el panel y mostrar el negocio en Mis reservas` (UT-7b)

---

## UT-8: Documentación y renombre de specs

- [ ] T-8.1 Pasada mecánica de renombre de roles sobre las specs vigentes en `openspec/specs/` necesaria al archivar (riesgo 1 de la fase de specs): `USER` → `JUGADOR` y `ADMIN` → `DUENO` solo donde se refiere al rol; verificar con `rg` que no queden referencias a los roles viejos fuera de contextos históricos. Comparar con `diff` antes y después de la fusión.
- [ ] T-8.2 `docs/arquitectura/adr/0002-multi-tenant.md`: detalle de implementación (enfoque B, claim en el JWT, trigger, rutas por slug, `SUPER_ADMIN` limitado) y estado actual (ya no single-tenant).
- [ ] T-8.3 Skills: `dominio-reservas` (negocio, roles, pertenencia, "ajeno ≡ inexistente", `validarTurnoReservable`), `testing-backend` (fixtures de dos negocios, `negociosDePrueba`) y `prisma-migraciones` (restricciones y trigger nuevos que Prisma no modela).
- [ ] T-8.4 `docs/producto/glosario.md` (negocio, slug, dueño, `SUPER_ADMIN`, jugador) y `docs/operacion/variables-entorno.md` si cambia la semilla (cuentas y contraseñas de desarrollo).
- [ ] T-8.5 `docs/producto/hoja-de-ruta.md` (estado de N.º 5) y `AGENTS.md` y `CLAUDE.md` si el estado "single-tenant" deja de ser cierto; `docs/bitacora.md` se actualiza al cerrar la sesión con `/cerrar-sesion`.
- [ ] T-8.6 Verificación del cambio completo: `sdd-verify` contra las delta specs y los criterios de éxito de la propuesta; CI en verde en `desarrollo`.

Verificación de cierre: relectura de documentos y `rg` sin referencias obsoletas.

Commit sugerido: `docs(multi-tenant): documentar el aislamiento por negocio y actualizar los roles en las specs`
