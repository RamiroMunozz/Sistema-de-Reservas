-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('AMOUNT_MISMATCH', 'SLOT_TAKEN', 'PAID_AFTER_CANCEL', 'DUPLICATE_PAYMENT', 'OWNER_DISCRETION');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "access_token_hash" CHAR(64),
ADD COLUMN     "deposit_amount" DECIMAL(10,2),
ADD COLUMN     "deposit_paid_at_cancel" BOOLEAN,
ADD COLUMN     "expires_at" TIMESTAMPTZ,
ADD COLUMN     "guest_email" VARCHAR(255),
ADD COLUMN     "guest_first_name" VARCHAR(100),
ADD COLUMN     "guest_last_name" VARCHAR(100),
ADD COLUMN     "guest_phone" VARCHAR(15),
ADD COLUMN     "mp_preference_id" VARCHAR(100),
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "complexes" ADD COLUMN     "deposit_percent" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "booking_payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "mp_payment_id" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "is_valid" BOOLEAN NOT NULL,
    "refund_reason" "RefundReason",
    "refunded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_payments_mp_payment_id_key" ON "booking_payments"("mp_payment_id");

-- CreateIndex
CREATE INDEX "booking_payments_booking_id_idx" ON "booking_payments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_access_token_hash_key" ON "bookings"("access_token_hash");

-- CreateIndex
CREATE INDEX "bookings_status_expires_at_idx" ON "bookings"("status", "expires_at");

-- CreateIndex
CREATE INDEX "bookings_guest_phone_status_idx" ON "bookings"("guest_phone", "status");

-- AddForeignKey
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Restricciones manuales: Prisma no las representa en schema.prisma.
-- Esta migración NO usa el literal 'EXPIRED': PostgreSQL no permite usar un valor
-- agregado con ADD VALUE dentro de la misma transacción. La restricción de
-- solapamiento que lo usa se recrea en la migración siguiente.

-- RES-033: la reserva tiene titular: o una cuenta o un teléfono de invitado, nunca ambos ni ninguno.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_titular_valido"
  CHECK (
    ("user_id" IS NOT NULL AND "guest_phone" IS NULL)
    OR ("user_id" IS NULL AND "guest_phone" IS NOT NULL)
  );

-- ADM-015: el porcentaje de seña va de 1 a 100.
ALTER TABLE "complexes"
  ADD CONSTRAINT "complexes_porcentaje_sena_valido"
  CHECK ("deposit_percent" BETWEEN 1 AND 100);

-- Un pago válido solo puede no tener motivo o estar a criterio del canchero;
-- un pago no válido siempre tiene un motivo de reembolso obligatorio.
ALTER TABLE "booking_payments"
  ADD CONSTRAINT "booking_payments_motivo_coherente"
  CHECK (
    ("is_valid" AND ("refund_reason" IS NULL OR "refund_reason" = 'OWNER_DISCRETION'))
    OR (NOT "is_valid" AND "refund_reason" IS NOT NULL AND "refund_reason" <> 'OWNER_DISCRETION')
  );

-- A lo sumo un pago válido vigente (sin reembolso) por reserva.
-- Un pago válido ya reembolsado no impide aceptar un nuevo pago válido.
ALTER TABLE "booking_payments"
  ADD CONSTRAINT "booking_payments_un_pago_valido"
  EXCLUDE USING btree ("booking_id" WITH =) WHERE ("is_valid" AND "refunded_at" IS NULL);
