import { BookingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { actualizarReservas, buscarReserva, expirarPreferencia } = vi.hoisted(
  () => ({
    actualizarReservas: vi.fn(),
    buscarReserva: vi.fn(),
    expirarPreferencia: vi.fn(),
  }),
);

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    booking: { updateMany: actualizarReservas, findUnique: buscarReserva },
  },
}));

vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  expirarPreferencia,
}));

const {
  invalidarLinkDePago,
  mensajeReservaNoPagable,
  reemplazarPreferenciaVigente,
} = await import("../src/modules/bookings/linkDePago.js");

const CONDICION: Prisma.BookingWhereInput = {
  status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
};

const datos = (idAnterior: string | null) => ({
  idReserva: "reserva-1",
  idAnterior,
  idNueva: "preferencia-nueva",
  condicion: CONDICION,
});

describe("invalidarLinkDePago (PAG-025)", () => {
  beforeEach(() => {
    expirarPreferencia.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("no hace nada si la reserva no tiene preferencia guardada", async () => {
    await invalidarLinkDePago(null);

    expect(expirarPreferencia).not.toHaveBeenCalled();
  });

  it("pide a Mercado Pago que la preferencia expire", async () => {
    expirarPreferencia.mockResolvedValue(undefined);

    await invalidarLinkDePago("preferencia-1");

    expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-1");
  });

  it("registra el error del adaptador y no lo propaga", async () => {
    const error = new Error("Mercado Pago caído");
    expirarPreferencia.mockRejectedValue(error);

    await expect(invalidarLinkDePago("preferencia-1")).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("preferencia-1"),
      error,
    );
  });
});

describe("mensajeReservaNoPagable (PAG-004)", () => {
  it("indica reservar de nuevo para una reserva cancelada", () => {
    expect(mensajeReservaNoPagable("CANCELLED")).toBe(
      "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva.",
    );
  });

  it.each(["COMPLETED", "EXPIRED"] as const)(
    "usa el mensaje general para una reserva %s",
    (estado) => {
      expect(mensajeReservaNoPagable(estado)).toBe(
        "Esta reserva no se puede pagar.",
      );
    },
  );
});

describe("reemplazarPreferenciaVigente (PAG-025)", () => {
  beforeEach(() => {
    actualizarReservas.mockReset();
    buscarReserva.mockReset();
    expirarPreferencia.mockReset();
    expirarPreferencia.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("con 1 fila guarda la preferencia nueva comparando la anterior e invalida la anterior", async () => {
    actualizarReservas.mockResolvedValue({ count: 1 });

    await reemplazarPreferenciaVigente(datos("preferencia-vieja"));

    expect(actualizarReservas).toHaveBeenCalledWith({
      where: {
        id: "reserva-1",
        mpPreferenceId: "preferencia-vieja",
        ...CONDICION,
      },
      data: { mpPreferenceId: "preferencia-nueva" },
    });
    expect(expirarPreferencia).toHaveBeenCalledOnce();
    expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-vieja");
  });

  it("con 1 fila y sin preferencia anterior no llama a Mercado Pago", async () => {
    actualizarReservas.mockResolvedValue({ count: 1 });

    await reemplazarPreferenciaVigente(datos(null));

    expect(actualizarReservas.mock.calls[0][0].where.mpPreferenceId).toBeNull();
    expect(expirarPreferencia).not.toHaveBeenCalled();
  });

  it("con 1 fila entrega la preferencia nueva aunque falle al vencer la anterior", async () => {
    actualizarReservas.mockResolvedValue({ count: 1 });
    expirarPreferencia.mockRejectedValue(new Error("Mercado Pago caído"));

    await expect(
      reemplazarPreferenciaVigente(datos("preferencia-vieja")),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });

  it("con 0 filas invalida la nueva y responde 409 con el mensaje del estado cancelado", async () => {
    actualizarReservas.mockResolvedValue({ count: 0 });
    buscarReserva.mockResolvedValue({ status: "CANCELLED" });

    await expect(
      reemplazarPreferenciaVigente(datos("preferencia-vieja")),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva.",
    });

    expect(expirarPreferencia).toHaveBeenCalledOnce();
    expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-nueva");
  });

  it.each(["PENDING", "CONFIRMED"])(
    "con 0 filas y la reserva %s todavía pagable responde que cambió mientras se generaba el pago",
    async (estado) => {
      actualizarReservas.mockResolvedValue({ count: 0 });
      buscarReserva.mockResolvedValue({ status: estado });

      await expect(
        reemplazarPreferenciaVigente(datos("preferencia-vieja")),
      ).rejects.toMatchObject({
        statusCode: 409,
        message:
          "La reserva cambió mientras se generaba el pago. Intenta de nuevo.",
      });

      expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-nueva");
    },
  );

  it("con 0 filas y la reserva vencida responde con el mensaje general", async () => {
    actualizarReservas.mockResolvedValue({ count: 0 });
    buscarReserva.mockResolvedValue({ status: "EXPIRED" });

    await expect(
      reemplazarPreferenciaVigente(datos(null)),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Esta reserva no se puede pagar.",
    });
  });

  it("con 0 filas y la reserva inexistente responde 404 e invalida la nueva", async () => {
    actualizarReservas.mockResolvedValue({ count: 0 });
    buscarReserva.mockResolvedValue(null);

    await expect(
      reemplazarPreferenciaVigente(datos("preferencia-vieja")),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-nueva");
  });
});
