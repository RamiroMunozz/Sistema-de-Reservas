import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const FECHA_SIN_RESERVAS = "2000-01-01";

const firmarToken = (rol: "USER" | "ADMIN"): string =>
  jwt.sign({ userId: randomUUID(), role: rol }, SECRETO_DE_PRUEBA);

const conToken = (rol: "USER" | "ADMIN") => ({
  Authorization: `Bearer ${firmarToken(rol)}`,
});

describe("Rutas admin de reservas", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("usuario sin rol ADMIN", () => {
    const mensajeProhibido =
      "No tienes los permisos necesarios para realizar esta acción";

    it("recibe 403 en GET /admin/daily", async () => {
      const respuesta = await request(app)
        .get(`/api/v1/bookings/admin/daily?date=${FECHA_SIN_RESERVAS}`)
        .set(conToken("USER"));

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(mensajeProhibido);
    });

    it("recibe 403 en PATCH /admin/:id/status", async () => {
      const respuesta = await request(app)
        .patch(`/api/v1/bookings/admin/${randomUUID()}/status`)
        .set(conToken("USER"))
        .send({ status: "CANCELLED" });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(mensajeProhibido);
    });

    it("recibe 403 en GET /admin/all", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bookings/admin/all")
        .set(conToken("USER"));

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(mensajeProhibido);
    });

    it("recibe 403 en POST /admin/create", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings/admin/create")
        .set(conToken("USER"))
        .send({
          courtId: randomUUID(),
          startTime: "2000-01-01T10:00:00.000Z",
          endTime: "2000-01-01T11:00:00.000Z",
          paymentMethod: "CASH",
        });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(mensajeProhibido);
    });
  });

  describe("comportamiento que se mantiene", () => {
    it("un pedido sin token recibe 401 en GET /admin/daily", async () => {
      const respuesta = await request(app).get(
        `/api/v1/bookings/admin/daily?date=${FECHA_SIN_RESERVAS}`,
      );

      expect(respuesta.status).toBe(401);
    });

    it("un pedido sin token recibe 401 en GET /admin/all", async () => {
      const respuesta = await request(app).get("/api/v1/bookings/admin/all");

      expect(respuesta.status).toBe(401);
    });

    it("un ADMIN lista todas las reservas en GET /admin/all, de la más reciente a la más antigua", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bookings/admin/all")
        .set(conToken("ADMIN"));

      expect(respuesta.status).toBe(200);
      expect(Array.isArray(respuesta.body)).toBe(true);

      const reservas = respuesta.body as Array<{
        startTime: string;
        court: { name: string; sport: string };
        user: { email: string; password?: string };
      }>;

      for (const reserva of reservas) {
        expect(reserva.court.name).toEqual(expect.any(String));
        expect(reserva.user.email).toEqual(expect.any(String));
        expect(reserva.user).not.toHaveProperty("password");
      }

      const inicios = reservas.map((r) => new Date(r.startTime).getTime());
      const ordenados = [...inicios].sort((a, b) => b - a);
      expect(inicios).toEqual(ordenados);
    });

    it("un pedido sin token recibe 401 en PATCH /admin/:id/status", async () => {
      const respuesta = await request(app)
        .patch(`/api/v1/bookings/admin/${randomUUID()}/status`)
        .send({ status: "CANCELLED" });

      expect(respuesta.status).toBe(401);
    });

    it("un pedido sin token recibe 401 en POST /admin/create", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings/admin/create")
        .send({
          courtId: randomUUID(),
          startTime: "2000-01-01T10:00:00.000Z",
          endTime: "2000-01-01T11:00:00.000Z",
          paymentMethod: "CASH",
        });

      expect(respuesta.status).toBe(401);
    });

    it("un ADMIN accede a GET /admin/daily", async () => {
      const respuesta = await request(app)
        .get(`/api/v1/bookings/admin/daily?date=${FECHA_SIN_RESERVAS}`)
        .set(conToken("ADMIN"));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([]);
    });

    it("un ADMIN recibe 400 si la cancha no existe en POST /admin/create", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings/admin/create")
        .set(conToken("ADMIN"))
        .send({
          courtId: randomUUID(),
          startTime: "2000-01-01T10:00:00.000Z",
          endTime: "2000-01-01T11:00:00.000Z",
          paymentMethod: "CASH",
        });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe("La cancha no existe.");
    });

    it("un usuario consulta sus propias reservas en GET /my-bookings", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bookings/my-bookings")
        .set(conToken("USER"));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([]);
    });

    it("un usuario recibe 400 si la cancha no existe en POST /", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings")
        .set(conToken("USER"))
        .send({
          courtId: randomUUID(),
          startTime: "2000-01-01T10:00:00.000Z",
          endTime: "2000-01-01T11:00:00.000Z",
        });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe("La cancha no existe.");
    });
  });
});

// Escribe y borra filas: solo corre contra la base descartable (DATABASE_URL_PRUEBA).
describe.skipIf(!process.env.DATABASE_URL_PRUEBA)(
  "Vista de administrador con pagos (RES-013, ADM-008, PAG-026)",
  () => {
    const FECHA = "2031-04-10";
    const CAMPOS_DEL_PAGO = [
      "amount",
      "createdAt",
      "id",
      "isValid",
      "mpPaymentId",
      "refundReason",
      "refundedAt",
    ];

    type VistaPago = {
      id: string;
      mpPaymentId: string;
      amount: number;
      isValid: boolean;
      refundReason: string | null;
      refundedAt: string | null;
      createdAt: string;
    };

    type VistaReserva = {
      id: string;
      status: string;
      court: { name: string };
      user: { email: string } | null;
      guestFirstName: string | null;
      guestPhone: string | null;
      depositAmount: number | null;
      depositStatus: string | null;
      refundDue: string | null;
      payments: VistaPago[];
    };

    const idUsuario = randomUUID();
    const idComplejo = randomUUID();
    const idCancha = randomUUID();
    const idInvitadoPagado = randomUUID();
    const idInvitadoVencida = randomUUID();
    const idInvitadoCancelada = randomUUID();
    const idConCuenta = randomUUID();
    const idsPagos: string[] = [];

    // Hash de 64 caracteres, distinto por reserva (la columna es única)
    const hashDe = (id: string): string => id.replaceAll("-", "").repeat(2);

    const insertarReserva = async (datos: {
      id: string;
      hora: number;
      estado: "PENDING" | "CONFIRMED" | "CANCELLED";
      invitado: boolean;
      sena: number | null;
      venceHaceMinutos?: number;
    }) => {
      const inicio = new Date(`${FECHA}T${String(datos.hora).padStart(2, "0")}:00:00.000Z`);
      const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
      const vence =
        datos.venceHaceMinutos === undefined
          ? null
          : new Date(Date.now() - datos.venceHaceMinutos * 60 * 1000);
      const userId = datos.invitado ? null : idUsuario;
      const nombre = datos.invitado ? "Ana" : null;
      const telefono = datos.invitado ? "5491155551234" : null;
      const hash = datos.invitado ? hashDe(datos.id) : null;
      const preferencia = datos.invitado ? "preferencia-interna" : null;

      await prisma.$executeRaw`
        INSERT INTO "bookings"
          ("id", "user_id", "guest_first_name", "guest_last_name", "guest_phone", "guest_email",
           "court_id", "negocio_id", "start_time", "end_time", "total_price", "status", "expires_at",
           "deposit_amount", "access_token_hash", "mp_preference_id", "updated_at")
        VALUES
          (${datos.id}::uuid, ${userId}::uuid, ${nombre}, ${nombre}, ${telefono}, ${nombre ? "ana@ejemplo.test" : null},
           ${idCancha}::uuid, ${inicio}, ${fin}, 1000, ${datos.estado}::"BookingStatus", ${vence},
           ${datos.sena}, ${hash}, ${preferencia}, now())`;
    };

    const insertarPago = async (datos: {
      idReserva: string;
      importe: number;
      esValido: boolean;
      motivo: string | null;
    }) => {
      const id = randomUUID();
      const idMp = randomUUID().replaceAll("-", "").slice(0, 20);
      idsPagos.push(id);
      await prisma.$executeRaw`
        INSERT INTO "booking_payments"
          ("id", "booking_id", "mp_payment_id", "amount", "is_valid", "refund_reason")
        VALUES
          (${id}::uuid, ${datos.idReserva}::uuid, ${idMp}, ${datos.importe}, ${datos.esValido},
           ${datos.motivo}::"RefundReason")`;
    };

    const buscar = (reservas: VistaReserva[], id: string): VistaReserva => {
      const encontrada = reservas.find((r) => r.id === id);

      if (!encontrada) {
        throw new Error(`La reserva ${id} no figura en la respuesta.`);
      }

      return encontrada;
    };

    beforeAll(async () => {
      vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);

      await prisma.$executeRaw`
        INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "updated_at")
        VALUES (${idUsuario}::uuid, ${`vista-admin-${idUsuario}@example.com`}, 'sin_uso', 'Cuenta', 'Prueba', now())`;
      await prisma.$executeRaw`
        INSERT INTO "complexes" ("id", "name", "address", "negocio_id")
        VALUES (${idComplejo}::uuid, 'Complejo vista admin', 'Sin dirección', (SELECT "id" FROM "negocios" WHERE "slug" = 'principal'))`;
      await prisma.$executeRaw`
        INSERT INTO "courts" ("id", "complex_id", "name", "sport", "surface", "price_per_slot")
        VALUES (${idCancha}::uuid, ${idComplejo}::uuid, 'Cancha vista admin', 'PADEL', 'CEMENTO', 1000)`;

      await insertarReserva({ id: idInvitadoPagado, hora: 10, estado: "CONFIRMED", invitado: true, sena: 300 });
      await insertarPago({ idReserva: idInvitadoPagado, importe: 300, esValido: true, motivo: null });
      await insertarPago({ idReserva: idInvitadoPagado, importe: 100, esValido: false, motivo: "AMOUNT_MISMATCH" });

      // PENDING con vencimiento pasado que el barrido todavía no pasó a EXPIRED
      await insertarReserva({
        id: idInvitadoVencida,
        hora: 11,
        estado: "PENDING",
        invitado: true,
        sena: 300,
        venceHaceMinutos: 30,
      });

      await insertarReserva({ id: idInvitadoCancelada, hora: 12, estado: "CANCELLED", invitado: true, sena: 300 });
      await insertarPago({ idReserva: idInvitadoCancelada, importe: 300, esValido: true, motivo: "OWNER_DISCRETION" });

      await insertarReserva({ id: idConCuenta, hora: 13, estado: "CONFIRMED", invitado: false, sena: null });
    });

    afterAll(async () => {
      for (const id of idsPagos) {
        await prisma.$executeRaw`DELETE FROM "booking_payments" WHERE "id" = ${id}::uuid`;
      }
      await prisma.$executeRaw`DELETE FROM "bookings" WHERE "court_id" = ${idCancha}::uuid`;
      await prisma.$executeRaw`DELETE FROM "courts" WHERE "id" = ${idCancha}::uuid`;
      await prisma.$executeRaw`DELETE FROM "complexes" WHERE "id" = ${idComplejo}::uuid`;
      await prisma.$executeRaw`DELETE FROM "users" WHERE "id" = ${idUsuario}::uuid`;
      vi.unstubAllEnvs();
    });

    describe("GET /admin/all (ADM-008)", () => {
      const pedirTodas = async (): Promise<VistaReserva[]> => {
        const respuesta = await request(app)
          .get("/api/v1/bookings/admin/all")
          .set(conToken("ADMIN"));

        expect(respuesta.status).toBe(200);
        return respuesta.body as VistaReserva[];
      };

      it("incluye los pagos con su motivo y fechas ISO UTC, y el monto como número", async () => {
        const reserva = buscar(await pedirTodas(), idInvitadoPagado);

        expect(reserva.payments).toHaveLength(2);
        const valido = reserva.payments.find((p) => p.isValid);
        const incorrecto = reserva.payments.find((p) => !p.isValid);

        expect(Object.keys(valido ?? {}).sort()).toEqual(CAMPOS_DEL_PAGO);
        expect(valido).toMatchObject({ amount: 300, refundReason: null, refundedAt: null });
        expect(incorrecto).toMatchObject({ amount: 100, refundReason: "AMOUNT_MISMATCH", refundedAt: null });
        expect(valido?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
      });

      it("deriva depositStatus y refundDue con las reglas de estadoSena", async () => {
        const reservas = await pedirTodas();

        expect(buscar(reservas, idInvitadoPagado)).toMatchObject({
          depositAmount: 300,
          depositStatus: "PAID",
          refundDue: "REQUIRED",
        });
        expect(buscar(reservas, idInvitadoCancelada)).toMatchObject({
          status: "CANCELLED",
          depositStatus: "PAID",
          refundDue: "AT_DISCRETION",
        });
      });

      it("la reserva con cuenta tiene depositStatus nulo, refundDue nulo, usuario y sin pagos", async () => {
        const reserva = buscar(await pedirTodas(), idConCuenta);

        expect(reserva.depositStatus).toBeNull();
        expect(reserva.refundDue).toBeNull();
        expect(reserva.payments).toEqual([]);
        expect(reserva.user).toMatchObject({ email: `vista-admin-${idUsuario}@example.com` });
        expect(reserva.user).not.toHaveProperty("password");
        expect(reserva.user).not.toHaveProperty("passwordHash");
      });

      it("la reserva de invitado tiene usuario nulo y los datos del invitado", async () => {
        const reserva = buscar(await pedirTodas(), idInvitadoPagado);

        expect(reserva.user).toBeNull();
        expect(reserva).toMatchObject({ guestFirstName: "Ana", guestPhone: "5491155551234" });
        expect(reserva.court.name).toBe("Cancha vista admin");
      });

      it("lista una PENDING vencida no barrida con estado EXPIRED", async () => {
        const reserva = buscar(await pedirTodas(), idInvitadoVencida);

        expect(reserva.status).toBe("EXPIRED");
      });

      it("no filtra el hash del token ni la preferencia de pago", async () => {
        const reservas = await pedirTodas();
        const texto = JSON.stringify(reservas);

        expect(buscar(reservas, idInvitadoPagado)).not.toHaveProperty("accessTokenHash");
        expect(buscar(reservas, idInvitadoPagado)).not.toHaveProperty("mpPreferenceId");
        expect(texto).not.toContain(hashDe(idInvitadoPagado));
        expect(texto).not.toContain("preferencia-interna");
      });
    });

    describe("GET /admin/daily (RES-013)", () => {
      it("incluye pagos, depositStatus y refundDue y omite las vencidas y las canceladas", async () => {
        const respuesta = await request(app)
          .get(`/api/v1/bookings/admin/daily?date=${FECHA}`)
          .set(conToken("ADMIN"));

        expect(respuesta.status).toBe(200);
        const reservas = respuesta.body as VistaReserva[];
        const ids = reservas.map((r) => r.id);

        expect(ids).toContain(idInvitadoPagado);
        expect(ids).toContain(idConCuenta);
        expect(ids).not.toContain(idInvitadoVencida);
        expect(ids).not.toContain(idInvitadoCancelada);
        expect(buscar(reservas, idInvitadoPagado)).toMatchObject({
          depositStatus: "PAID",
          refundDue: "REQUIRED",
        });
        expect(buscar(reservas, idInvitadoPagado).payments).toHaveLength(2);
        expect(buscar(reservas, idConCuenta)).toMatchObject({ depositStatus: null, refundDue: null });
        expect(buscar(reservas, idInvitadoPagado)).not.toHaveProperty("accessTokenHash");
      });
    });
  },
);
