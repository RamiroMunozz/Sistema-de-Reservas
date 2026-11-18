import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  crearConfiguracion,
  crearPref,
  obtenerPref,
  actualizarPref,
  obtenerPagoMp,
  crearReembolso,
} = vi.hoisted(() => ({
  crearConfiguracion: vi.fn(),
  crearPref: vi.fn(),
  obtenerPref: vi.fn(),
  actualizarPref: vi.fn(),
  obtenerPagoMp: vi.fn(),
  crearReembolso: vi.fn(),
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {
    constructor(opciones: { accessToken: string }) {
      crearConfiguracion(opciones);
    }
  },
  Preference: class {
    create = crearPref;
    get = obtenerPref;
    update = actualizarPref;
  },
  Payment: class {
    get = obtenerPagoMp;
  },
  PaymentRefund: class {
    create = crearReembolso;
  },
}));

const {
  crearPreferencia,
  expirarPreferencia,
  obtenerPago,
  reembolsarPago,
} = await import("../src/core/integraciones/mercadoPago.js");

const AHORA = new Date("2026-12-01T12:00:00.000Z");

const datosBase = {
  idReserva: "reserva-1",
  titulo: "Reserva - Cancha 1",
  descripcion: "Turno para deporte: PADEL",
  monto: 1000,
  urlRetorno: "https://reservas.ejemplo.test/mis-reservas",
};

describe("Adaptador de Mercado Pago", () => {
  beforeAll(() => {
    vi.stubEnv("BACKEND_URL", "https://api.ejemplo.test");
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token_de_prueba");
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "secreto_webhook_de_prueba");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    for (const simulado of [
      crearConfiguracion,
      crearPref,
      obtenerPref,
      actualizarPref,
      obtenerPagoMp,
      crearReembolso,
    ]) {
      simulado.mockReset();
    }
    crearPref.mockResolvedValue({
      id: "preferencia-1",
      init_point: "https://mp.test/pago",
      sandbox_init_point: "https://mp.test/sandbox",
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
  });

  describe("crearPreferencia", () => {
    it("arma el ítem, la referencia, las URLs y no envía auto_return", async () => {
      const resultado = await crearPreferencia({
        ...datosBase,
        emailPagador: "dueno@example.com",
      });

      expect(crearConfiguracion).toHaveBeenCalledWith({
        accessToken: "token_de_prueba",
      });
      const cuerpo = crearPref.mock.calls[0][0].body;
      expect(cuerpo.items).toEqual([
        {
          id: "reserva-1",
          title: "Reserva - Cancha 1",
          description: "Turno para deporte: PADEL",
          quantity: 1,
          unit_price: 1000,
          currency_id: "ARS",
        },
      ]);
      expect(cuerpo.external_reference).toBe("reserva-1");
      expect(cuerpo.payer).toEqual({ email: "dueno@example.com" });
      expect(cuerpo.back_urls).toEqual({
        success: datosBase.urlRetorno,
        failure: datosBase.urlRetorno,
        pending: datosBase.urlRetorno,
      });
      expect(cuerpo).not.toHaveProperty("auto_return");
      expect(cuerpo.notification_url).toBe(
        "https://api.ejemplo.test/api/v1/payments/webhook?source_news=webhooks",
      );
      expect(resultado).toEqual({
        id: "preferencia-1",
        initPoint: "https://mp.test/pago",
        sandboxInitPoint: "https://mp.test/sandbox",
      });
    });

    it("no envía datos de vencimiento ni pagador sin venceEn ni correo", async () => {
      await crearPreferencia(datosBase);

      const cuerpo = crearPref.mock.calls[0][0].body;
      expect(cuerpo).not.toHaveProperty("expires");
      expect(cuerpo).not.toHaveProperty("expiration_date_from");
      expect(cuerpo).not.toHaveProperty("expiration_date_to");
      expect(cuerpo.payer).toBeUndefined();
    });

    it("con venceEn envía expires y expiration_date_to, pero nunca expiration_date_from", async () => {
      const venceEn = new Date("2026-12-01T12:15:00.000Z");

      await crearPreferencia({ ...datosBase, venceEn });

      const cuerpo = crearPref.mock.calls[0][0].body;
      expect(cuerpo.expires).toBe(true);
      expect(cuerpo.expiration_date_to).toBe("2026-12-01T12:15:00.000Z");
      expect(cuerpo).not.toHaveProperty("expiration_date_from");
    });
  });

  describe("expirarPreferencia", () => {
    it("lee la preferencia y la actualiza reenviando los ítems para que expire ahora", async () => {
      const items = [{ id: "reserva-1", title: "Reserva", quantity: 1, unit_price: 1000 }];
      obtenerPref.mockResolvedValue({ id: "preferencia-1", items });
      actualizarPref.mockResolvedValue({});

      await expirarPreferencia("preferencia-1");

      expect(obtenerPref).toHaveBeenCalledWith({ preferenceId: "preferencia-1" });
      expect(actualizarPref).toHaveBeenCalledWith({
        id: "preferencia-1",
        updatePreferenceRequest: {
          items,
          expires: true,
          expiration_date_to: AHORA.toISOString(),
        },
      });
    });

    it("propaga el error de Mercado Pago al leer la preferencia", async () => {
      obtenerPref.mockRejectedValue(new Error("falla de red"));

      await expect(expirarPreferencia("preferencia-1")).rejects.toThrow(
        "falla de red",
      );
      expect(actualizarPref).not.toHaveBeenCalled();
    });
  });

  describe("obtenerPago", () => {
    it("consulta el pago por su id", async () => {
      const pago = { id: 123, status: "approved", transaction_amount: 1000 };
      obtenerPagoMp.mockResolvedValue(pago);

      const resultado = await obtenerPago("123");

      expect(obtenerPagoMp).toHaveBeenCalledWith({ id: "123" });
      expect(resultado).toBe(pago);
    });
  });

  describe("reembolsarPago", () => {
    it("crea el reembolso sin monto y con la clave de idempotencia", async () => {
      crearReembolso.mockResolvedValue({ id: 1 });

      await reembolsarPago("123", "reembolso-abc");

      expect(crearReembolso).toHaveBeenCalledOnce();
      expect(crearReembolso).toHaveBeenCalledWith({
        payment_id: "123",
        requestOptions: { idempotencyKey: "reembolso-abc" },
      });
      expect(crearReembolso.mock.calls[0][0]).not.toHaveProperty("body");
    });

    it("propaga el error de Mercado Pago", async () => {
      crearReembolso.mockRejectedValue(new Error("rechazado"));

      await expect(reembolsarPago("123", "reembolso-abc")).rejects.toThrow(
        "rechazado",
      );
    });
  });

  describe("sin credenciales (PAG-007)", () => {
    const sinAccessToken = () => vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "");
    const conAccessToken = () =>
      vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token_de_prueba");

    it.each([
      ["crearPreferencia", () => crearPreferencia(datosBase)],
      ["expirarPreferencia", () => expirarPreferencia("preferencia-1")],
      ["obtenerPago", () => obtenerPago("123")],
      ["reembolsarPago", () => reembolsarPago("123", "clave")],
    ])("%s responde 503 sin MERCADOPAGO_ACCESS_TOKEN", async (_nombre, accion) => {
      sinAccessToken();

      try {
        await expect(accion()).rejects.toMatchObject({
          statusCode: 503,
          message: "Los pagos con Mercado Pago no están configurados.",
        });
      } finally {
        conAccessToken();
      }

      expect(crearPref).not.toHaveBeenCalled();
      expect(obtenerPref).not.toHaveBeenCalled();
      expect(obtenerPagoMp).not.toHaveBeenCalled();
      expect(crearReembolso).not.toHaveBeenCalled();
    });

    it("crearPreferencia responde 503 sin MERCADOPAGO_WEBHOOK_SECRET", async () => {
      vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");

      try {
        await expect(crearPreferencia(datosBase)).rejects.toMatchObject({
          statusCode: 503,
        });
      } finally {
        vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "secreto_webhook_de_prueba");
      }

      expect(crearPref).not.toHaveBeenCalled();
    });

    it("crearPreferencia falla sin BACKEND_URL y no genera el cobro", async () => {
      vi.stubEnv("BACKEND_URL", "");

      try {
        await expect(crearPreferencia(datosBase)).rejects.toThrow(
          "BACKEND_URL no está definido.",
        );
      } finally {
        vi.stubEnv("BACKEND_URL", "https://api.ejemplo.test");
      }

      expect(crearPref).not.toHaveBeenCalled();
    });
  });
});
