import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/core/config/prisma.js";

// Solo corre contra una base descartable con las migraciones aplicadas:
// escribe y borra filas. Usa SQL directo para no depender de los tipos del cliente.
const URL_BASE_DE_PRUEBA = process.env.DATABASE_URL_PRUEBA;

type EstadoReserva = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "EXPIRED";
type MotivoReembolso =
  | "AMOUNT_MISMATCH"
  | "SLOT_TAKEN"
  | "PAID_AFTER_CANCEL"
  | "DUPLICATE_PAYMENT"
  | "OWNER_DISCRETION";

const horario = (hora: number) => ({
  inicio: new Date(`2031-03-10T${String(hora).padStart(2, "0")}:00:00.000Z`),
  fin: new Date(`2031-03-10T${String(hora + 1).padStart(2, "0")}:00:00.000Z`),
});

describe.skipIf(!URL_BASE_DE_PRUEBA)("Migraciones de reserva-invitado (base descartable)", () => {
  let idUsuario: string;
  let idComplejo: string;
  let idCancha: string;
  const idsReservas: string[] = [];

  const insertarReserva = async (datos: {
    estado: EstadoReserva;
    hora: number;
    userId?: string | null;
    guestPhone?: string | null;
  }): Promise<string> => {
    const id = randomUUID();
    const { inicio, fin } = horario(datos.hora);
    const userId = datos.userId === undefined ? idUsuario : datos.userId;
    const guestPhone = datos.guestPhone ?? null;
    // Se registra antes de insertar para limpiar aunque la inserción falle a medias.
    idsReservas.push(id);
    await prisma.$executeRaw`
      INSERT INTO "bookings"
        ("id", "user_id", "guest_phone", "court_id", "start_time", "end_time",
         "total_price", "status", "updated_at")
      VALUES
        (${id}::uuid, ${userId}::uuid, ${guestPhone}, ${idCancha}::uuid, ${inicio}, ${fin},
         1000, ${datos.estado}::"BookingStatus", now())`;
    return id;
  };

  const insertarPago = async (datos: {
    idReserva: string;
    idMp: string;
    esValido: boolean;
    motivo?: MotivoReembolso | null;
  }): Promise<string> => {
    const id = randomUUID();
    const motivo = datos.motivo ?? null;
    await prisma.$executeRaw`
      INSERT INTO "booking_payments"
        ("id", "booking_id", "mp_payment_id", "amount", "is_valid", "refund_reason")
      VALUES
        (${id}::uuid, ${datos.idReserva}::uuid, ${datos.idMp}, 300.00, ${datos.esValido},
         ${motivo}::"RefundReason")`;
    return id;
  };

  const idMp = () => randomUUID().replaceAll("-", "").slice(0, 20);

  beforeAll(async () => {
    idUsuario = randomUUID();
    idComplejo = randomUUID();
    idCancha = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "updated_at")
      VALUES (${idUsuario}::uuid, ${`migracion-${idUsuario}@example.com`}, 'sin_uso', 'Prueba', 'Migracion', now())`;
    await prisma.$executeRaw`
      INSERT INTO "complexes" ("id", "name", "address")
      VALUES (${idComplejo}::uuid, 'Complejo de migración', 'Sin dirección')`;
    await prisma.$executeRaw`
      INSERT INTO "courts" ("id", "complex_id", "name", "sport", "surface", "price_per_slot")
      VALUES (${idCancha}::uuid, ${idComplejo}::uuid, 'Cancha de migración', 'PADEL', 'CEMENTO', 1000)`;
  });

  afterAll(async () => {
    for (const id of idsReservas) {
      await prisma.$executeRaw`DELETE FROM "booking_payments" WHERE "booking_id" = ${id}::uuid`;
    }
    await prisma.$executeRaw`DELETE FROM "bookings" WHERE "court_id" = ${idCancha}::uuid`;
    await prisma.$executeRaw`DELETE FROM "courts" WHERE "id" = ${idCancha}::uuid`;
    await prisma.$executeRaw`DELETE FROM "complexes" WHERE "id" = ${idComplejo}::uuid`;
    await prisma.$executeRaw`DELETE FROM "users" WHERE "id" = ${idUsuario}::uuid`;
  });

  describe("bookings_sin_solapamiento (RES-009)", () => {
    it("una reserva EXPIRED no ocupa el turno y se acepta una nueva en ese horario", async () => {
      await insertarReserva({ estado: "EXPIRED", hora: 8 });

      await expect(insertarReserva({ estado: "PENDING", hora: 8 })).resolves.toBeTypeOf("string");
    });

    it("una reserva PENDING sí ocupa el turno", async () => {
      await insertarReserva({ estado: "PENDING", hora: 10 });

      await expect(insertarReserva({ estado: "CONFIRMED", hora: 10 })).rejects.toThrow(
        /bookings_sin_solapamiento/,
      );
    });

    it("una reserva CANCELLED sigue sin ocupar el turno", async () => {
      await insertarReserva({ estado: "CANCELLED", hora: 12 });

      await expect(insertarReserva({ estado: "CONFIRMED", hora: 12 })).resolves.toBeTypeOf("string");
    });
  });

  describe("bookings_titular_valido (RES-033)", () => {
    it("rechaza una reserva con cuenta y teléfono de invitado a la vez", async () => {
      await expect(
        insertarReserva({ estado: "PENDING", hora: 14, guestPhone: "1155550000" }),
      ).rejects.toThrow(/bookings_titular_valido/);
    });

    it("rechaza una reserva sin cuenta y sin teléfono de invitado", async () => {
      await expect(
        insertarReserva({ estado: "PENDING", hora: 15, userId: null }),
      ).rejects.toThrow(/bookings_titular_valido/);
    });

    it("acepta una reserva solo de invitado y una solo con cuenta", async () => {
      await expect(
        insertarReserva({ estado: "PENDING", hora: 16, userId: null, guestPhone: "1155550000" }),
      ).resolves.toBeTypeOf("string");
      await expect(insertarReserva({ estado: "PENDING", hora: 17 })).resolves.toBeTypeOf("string");
    });
  });

  describe("booking_payments_motivo_coherente", () => {
    it("acepta el ciclo válido, OWNER_DISCRETION y reembolsado", async () => {
      const idReserva = await insertarReserva({ estado: "CONFIRMED", hora: 18 });
      const idPago = await insertarPago({ idReserva, idMp: idMp(), esValido: true });

      await expect(
        prisma.$executeRaw`UPDATE "booking_payments" SET "refund_reason" = 'OWNER_DISCRETION'::"RefundReason" WHERE "id" = ${idPago}::uuid`,
      ).resolves.toBe(1);
      await expect(
        prisma.$executeRaw`UPDATE "booking_payments" SET "refunded_at" = now() WHERE "id" = ${idPago}::uuid`,
      ).resolves.toBe(1);
    });

    it("rechaza un pago no válido sin motivo", async () => {
      const idReserva = await insertarReserva({ estado: "CONFIRMED", hora: 19 });

      await expect(
        insertarPago({ idReserva, idMp: idMp(), esValido: false }),
      ).rejects.toThrow(/booking_payments_motivo_coherente/);
    });

    it("rechaza un pago no válido con OWNER_DISCRETION", async () => {
      const idReserva = await insertarReserva({ estado: "CONFIRMED", hora: 20 });

      await expect(
        insertarPago({ idReserva, idMp: idMp(), esValido: false, motivo: "OWNER_DISCRETION" }),
      ).rejects.toThrow(/booking_payments_motivo_coherente/);
    });

    it("rechaza un pago válido con un motivo obligatorio y acepta uno no válido con motivo", async () => {
      const idReserva = await insertarReserva({ estado: "CONFIRMED", hora: 21 });

      await expect(
        insertarPago({ idReserva, idMp: idMp(), esValido: true, motivo: "AMOUNT_MISMATCH" }),
      ).rejects.toThrow(/booking_payments_motivo_coherente/);
      await expect(
        insertarPago({ idReserva, idMp: idMp(), esValido: false, motivo: "AMOUNT_MISMATCH" }),
      ).resolves.toBeTypeOf("string");
    });
  });

  describe("booking_payments_un_pago_valido", () => {
    it("rechaza un segundo pago válido sin reembolso y acepta uno nuevo tras un reembolso", async () => {
      const idReserva = await insertarReserva({ estado: "CONFIRMED", hora: 22 });
      const idPrimero = await insertarPago({ idReserva, idMp: idMp(), esValido: true });

      await expect(
        insertarPago({ idReserva, idMp: idMp(), esValido: true }),
      ).rejects.toThrow(/booking_payments_un_pago_valido/);

      await prisma.$executeRaw`UPDATE "booking_payments" SET "refunded_at" = now() WHERE "id" = ${idPrimero}::uuid`;

      await expect(
        insertarPago({ idReserva, idMp: idMp(), esValido: true }),
      ).resolves.toBeTypeOf("string");
    });

    it("no limita los pagos no válidos de una reserva", async () => {
      const idReserva = await insertarReserva({ estado: "CONFIRMED", hora: 23 });
      await insertarPago({ idReserva, idMp: idMp(), esValido: true });

      await expect(
        insertarPago({ idReserva, idMp: idMp(), esValido: false, motivo: "DUPLICATE_PAYMENT" }),
      ).resolves.toBeTypeOf("string");
      await expect(
        insertarPago({ idReserva, idMp: idMp(), esValido: false, motivo: "DUPLICATE_PAYMENT" }),
      ).resolves.toBeTypeOf("string");
    });

    it("mp_payment_id es único", async () => {
      const idReserva = await insertarReserva({ estado: "CANCELLED", hora: 7 });
      const repetido = idMp();
      await insertarPago({ idReserva, idMp: repetido, esValido: false, motivo: "PAID_AFTER_CANCEL" });

      await expect(
        insertarPago({ idReserva, idMp: repetido, esValido: false, motivo: "PAID_AFTER_CANCEL" }),
      ).rejects.toThrow(/mp_payment_id/);
    });
  });

  describe("complexes_porcentaje_sena_valido", () => {
    it("el porcentaje de seña vale 30 por defecto", async () => {
      const filas = await prisma.$queryRaw<{ deposit_percent: number }[]>`
        SELECT "deposit_percent" FROM "complexes" WHERE "id" = ${idComplejo}::uuid`;

      expect(filas[0]?.deposit_percent).toBe(30);
    });

    it.each([0, 101])("rechaza un porcentaje de %i", async (porcentaje) => {
      await expect(
        prisma.$executeRaw`UPDATE "complexes" SET "deposit_percent" = ${porcentaje} WHERE "id" = ${idComplejo}::uuid`,
      ).rejects.toThrow(/complexes_porcentaje_sena_valido/);
    });

    it.each([1, 100])("acepta un porcentaje de %i", async (porcentaje) => {
      await expect(
        prisma.$executeRaw`UPDATE "complexes" SET "deposit_percent" = ${porcentaje} WHERE "id" = ${idComplejo}::uuid`,
      ).resolves.toBe(1);
    });
  });
});
