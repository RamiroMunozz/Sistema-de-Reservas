import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableError } from "../src/core/errors/AppError.js";
import { hashearToken } from "../src/modules/public/tokenAcceso.js";

const {
  eventos,
  buscarCancha,
  buscarComplejo,
  actualizarVarias,
  contarPendientes,
  crearReserva,
  guardarPreferencia,
  transaccionIniciada,
  crearPreferencia,
  verificarMercadoPago,
  expirarPreferencia,
} = vi.hoisted(() => ({
  eventos: [] as string[],
  buscarCancha: vi.fn(),
  buscarComplejo: vi.fn(),
  actualizarVarias: vi.fn(),
  contarPendientes: vi.fn(),
  crearReserva: vi.fn(),
  guardarPreferencia: vi.fn(),
  transaccionIniciada: vi.fn(),
  crearPreferencia: vi.fn(),
  verificarMercadoPago: vi.fn(),
  expirarPreferencia: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => {
  const transaccion = {
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join("?");
      if (sql.includes("pg_advisory_xact_lock")) {
        eventos.push(sql.includes("(2,") ? "bloqueo-telefono" : "bloqueo-cancha");
        void valores;
      }
      return 0;
    },
    booking: {
      updateMany: actualizarVarias,
      count: contarPendientes,
      create: crearReserva,
    },
  };

  return {
    prisma: {
      court: { findUnique: buscarCancha },
      complex: { findUniqueOrThrow: buscarComplejo },
      booking: { update: guardarPreferencia },
      $transaction: async (
        operacion: (tx: typeof transaccion) => Promise<unknown>,
      ) => {
        transaccionIniciada();
        return operacion(transaccion);
      },
    },
  };
});

vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  crearPreferencia,
  obtenerVariableMercadoPago: verificarMercadoPago,
  expirarPreferencia,
  obtenerPago: vi.fn(),
  reembolsarPago: vi.fn(),
}));

// El límite por IP se lee al cargar la app: se sube para que no interfiera aquí.
vi.stubEnv("LIMITE_CREACION_PUBLICA_MAXIMO", "1000");

const { default: app } = await import("../src/app.js");

const RUTA = "/api/v1/public/bookings";
const ID_CANCHA = randomUUID();
const ID_RESERVA = randomUUID();
const INICIO = "2031-03-10T18:00:00.000Z";
const FIN = "2031-03-10T19:00:00.000Z";
const URL_FRONTEND = "https://front.ejemplo.test";
const QUINCE_MINUTOS = 15 * 60 * 1000;

const cuerpo = (cambios: Record<string, unknown> = {}) => ({
  courtId: ID_CANCHA,
  startTime: INICIO,
  endTime: FIN,
  guestFirstName: "Ana",
  guestLastName: "Pérez",
  guestPhone: "+54 9 11 5555-1234",
  ...cambios,
});

const cancha = (cambios: Record<string, unknown> = {}) => ({
  id: ID_CANCHA,
  complexId: randomUUID(),
  name: "Cancha 1",
  sport: "PADEL",
  isActive: true,
  pricePerSlot: new Prisma.Decimal("1000"),
  ...cambios,
});

const datosDeCreacion = () => crearReserva.mock.calls[0][0].data;

describe("POST /public/bookings (RES-023 a RES-025, RES-030 a RES-032, PAG-020)", () => {
  beforeAll(() => {
    vi.stubEnv("FRONTEND_URL", URL_FRONTEND);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    eventos.length = 0;
    for (const simulado of [
      buscarCancha,
      buscarComplejo,
      actualizarVarias,
      contarPendientes,
      crearReserva,
      guardarPreferencia,
      transaccionIniciada,
      crearPreferencia,
      verificarMercadoPago,
      expirarPreferencia,
    ]) {
      simulado.mockReset();
    }
    buscarCancha.mockResolvedValue(cancha());
    buscarComplejo.mockResolvedValue({ depositPercent: 30 });
    actualizarVarias.mockImplementation(
      async (args: { data: { status: string } }) => {
        eventos.push(
          args.data.status === "EXPIRED" ? "liberar" : `estado-${args.data.status}`,
        );
        return { count: 0 };
      },
    );
    contarPendientes.mockImplementation(async () => {
      eventos.push("contar");
      return 0;
    });
    crearReserva.mockImplementation(async () => {
      eventos.push("crear");
      return { id: ID_RESERVA };
    });
    guardarPreferencia.mockResolvedValue({ id: ID_RESERVA });
    crearPreferencia.mockResolvedValue({
      id: "preferencia-1",
      initPoint: "https://mp.ejemplo.test/checkout/preferencia-1",
      sandboxInitPoint: "https://sandbox.mp.ejemplo.test/preferencia-1",
    });
    expirarPreferencia.mockResolvedValue(undefined);
  });

  describe("creación válida (RES-023, RES-025, RES-006, PAG-022)", () => {
    it("responde 201 con token e initPoint, sin Authorization", async () => {
      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.initPoint).toBe(
        "https://mp.ejemplo.test/checkout/preferencia-1",
      );
      expect(respuesta.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Object.keys(respuesta.body).sort()).toEqual(["initPoint", "token"]);
    });

    it("crea la reserva PENDING sin usuario, con el precio de la cancha y la seña", async () => {
      await request(app).post(RUTA).send(cuerpo());

      const datos = datosDeCreacion();

      expect(datos.status).toBe("PENDING");
      expect(datos.userId).toBeUndefined();
      expect(datos.courtId).toBe(ID_CANCHA);
      expect(datos.startTime).toEqual(new Date(INICIO));
      expect(datos.endTime).toEqual(new Date(FIN));
      expect(datos.totalPrice.toFixed(2)).toBe("1000.00");
      expect(datos.depositAmount.toFixed(2)).toBe("300.00");
    });

    it("guarda los datos del invitado con el teléfono normalizado", async () => {
      await request(app)
        .post(RUTA)
        .send(cuerpo({ guestFirstName: "  Ana ", guestEmail: "ana@ejemplo.test" }));

      const datos = datosDeCreacion();

      expect(datos.guestFirstName).toBe("Ana");
      expect(datos.guestLastName).toBe("Pérez");
      expect(datos.guestPhone).toBe("5491155551234");
      expect(datos.guestEmail).toBe("ana@ejemplo.test");
    });

    it("persiste el hash del token y nunca el token en claro (RES-025)", async () => {
      const respuesta = await request(app).post(RUTA).send(cuerpo());

      const datos = datosDeCreacion();

      expect(datos.accessTokenHash).toBe(hashearToken(respuesta.body.token));
      expect(JSON.stringify(crearReserva.mock.calls)).not.toContain(
        respuesta.body.token,
      );
      expect(JSON.stringify(guardarPreferencia.mock.calls)).not.toContain(
        respuesta.body.token,
      );
    });

    it("fija expiresAt 15 minutos después de la creación", async () => {
      const antes = Date.now();
      await request(app).post(RUTA).send(cuerpo());
      const despues = Date.now();

      const vence = (datosDeCreacion().expiresAt as Date).getTime();

      expect(vence).toBeGreaterThanOrEqual(antes + QUINCE_MINUTOS);
      expect(vence).toBeLessThanOrEqual(despues + QUINCE_MINUTOS);
    });

    it("usa el porcentaje del complejo de la cancha y redondea la mitad hacia arriba", async () => {
      buscarCancha.mockResolvedValue(
        cancha({ pricePerSlot: new Prisma.Decimal("10.05") }),
      );
      buscarComplejo.mockResolvedValue({ depositPercent: 33 });

      await request(app).post(RUTA).send(cuerpo());

      expect(datosDeCreacion().depositAmount.toFixed(2)).toBe("3.32");
    });

    it("con depositPercent 100 la seña es el precio total", async () => {
      buscarComplejo.mockResolvedValue({ depositPercent: 100 });

      await request(app).post(RUTA).send(cuerpo());

      expect(datosDeCreacion().depositAmount.toFixed(2)).toBe("1000.00");
    });

    it("guarda en la reserva el id de la preferencia vigente", async () => {
      await request(app).post(RUTA).send(cuerpo());

      expect(guardarPreferencia).toHaveBeenCalledWith({
        where: { id: ID_RESERVA },
        data: { mpPreferenceId: "preferencia-1" },
      });
    });
  });

  describe("preferencia de seña (PAG-020)", () => {
    it("cobra la seña de la base, vence con la reserva y vuelve a /reserva/<token>", async () => {
      const respuesta = await request(app)
        .post(RUTA)
        .send(cuerpo({ guestEmail: "ana@ejemplo.test" }));

      const datos = crearPreferencia.mock.calls[0][0];

      expect(datos.idReserva).toBe(ID_RESERVA);
      expect(datos.titulo).toBe("Seña - Cancha 1");
      expect(datos.monto).toBe(300);
      expect(datos.venceEn).toEqual(datosDeCreacion().expiresAt);
      expect(datos.urlRetorno).toBe(
        `${URL_FRONTEND}/reserva/${respuesta.body.token}`,
      );
      expect(datos.emailPagador).toBe("ana@ejemplo.test");
    });

    it("no envía el correo del pagador si el invitado no lo dio", async () => {
      await request(app).post(RUTA).send(cuerpo());

      expect(crearPreferencia.mock.calls[0][0].emailPagador).toBeUndefined();
    });
  });

  describe("validación (RES-023, RES-024)", () => {
    it("responde 400 con errors ante datos inválidos y no escribe", async () => {
      const respuesta = await request(app)
        .post(RUTA)
        .send(cuerpo({ guestPhone: "abc", guestLastName: "  " }));

      expect(respuesta.status).toBe(400);
      expect(
        respuesta.body.errors.map((e: { field: string }) => e.field).sort(),
      ).toEqual(["guestLastName", "guestPhone"]);
      expect(transaccionIniciada).not.toHaveBeenCalled();
      expect(crearPreferencia).not.toHaveBeenCalled();
    });

    it("responde 400 si la cancha está inactiva", async () => {
      buscarCancha.mockResolvedValue(cancha({ isActive: false }));

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe("La cancha no está disponible.");
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("responde 400 si el turno ya pasó", async () => {
      const respuesta = await request(app)
        .post(RUTA)
        .send(
          cuerpo({
            startTime: "2020-03-10T18:00:00.000Z",
            endTime: "2020-03-10T19:00:00.000Z",
          }),
        );

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe("No se puede reservar un turno pasado.");
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("responde 400 si la cancha no existe", async () => {
      buscarCancha.mockResolvedValue(null);

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBe(400);
      expect(crearReserva).not.toHaveBeenCalled();
    });
  });

  describe("solapamiento y orden del bloqueo (RES-007, RES-025, RES-026, RES-031)", () => {
    it("responde 409 ante un solapamiento y no pide la preferencia", async () => {
      crearReserva.mockRejectedValue(
        new Error('violates exclusion constraint "bookings_sin_solapamiento"'),
      );

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.detail).toBe("El turno seleccionado ya fue reservado.");
      expect(crearPreferencia).not.toHaveBeenCalled();
    });

    it("dentro del bloqueo: libera vencidas, bloquea el teléfono, cuenta y crea, en ese orden", async () => {
      await request(app).post(RUTA).send(cuerpo());

      expect(eventos).toEqual([
        "bloqueo-cancha",
        "liberar",
        "bloqueo-telefono",
        "contar",
        "crear",
      ]);
    });

    it("libera las vencidas de la cancha pedida", async () => {
      await request(app).post(RUTA).send(cuerpo());

      expect(actualizarVarias.mock.calls[0][0].where.courtId).toBe(ID_CANCHA);
      expect(actualizarVarias.mock.calls[0][0].data).toEqual({ status: "EXPIRED" });
    });

    it("responde 429 con el mensaje del diseño si el teléfono alcanzó el tope", async () => {
      contarPendientes.mockResolvedValue(2);

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBe(429);
      expect(respuesta.body.detail).toBe(
        "Este teléfono ya tiene reservas pendientes de pago. Completa el pago o espera a que venzan.",
      );
      expect(crearReserva).not.toHaveBeenCalled();
      expect(crearPreferencia).not.toHaveBeenCalled();
    });

    it("cuenta con el teléfono normalizado", async () => {
      await request(app).post(RUTA).send(cuerpo());

      expect(contarPendientes.mock.calls[0][0].where.guestPhone).toBe(
        "5491155551234",
      );
    });
  });

  describe("Mercado Pago sin configurar (PAG-007, RES-032)", () => {
    it("responde 503 antes de escribir cualquier cosa", async () => {
      verificarMercadoPago.mockImplementation(() => {
        throw new ServiceUnavailableError(
          "Los pagos con Mercado Pago no están configurados.",
        );
      });

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBe(503);
      expect(respuesta.body.detail).toBe(
        "Los pagos con Mercado Pago no están configurados.",
      );
      expect(transaccionIniciada).not.toHaveBeenCalled();
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("verifica las dos variables que exige la preferencia", async () => {
      await request(app).post(RUTA).send(cuerpo());

      expect(verificarMercadoPago.mock.calls.map((c) => c[0])).toEqual([
        "MERCADOPAGO_ACCESS_TOKEN",
        "MERCADOPAGO_WEBHOOK_SECRET",
      ]);
    });
  });

  describe("compensación ante una falla de Mercado Pago (RES-032, PAG-020)", () => {
    it("si crearPreferencia falla, cancela la reserva bajo el bloqueo y responde 5xx sin token ni detalle", async () => {
      crearPreferencia.mockRejectedValue(
        new Error("secreto interno: access_token=APP_USR-123"),
      );

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBeGreaterThanOrEqual(500);
      expect(respuesta.status).toBeLessThan(600);
      expect(JSON.stringify(respuesta.body)).not.toContain("token");
      expect(JSON.stringify(respuesta.body)).not.toContain("APP_USR");
      expect(eventos.slice(-2)).toEqual(["bloqueo-cancha", "estado-CANCELLED"]);
      expect(actualizarVarias).toHaveBeenLastCalledWith({
        where: { id: ID_RESERVA, status: "PENDING" },
        data: { status: "CANCELLED", depositPaidAtCancel: false },
      });
      expect(guardarPreferencia).not.toHaveBeenCalled();
    });

    it("no invalida ninguna preferencia si nunca llegó a crearse", async () => {
      crearPreferencia.mockRejectedValue(new Error("falla"));

      await request(app).post(RUTA).send(cuerpo());

      expect(expirarPreferencia).not.toHaveBeenCalled();
    });

    it("si Mercado Pago no está configurado al crear la preferencia, responde 503 y cancela", async () => {
      crearPreferencia.mockRejectedValue(
        new ServiceUnavailableError(
          "Los pagos con Mercado Pago no están configurados.",
        ),
      );

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBe(503);
      expect(eventos.at(-1)).toBe("estado-CANCELLED");
    });

    it("si Mercado Pago no devuelve el id o el initPoint, cancela y responde 5xx", async () => {
      crearPreferencia.mockResolvedValue({
        id: undefined,
        initPoint: undefined,
        sandboxInitPoint: undefined,
      });

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(respuesta.body)).not.toContain("token");
      expect(eventos.at(-1)).toBe("estado-CANCELLED");
    });

    it("si falla guardar la preferencia, cancela, invalida el link creado y responde 5xx", async () => {
      guardarPreferencia.mockRejectedValue(new Error("base caída"));

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBeGreaterThanOrEqual(500);
      expect(eventos.at(-1)).toBe("estado-CANCELLED");
      expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-1");
    });

    it("si la compensación también falla, responde igual con el error original y lo registra", async () => {
      crearPreferencia.mockRejectedValue(new Error("falla de Mercado Pago"));
      actualizarVarias.mockImplementation(
        async (args: { data: { status: string } }) => {
          if (args.data.status === "CANCELLED") {
            throw new Error("base caída");
          }
          return { count: 0 };
        },
      );

      const respuesta = await request(app).post(RUTA).send(cuerpo());

      expect(respuesta.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(respuesta.body)).not.toContain("token");
      expect(console.error).toHaveBeenCalled();
    });
  });
});
