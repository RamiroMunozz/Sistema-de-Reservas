import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/core/config/prisma.js";
import { obtenerPago } from "../src/core/integraciones/mercadoPago.js";
import { conBloqueoDeCancha } from "../src/modules/bookings/bloqueoCancha.js";
import { cancelarEnTransaccion } from "../src/modules/bookings/cancelacionReserva.js";
import { PaymentService } from "../src/modules/payments/payment.service.js";
import { ReservaInvitadoService } from "../src/modules/public/reservaInvitado.service.js";
import { generarToken, hashearToken } from "../src/modules/public/tokenAcceso.js";

// La creación de invitado se prueba contra la base real; Mercado Pago, simulado.
vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  obtenerVariableMercadoPago: vi.fn(),
  crearPreferencia: vi.fn(async () => ({
    id: "preferencia-de-prueba",
    initPoint: "https://mp.ejemplo.test/checkout",
    sandboxInitPoint: undefined,
  })),
  expirarPreferencia: vi.fn(),
  obtenerPago: vi.fn(),
  reembolsarPago: vi.fn(),
}));

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
        ("id", "user_id", "guest_phone", "court_id", "negocio_id", "start_time", "end_time",
         "total_price", "status", "updated_at")
      VALUES
        (${id}::uuid, ${userId}::uuid, ${guestPhone}, ${idCancha}::uuid, (SELECT "id" FROM "negocios" WHERE "slug" = 'principal'), ${inicio}, ${fin},
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
      INSERT INTO "complexes" ("id", "name", "address", "negocio_id")
      VALUES (${idComplejo}::uuid, 'Complejo de migración', 'Sin dirección', (SELECT "id" FROM "negocios" WHERE "slug" = 'principal'))`;
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

  describe("creación concurrente de reservas de invitado (RES-007, RES-031)", () => {
    const servicio = new ReservaInvitadoService();
    const idsCanchas: string[] = [];
    let idNegocioPrincipal = "";

    beforeAll(async () => {
      idNegocioPrincipal = (
        await prisma.negocio.findUniqueOrThrow({ where: { slug: "principal" }, select: { id: true } })
      ).id;
    });

    const crearCancha = async (nombre: string): Promise<string> => {
      const id = randomUUID();
      idsCanchas.push(id);
      await prisma.$executeRaw`
        INSERT INTO "courts" ("id", "complex_id", "name", "sport", "surface", "price_per_slot")
        VALUES (${id}::uuid, ${idComplejo}::uuid, ${nombre}, 'PADEL', 'CEMENTO', 1000)`;
      return id;
    };

    const telefonoNuevo = (): string =>
      `549${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`;

    const pedido = (idCancha: string, hora: number, telefono: string) => {
      const { inicio, fin } = horario(hora);
      // Otro día que las demás pruebas de esta base.
      const dia = (fecha: Date) => new Date(fecha.getTime() + 35 * 24 * 60 * 60 * 1000);
      return servicio.crear(idNegocioPrincipal, {
        courtId: idCancha,
        startTime: dia(inicio).toISOString(),
        endTime: dia(fin).toISOString(),
        guestFirstName: "Ana",
        guestLastName: "Concurrente",
        guestPhone: telefono,
      });
    };

    afterAll(async () => {
      for (const id of idsCanchas) {
        await prisma.$executeRaw`DELETE FROM "bookings" WHERE "court_id" = ${id}::uuid`;
        await prisma.$executeRaw`DELETE FROM "courts" WHERE "id" = ${id}::uuid`;
      }
    });

    it("dos solicitudes simultáneas por el mismo turno dejan una sola reserva activa", async () => {
      const idCanchaUnica = await crearCancha("Cancha concurrente 1");

      const resultados = await Promise.allSettled([
        pedido(idCanchaUnica, 14, telefonoNuevo()),
        pedido(idCanchaUnica, 14, telefonoNuevo()),
      ]);

      const rechazadas = resultados.filter((r) => r.status === "rejected");
      const activas = await prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS total FROM "bookings"
        WHERE "court_id" = ${idCanchaUnica}::uuid AND "status" NOT IN ('CANCELLED', 'EXPIRED')`;

      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(rechazadas).toHaveLength(1);
      expect((rechazadas[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
      expect(Number(activas[0]?.total)).toBe(1);
    });

    it("cuatro solicitudes simultáneas del mismo teléfono no superan el tope de 2", async () => {
      const canchaA = await crearCancha("Cancha concurrente 2");
      const canchaB = await crearCancha("Cancha concurrente 3");
      const telefono = telefonoNuevo();

      const resultados = await Promise.allSettled([
        pedido(canchaA, 9, telefono),
        pedido(canchaA, 11, telefono),
        pedido(canchaB, 9, telefono),
        pedido(canchaB, 11, telefono),
      ]);

      const rechazadas = resultados.filter((r) => r.status === "rejected");
      const pendientes = await prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS total FROM "bookings"
        WHERE "guest_phone" = ${telefono} AND "status" = 'PENDING'`;

      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(rechazadas).toHaveLength(2);
      for (const rechazada of rechazadas) {
        expect((rechazada as PromiseRejectedResult).reason).toMatchObject({ statusCode: 429 });
      }
      expect(Number(pendientes[0]?.total)).toBe(2);
    });
  });

  describe("webhook de pago contra cancelación (PAG-012)", () => {
    const SECRETO = "secreto_webhook_concurrencia";
    const servicioPagos = new PaymentService();
    const idsCanchas: string[] = [];

    const firmar = (idPago: string) => {
      const ts = "1704908010";
      const idPedido = `pedido-${idPago}`;
      const firma = createHmac("sha256", SECRETO)
        .update(`id:${idPago};request-id:${idPedido};ts:${ts};`)
        .digest("hex");
      return { firma: `ts=${ts},v1=${firma}`, idPedido };
    };

    beforeAll(() => {
      vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO);
    });

    afterAll(async () => {
      vi.unstubAllEnvs();
      for (const id of idsCanchas) {
        await prisma.$executeRaw`DELETE FROM "booking_payments" WHERE "booking_id" IN (SELECT "id" FROM "bookings" WHERE "court_id" = ${id}::uuid)`;
        await prisma.$executeRaw`DELETE FROM "bookings" WHERE "court_id" = ${id}::uuid`;
        await prisma.$executeRaw`DELETE FROM "courts" WHERE "id" = ${id}::uuid`;
      }
    });

    // Retiene el bloqueo de la cancha desde otra transacción hasta que se llame a soltar().
    const retenerBloqueo = async (idCancha: string) => {
      let soltar = () => {};
      const liberado = new Promise<void>((resolver) => {
        soltar = resolver;
      });
      let avisarTomado = () => {};
      const tomado = new Promise<void>((resolver) => {
        avisarTomado = resolver;
      });
      const transaccion = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idCancha}))`;
          avisarTomado();
          await liberado;
        },
        { maxWait: 5000, timeout: 15000 },
      );
      await tomado;
      return { soltar, terminado: transaccion };
    };

    // Espera a que haya exactamente `cantidad` transacciones encoladas en bloqueos de aviso.
    // Los archivos corren en serie (fileParallelism: false), así que no hay esperas ajenas.
    const esperarEncoladas = async (cantidad: number) => {
      for (let intento = 0; intento < 200; intento += 1) {
        const filas = await prisma.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        if (Number(filas[0]?.total) === cantidad) return;
        await new Promise((resolver) => setTimeout(resolver, 10));
      }
      throw new Error(`No se encolaron ${cantidad} transacciones en el bloqueo de la cancha`);
    };

    // Lanza las operaciones en el orden dado, cada una encolada detrás del bloqueo
    // retenido, y lo suelta siempre: si una espera falla, el bloqueo no queda tomado
    // ni quedan promesas sin esperar que afecten a la prueba siguiente.
    const enOrden = async (idCancha: string, operaciones: Array<() => Promise<unknown>>) => {
      const portero = await retenerBloqueo(idCancha);
      const lanzadas: Promise<unknown>[] = [];
      try {
        for (const [indice, operacion] of operaciones.entries()) {
          lanzadas.push(operacion());
          await esperarEncoladas(indice + 1);
        }
      } finally {
        portero.soltar();
        const resultados = await Promise.allSettled([portero.terminado, ...lanzadas]);
        const fallida = resultados.find(
          (resultado): resultado is PromiseRejectedResult => resultado.status === "rejected",
        );
        if (fallida) throw fallida.reason;
      }
    };

    const prepararReserva = async (nombre: string, idPago: string) => {
      const idCanchaPropia = randomUUID();
      idsCanchas.push(idCanchaPropia);
      await prisma.$executeRaw`
        INSERT INTO "courts" ("id", "complex_id", "name", "sport", "surface", "price_per_slot")
        VALUES (${idCanchaPropia}::uuid, ${idComplejo}::uuid, ${nombre}, 'PADEL', 'CEMENTO', 1000)`;
      const idReserva = randomUUID();
      const { inicio, fin } = horario(9);
      await prisma.$executeRaw`
        INSERT INTO "bookings"
          ("id", "user_id", "court_id", "negocio_id", "start_time", "end_time", "total_price", "status", "updated_at")
        VALUES
          (${idReserva}::uuid, ${idUsuario}::uuid, ${idCanchaPropia}::uuid, (SELECT "id" FROM "negocios" WHERE "slug" = 'principal'), ${inicio}, ${fin},
           1000, 'PENDING'::"BookingStatus", now())`;
      vi.mocked(obtenerPago).mockResolvedValue({
        status: "approved",
        transaction_amount: 1000,
        external_reference: idReserva,
      } as Awaited<ReturnType<typeof obtenerPago>>);
      const { firma, idPedido } = firmar(idPago);
      return {
        idCancha: idCanchaPropia,
        idReserva,
        procesarPago: () =>
          servicioPagos.procesarNotificacion({ firma, idPedido, idPago, tipo: "payment" }),
        cancelar: () =>
          conBloqueoDeCancha(idCanchaPropia, (transaccion) =>
            cancelarEnTransaccion(transaccion, idReserva),
          ),
      };
    };

    const leerResultado = async (idReserva: string) => {
      const reservas = await prisma.$queryRaw<{ status: string }[]>`
        SELECT "status"::text AS status FROM "bookings" WHERE "id" = ${idReserva}::uuid`;
      const pagos = await prisma.$queryRaw<{ is_valid: boolean; refund_reason: string | null }[]>`
        SELECT "is_valid", "refund_reason"::text AS refund_reason
        FROM "booking_payments" WHERE "booking_id" = ${idReserva}::uuid`;
      return { estado: reservas[0]?.status, pagos };
    };

    it("si el pago toma el bloqueo primero, confirma y la cancelación lo marca OWNER_DISCRETION", async () => {
      const reserva = await prepararReserva("Cancha webhook primero", "900000001");
      await enOrden(reserva.idCancha, [reserva.procesarPago, reserva.cancelar]);

      const { estado, pagos } = await leerResultado(reserva.idReserva);
      expect(estado).toBe("CANCELLED");
      expect(pagos).toEqual([{ is_valid: true, refund_reason: "OWNER_DISCRETION" }]);
    });

    it("si la cancelación toma el bloqueo primero, el pago queda PAID_AFTER_CANCEL sin reactivar", async () => {
      const reserva = await prepararReserva("Cancha cancelación primero", "900000002");
      await enOrden(reserva.idCancha, [reserva.cancelar, reserva.procesarPago]);

      const { estado, pagos } = await leerResultado(reserva.idReserva);
      expect(estado).toBe("CANCELLED");
      expect(pagos).toEqual([{ is_valid: false, refund_reason: "PAID_AFTER_CANCEL" }]);
    });
  });

  describe("cancelaciones simultáneas por token (RES-029)", () => {
    const servicio = new ReservaInvitadoService();
    const idCanchaPropia = randomUUID();
    const idReserva = randomUUID();
    const token = generarToken();

    beforeAll(async () => {
      const { inicio, fin } = horario(10);
      await prisma.$executeRaw`
        INSERT INTO "courts" ("id", "complex_id", "name", "sport", "surface", "price_per_slot")
        VALUES (${idCanchaPropia}::uuid, ${idComplejo}::uuid, 'Cancha cancelación por token', 'PADEL', 'CEMENTO', 1000)`;
      await prisma.$executeRaw`
        INSERT INTO "bookings"
          ("id", "court_id", "negocio_id", "start_time", "end_time", "total_price", "status",
           "guest_first_name", "guest_last_name", "guest_phone", "deposit_amount",
           "access_token_hash", "updated_at")
        VALUES
          (${idReserva}::uuid, ${idCanchaPropia}::uuid, (SELECT "id" FROM "negocios" WHERE "slug" = 'principal'), ${inicio}, ${fin}, 1000,
           'CONFIRMED'::"BookingStatus", 'Ana', 'Pérez', '5491100000001', 300.00,
           ${hashearToken(token)}, now())`;
      await insertarPago({ idReserva, idMp: idMp(), esValido: true });
      idsReservas.push(idReserva);
    });

    afterAll(async () => {
      await prisma.$executeRaw`DELETE FROM "booking_payments" WHERE "booking_id" = ${idReserva}::uuid`;
      await prisma.$executeRaw`DELETE FROM "bookings" WHERE "id" = ${idReserva}::uuid`;
      await prisma.$executeRaw`DELETE FROM "courts" WHERE "id" = ${idCanchaPropia}::uuid`;
    });

    it("dos cancelaciones simultáneas dejan una sola exitosa y un único pago a criterio del canchero", async () => {
      const resultados = await Promise.allSettled([
        servicio.cancelar(token),
        servicio.cancelar(token),
      ]);

      const exitosas = resultados.filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof servicio.cancelar>>> =>
          r.status === "fulfilled",
      );
      const rechazadas = resultados.filter((r) => r.status === "rejected");

      expect(exitosas).toHaveLength(1);
      expect(exitosas[0]?.value).toMatchObject({
        status: "CANCELLED",
        refundAtOwnerDiscretion: true,
      });
      expect(rechazadas).toHaveLength(1);
      expect((rechazadas[0] as PromiseRejectedResult).reason).toMatchObject({
        statusCode: 409,
      });

      const reservas = await prisma.$queryRaw<
        { status: string; deposit_paid_at_cancel: boolean | null }[]
      >`SELECT "status"::text AS status, "deposit_paid_at_cancel" FROM "bookings" WHERE "id" = ${idReserva}::uuid`;
      const pagos = await prisma.$queryRaw<{ refund_reason: string | null }[]>`
        SELECT "refund_reason"::text AS refund_reason FROM "booking_payments"
        WHERE "booking_id" = ${idReserva}::uuid`;

      expect(reservas[0]).toEqual({ status: "CANCELLED", deposit_paid_at_cancel: true });
      expect(pagos).toEqual([{ refund_reason: "OWNER_DISCRETION" }]);
    });
  });
});
