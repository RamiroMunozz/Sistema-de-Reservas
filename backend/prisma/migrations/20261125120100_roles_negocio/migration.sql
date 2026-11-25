-- M2 de multi-tenant-negocios: roles JUGADOR, DUENO y SUPER_ADMIN, y la restricción que liga
-- el negocio al rol. No toca bookings_sin_solapamiento ni las restricciones y el trigger de M1.

-- RENAME VALUE conserva el OID del tipo: las filas y el valor por defecto pasan solos al nombre nuevo.
ALTER TYPE "Role" RENAME VALUE 'USER' TO 'JUGADOR';
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'DUENO';

-- El literal 'SUPER_ADMIN' no se usa en esta migración: PostgreSQL no permite usar en la misma
-- transacción un valor agregado con ADD VALUE. IF NOT EXISTS permite reaplicar la migración tras
-- una reversa, porque PostgreSQL no permite quitar un valor de un enum.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'JUGADOR';

-- Restricción manual (Prisma no la representa): solo el DUENO tiene negocio.
-- Usa un valor renombrado, no uno agregado, así que es válida en la misma transacción.
ALTER TABLE "users"
  ADD CONSTRAINT "users_negocio_segun_rol"
  CHECK (("role" = 'DUENO') = ("negocio_id" IS NOT NULL));
