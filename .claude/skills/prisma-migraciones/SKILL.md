---
name: prisma-migraciones
description: Cómo crear y revisar migraciones de Prisma 5 en este repositorio, incluidas las restricciones SQL manuales (EXCLUDE gist). Usar al modificar backend/prisma/schema.prisma, crear una migración o diagnosticar un error de solapamiento de reservas.
---

# Migraciones con Prisma

Prisma 5 (`@prisma/client` y `prisma` ^5.22.0), PostgreSQL. Todos los comandos se ejecutan desde `backend/`.

## Flujo

1. Editar `backend/prisma/schema.prisma`.
2. Crear y aplicar la migración en desarrollo: `npx prisma migrate dev --name <nombre>`. El README usa `npx prisma migrate dev`.
3. Para revisar el SQL antes de aplicarlo, la CLI estándar de Prisma ofrece `--create-only`; edite el SQL y luego aplique con `npx prisma migrate dev`.
4. Revisar siempre el `migration.sql` generado antes de confirmar.
5. Los cambios de esquema que alteren el comportamiento van acompañados de una prueba y de la actualización de la spec correspondiente.

Migraciones existentes en `backend/prisma/migrations/`: `20260826202621_init_schema`, `20261031231330_nueva_migracion`, `20261104120000_reservas_sin_solapamiento`, `20261119120000_reserva_invitado`, `20261119120100_sin_solapamiento_excluye_vencidas`, `20261125120000_negocios` y `20261125120100_roles_negocio`.

## Restricciones SQL manuales

La migración `20261104120000_reservas_sin_solapamiento` crea, con SQL escrito a mano:

- La extensión `btree_gist`.
- `bookings_horario_valido`: `CHECK (end_time > start_time)`.
- `bookings_sin_solapamiento`: `EXCLUDE USING gist (court_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status <> 'CANCELLED')`.

Prisma **no las representa** en `schema.prisma` (hay un comentario sobre el modelo `Booking` que lo recuerda). Precauciones:

- No eliminarlas al editar el modelo `Booking`.
- Si Prisma propone borrarlas (por desvío entre esquema y base), rechazar esa parte del SQL.
- Una base nueva necesita que su usuario pueda crear `btree_gist`.
- Cualquier restricción nueva que Prisma no soporte se agrega en SQL manual y se documenta con un comentario en el modelo.

## Restricciones y trigger de negocios

Las migraciones `20261125120000_negocios` y `20261125120100_roles_negocio` agregan, con SQL manual que Prisma no modela:

- `users_un_dueno_por_negocio`: `EXCLUDE USING btree (negocio_id WITH =) WHERE (negocio_id IS NOT NULL)`. Es una restricción y no un `CREATE UNIQUE INDEX` suelto porque Prisma 5 borra los índices que no modela, pero no las restricciones.
- Trigger `bookings_negocio_coherente` (función `bookings_validar_negocio`): antes de insertar o de modificar `court_id` o `negocio_id`, exige que la reserva pertenezca al negocio del complejo de su cancha.
- `users_negocio_segun_rol`: `CHECK ((role = 'DUENO') = (negocio_id IS NOT NULL))`.

Mismas precauciones: no borrarlas al editar los modelos `User` o `Booking`, y rechazar cualquier SQL de Prisma que las elimine. Los roles se renombraron con `ALTER TYPE "Role" RENAME VALUE` (conserva los datos) y `SUPER_ADMIN` se agregó en una migración aparte, porque PostgreSQL no deja usar un valor agregado con `ADD VALUE` en la misma transacción.

## Detectar una violación de la exclusión

`backend/src/core/errors/reservaSolapada.ts` identifica el error porque su mensaje incluye el nombre `bookings_sin_solapamiento` y lo convierte en un `ConflictError` (409, "El turno seleccionado ya fue reservado."). Si renombra la restricción, actualice ese módulo y sus pruebas.

El bloqueo por cancha (`backend/src/modules/bookings/bloqueoCancha.ts`) complementa la restricción; ver `docs/arquitectura/adr/0003-prevencion-solapamiento-reservas.md`.

## Precauciones

- No ejecutar `prisma migrate reset` ni migraciones sobre una base con datos reales sin respaldo y aprobación explícita.
- Las pruebas de concurrencia usan una base descartable (ver skill `testing-backend`).
- Los campos de usuario son `firstName` y `lastName`.
