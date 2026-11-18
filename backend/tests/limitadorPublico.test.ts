import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { eventos, contarPendientes } = vi.hoisted(() => ({
  eventos: [] as string[],
  contarPendientes: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => {
  const transaccion = {
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      eventos.push(`sql:${partes.join("?")}:${valores.join(",")}`);
      return 0;
    },
    booking: { count: contarPendientes },
  };

  return {
    prisma: {
      $transaction: async (
        operacion: (tx: typeof transaccion) => Promise<unknown>,
      ) => operacion(transaccion),
    },
  };
});

const cargarLimitadores = async (entorno: Record<string, string>) => {
  vi.resetModules();
  for (const [nombre, valor] of Object.entries(entorno)) {
    vi.stubEnv(nombre, valor);
  }
  // Mismo registro de módulos que los limitadores: así comparten la clase AppError.
  const { errorHandler } = await import(
    "../src/core/middlewares/errorHandler.js"
  );
  const limitadores = await import("../src/core/middlewares/limitadorPublico.js");
  return { ...limitadores, errorHandler };
};

const montar = (
  middleware: express.RequestHandler,
  errorHandler: express.ErrorRequestHandler,
  confianzaProxy: number | false = false,
) => {
  const app = express();
  app.set("trust proxy", confianzaProxy);
  app.post("/ruta", middleware, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return app;
};

const repetir = async (
  app: express.Express,
  veces: number,
  cabecera?: (indice: number) => string,
) => {
  const estados: number[] = [];
  for (let indice = 0; indice < veces; indice += 1) {
    const pedido = request(app).post("/ruta");
    if (cabecera) {
      pedido.set("X-Forwarded-For", cabecera(indice));
    }
    estados.push((await pedido).status);
  }
  return estados;
};

describe("limitadores públicos (RES-030)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("limitadorCreacionPublica: con el máximo por defecto la solicitud 11 responde 429", async () => {
    const { limitadorCreacionPublica, errorHandler } = await cargarLimitadores({});
    const estados = await repetir(montar(limitadorCreacionPublica, errorHandler), 11);

    expect(estados.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(estados[10]).toBe(429);
  });

  it("limitadorCreacionPublica: el 429 lleva el mensaje del límite", async () => {
    const { limitadorCreacionPublica, errorHandler } = await cargarLimitadores({
      LIMITE_CREACION_PUBLICA_MAXIMO: "1",
    });
    const app = montar(limitadorCreacionPublica, errorHandler);

    await request(app).post("/ruta");
    const respuesta = await request(app).post("/ruta");

    expect(respuesta.status).toBe(429);
    expect(respuesta.body.detail).toBe(
      "Demasiadas solicitudes. Intenta de nuevo más tarde.",
    );
  });

  it("limitadorCreacionPublica: lee el máximo de LIMITE_CREACION_PUBLICA_MAXIMO", async () => {
    const { limitadorCreacionPublica, errorHandler } = await cargarLimitadores({
      LIMITE_CREACION_PUBLICA_MAXIMO: "3",
    });
    const estados = await repetir(montar(limitadorCreacionPublica, errorHandler), 4);

    expect(estados).toEqual([200, 200, 200, 429]);
  });

  it("limitadorCreacionPublica: cuenta también las solicitudes rechazadas aguas abajo", async () => {
    const { limitadorCreacionPublica, errorHandler } = await cargarLimitadores({
      LIMITE_CREACION_PUBLICA_MAXIMO: "2",
    });
    const app = express();
    app.post("/ruta", limitadorCreacionPublica, (_req, res) => {
      res.status(400).json({ ok: false });
    });
    app.use(errorHandler);

    const estados: number[] = [];
    for (let indice = 0; indice < 3; indice += 1) {
      estados.push((await request(app).post("/ruta")).status);
    }

    expect(estados).toEqual([400, 400, 429]);
  });

  it("limitadorConsultaPublica: aplica su propio máximo, más permisivo por defecto", async () => {
    const { limitadorConsultaPublica, errorHandler } = await cargarLimitadores({});
    const estados = await repetir(montar(limitadorConsultaPublica, errorHandler), 61);

    expect(estados.slice(0, 60)).toEqual(Array(60).fill(200));
    expect(estados[60]).toBe(429);
  });

  it("limitadorConsultaPublica: lee el máximo de LIMITE_CONSULTA_PUBLICA_MAXIMO", async () => {
    const { limitadorConsultaPublica, errorHandler } = await cargarLimitadores({
      LIMITE_CONSULTA_PUBLICA_MAXIMO: "2",
    });
    const estados = await repetir(montar(limitadorConsultaPublica, errorHandler), 3);

    expect(estados).toEqual([200, 200, 429]);
  });

  it("los dos limitadores llevan contadores separados", async () => {
    const { limitadorCreacionPublica, limitadorConsultaPublica, errorHandler } =
      await cargarLimitadores({ LIMITE_CREACION_PUBLICA_MAXIMO: "1" });
    const creacion = montar(limitadorCreacionPublica, errorHandler);
    const consulta = montar(limitadorConsultaPublica, errorHandler);

    await request(creacion).post("/ruta");

    expect((await request(creacion).post("/ruta")).status).toBe(429);
    expect((await request(consulta).post("/ruta")).status).toBe(200);
  });

  it("una cabecera X-Forwarded-For falsificada no elude el límite sin proxy de confianza", async () => {
    const { limitadorCreacionPublica, errorHandler } = await cargarLimitadores({
      LIMITE_CREACION_PUBLICA_MAXIMO: "2",
    });
    const estados = await repetir(
      montar(limitadorCreacionPublica, errorHandler, false),
      3,
      (indice) => `203.0.113.${indice + 1}`,
    );

    expect(estados).toEqual([200, 200, 429]);
  });

  it("con un salto de proxy de confianza, cada IP del cliente lleva su contador", async () => {
    const { limitadorCreacionPublica, errorHandler } = await cargarLimitadores({
      LIMITE_CREACION_PUBLICA_MAXIMO: "1",
    });
    const app = montar(limitadorCreacionPublica, errorHandler, 1);
    const desde = async (ip: string) =>
      (await request(app).post("/ruta").set("X-Forwarded-For", ip)).status;

    expect(await desde("198.51.100.1")).toBe(200);
    expect(await desde("198.51.100.1")).toBe(429);
    expect(await desde("198.51.100.2")).toBe(200);
  });
});

describe("bloquearTelefono y tope por teléfono (RES-031)", () => {
  beforeEach(() => {
    eventos.length = 0;
    contarPendientes.mockReset();
    contarPendientes.mockImplementation(async () => {
      eventos.push("contar");
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const ejecutar = async (telefono: string) => {
    const { conBloqueoDeCancha, bloquearTelefono } = await import(
      "../src/modules/bookings/bloqueoCancha.js"
    );
    return conBloqueoDeCancha("cancha-1", (tx) =>
      bloquearTelefono(tx, telefono),
    );
  };

  it("toma pg_advisory_xact_lock(2, hashtext(telefono)) después del bloqueo de cancha", async () => {
    await ejecutar("5491155551234");

    const bloqueos = eventos.filter((e) => e.includes("pg_advisory_xact_lock"));

    expect(bloqueos).toHaveLength(2);
    expect(bloqueos[0]).toContain("pg_advisory_xact_lock(hashtext(?))");
    expect(bloqueos[0]).toContain("cancha-1");
    expect(bloqueos[1]).toContain("pg_advisory_xact_lock(2, hashtext(?))");
    expect(bloqueos[1]).toContain("5491155551234");
  });

  it("cuenta las PENDING vigentes del teléfono después de tomar el bloqueo", async () => {
    await ejecutar("5491155551234");

    const indiceBloqueo = eventos.findIndex((e) =>
      e.includes("pg_advisory_xact_lock(2,"),
    );
    const indiceConteo = eventos.indexOf("contar");

    expect(indiceBloqueo).toBeGreaterThan(-1);
    expect(indiceConteo).toBeGreaterThan(indiceBloqueo);
  });

  it("solo cuenta las PENDING no vencidas del mismo teléfono", async () => {
    await ejecutar("5491155551234");

    const { where } = contarPendientes.mock.calls[0][0];

    expect(where.guestPhone).toBe("5491155551234");
    expect(where.status).toBe("PENDING");
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("con 2 PENDING vigentes (tope por defecto) responde 429 con el mensaje del diseño", async () => {
    contarPendientes.mockResolvedValue(2);

    await expect(ejecutar("5491155551234")).rejects.toMatchObject({
      statusCode: 429,
      message:
        "Este teléfono ya tiene reservas pendientes de pago. Completa el pago o espera a que venzan.",
    });
  });

  it("con 1 PENDING vigente no supera el tope", async () => {
    contarPendientes.mockResolvedValue(1);

    await expect(ejecutar("5491155551234")).resolves.toBeUndefined();
  });

  it("lee el tope de TOPE_PENDIENTES_POR_TELEFONO", async () => {
    vi.stubEnv("TOPE_PENDIENTES_POR_TELEFONO", "3");
    contarPendientes.mockResolvedValue(2);

    await expect(ejecutar("5491155551234")).resolves.toBeUndefined();

    contarPendientes.mockResolvedValue(3);

    await expect(ejecutar("5491155551234")).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("usa el tope por defecto si la variable no es un entero positivo", async () => {
    vi.stubEnv("TOPE_PENDIENTES_POR_TELEFONO", "abc");
    contarPendientes.mockResolvedValue(2);

    await expect(ejecutar("5491155551234")).rejects.toMatchObject({
      statusCode: 429,
    });
  });
});
