-- Prisma no puede representar estas restricciones en schema.prisma.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_horario_valido"
  CHECK ("end_time" > "start_time");

-- Garantiza en la base que una cancha no tenga dos reservas activas solapadas.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_sin_solapamiento"
  EXCLUDE USING gist (
    "court_id" WITH =,
    tstzrange("start_time", "end_time") WITH &&
  )
  WHERE ("status" <> 'CANCELLED');
