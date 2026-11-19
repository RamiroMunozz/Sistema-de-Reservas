import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { eventos, buscarCancha, liberarVencidas, crearReserva } = vi.hoisted(
  () => ({
    eventos: [] as string[],
    buscarCancha: vi.fn(),
    liberarVencidas: vi.fn(),
    crearReserva: vi.fn(),
  }),
);

vi.mock("../src/core/config/prisma.js", () => {
  const transaccion = {
    $executeRaw: async (partes: TemplateStringsArray) => {
      if (partes.join("?").includes("pg_advisory_xact_lock")) {
        eventos.push("bloqueo-cancha");
      }
      return 0;
    },
    booking: {
      updateMany: liberarVencidas,
      create: crearReserva,
    },
  };

  return {
    prisma: {
      court: { findUnique: buscarCancha },
      $transaction: (operacion: (tx: typeof transaccion) => Promise<unknown>) =>
        operacion(transaccion),
    },
  };
});

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const ID_USUARIO = randomUUID();
const ID_CANCHA = randomUUID();

const conToken = (rol: "USER" | "ADMIN") => ({
  Authorization: `Bearer ${jwt.sign({ userId: ID_USUARIO, role: rol }, SECRETO_DE_PRUEBA)}`,
});

const enDias = (dias: number, hora: number) => {
  const fecha = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  fecha.setUTCHours(hora, 0, 0, 0);
  return fecha.toISOString();
};

const cuerpo = () => ({
  courtId: ID_CANCHA,
  startTime: enDias(10, 10),
  endTime: enDias(10, 11),
  paymentMethod: "CASH",
});

describe("Creación de reservas con cuenta: libera las vencidas bajo el bloqueo (RES-007, RES-026)", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    eventos.length = 0;
    for (const simulado of [buscarCancha, liberarVencidas, crearReserva]) {
      simulado.mockReset();
    }
    buscarCancha.mockResolvedValue({
      id: ID_CANCHA,
      isActive: true,
      pricePerSlot: 1000,
    });
    liberarVencidas.mockImplementation(async () => {
      eventos.push("liberar");
      return { count: 0 };
    });
    crearReserva.mockImplementation(async () => {
      eventos.push("crear");
      return { id: randomUUID(), status: "CONFIRMED" };
    });
  });

  it("POST /bookings: bloquea la cancha, libera las vencidas y recién entonces crea", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bookings")
      .set(conToken("USER"))
      .send(cuerpo());

    expect(respuesta.status).toBe(201);
    expect(eventos).toEqual(["bloqueo-cancha", "liberar", "crear"]);
    expect(liberarVencidas.mock.calls[0][0].where.courtId).toBe(ID_CANCHA);
  });

  it("POST /bookings/admin/create: bloquea la cancha, libera las vencidas y recién entonces crea", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bookings/admin/create")
      .set(conToken("ADMIN"))
      .send(cuerpo());

    expect(respuesta.status).toBe(201);
    expect(eventos).toEqual(["bloqueo-cancha", "liberar", "crear"]);
    expect(liberarVencidas.mock.calls[0][0].where.courtId).toBe(ID_CANCHA);
  });
});
