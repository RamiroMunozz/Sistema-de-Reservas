-- M1 de multi-tenant-negocios: modelo Negocio, migración de los datos existentes al negocio
-- "principal" y restricciones que Prisma no representa.
-- No toca bookings_sin_solapamiento, bookings_horario_valido, bookings_titular_valido,
-- complexes_porcentaje_sena_valido ni las restricciones de booking_payments.

-- CreateTable
CREATE TABLE "negocios" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "negocios_slug_key" ON "negocios"("slug");

-- Negocio al que pasan los datos existentes (NEG-012).
INSERT INTO "negocios" ("id", "nombre", "slug")
VALUES (gen_random_uuid(), 'Negocio principal', 'principal');

-- AlterTable: columnas nulables hasta migrar los datos.
ALTER TABLE "complexes" ADD COLUMN "negocio_id" UUID;
ALTER TABLE "bookings" ADD COLUMN "negocio_id" UUID;
ALTER TABLE "users" ADD COLUMN "negocio_id" UUID;

-- Migración de datos: todo complejo pasa a "principal"; la reserva toma el negocio del
-- complejo de su cancha; solo los usuarios ADMIN quedan como dueños de "principal".
UPDATE "complexes"
SET "negocio_id" = (SELECT "id" FROM "negocios" WHERE "slug" = 'principal');

UPDATE "bookings" b
SET "negocio_id" = c."negocio_id"
FROM "courts" ct
JOIN "complexes" c ON c."id" = ct."complex_id"
WHERE ct."id" = b."court_id";

UPDATE "users"
SET "negocio_id" = (SELECT "id" FROM "negocios" WHERE "slug" = 'principal')
WHERE "role" = 'ADMIN';

-- AlterTable
ALTER TABLE "complexes" ALTER COLUMN "negocio_id" SET NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "negocio_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complexes" ADD CONSTRAINT "complexes_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropIndex: lo reemplaza el índice con negocio_id.
DROP INDEX "bookings_guest_phone_status_idx";

-- CreateIndex
CREATE INDEX "complexes_negocio_id_idx" ON "complexes"("negocio_id");

-- CreateIndex
CREATE INDEX "bookings_negocio_id_start_time_idx" ON "bookings"("negocio_id", "start_time");

-- CreateIndex
CREATE INDEX "bookings_negocio_id_guest_phone_status_idx" ON "bookings"("negocio_id", "guest_phone", "status");

-- D10: una sola cuenta de dueño por negocio. Restricción (no índice suelto) para que Prisma no la borre.
ALTER TABLE "users"
  ADD CONSTRAINT "users_un_dueno_por_negocio"
  EXCLUDE USING btree ("negocio_id" WITH =) WHERE ("negocio_id" IS NOT NULL);

-- La reserva pertenece al negocio del complejo de su cancha.
CREATE FUNCTION "bookings_validar_negocio"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."negocio_id" IS DISTINCT FROM (
    SELECT c."negocio_id" FROM "courts" ct
    JOIN "complexes" c ON c."id" = ct."complex_id"
    WHERE ct."id" = NEW."court_id"
  ) THEN
    RAISE EXCEPTION 'bookings_negocio_coherente: la reserva no pertenece al negocio de su cancha'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "bookings_negocio_coherente"
  BEFORE INSERT OR UPDATE OF "court_id", "negocio_id" ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION "bookings_validar_negocio"();
