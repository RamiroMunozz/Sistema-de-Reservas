-- Prisma no representa esta restricción. Se recrea en una sola sentencia:
-- el bloqueo ACCESS EXCLUSIVE dura toda la sentencia y no hay ventana sin restricción.
-- Va en una migración aparte porque usa el literal 'EXPIRED', agregado con ADD VALUE
-- en la migración anterior y no utilizable dentro de la misma transacción.
ALTER TABLE "bookings"
  DROP CONSTRAINT "bookings_sin_solapamiento",
  ADD CONSTRAINT "bookings_sin_solapamiento"
  EXCLUDE USING gist (
    "court_id" WITH =,
    tstzrange("start_time", "end_time") WITH &&
  )
  WHERE ("status" NOT IN ('CANCELLED', 'EXPIRED'));
