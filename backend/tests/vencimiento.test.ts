import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { liberarReservasVencidas } from "../src/modules/bookings/vencimiento.js";

const AHORA = new Date("2031-03-10T12:00:00.000Z");

const crearTransaccion = (cantidad: number) => {
  const actualizarVarias = vi.fn().mockResolvedValue({ count: cantidad });
  const transaccion = {
    booking: { updateMany: actualizarVarias },
  } as unknown as Prisma.TransactionClient;
  return { transaccion, actualizarVarias };
};

describe("liberarReservasVencidas (RES-026)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pasa a EXPIRED las PENDING vencidas de la cancha", async () => {
    const { transaccion, actualizarVarias } = crearTransaccion(2);

    const cantidad = await liberarReservasVencidas(transaccion, "cancha-1");

    expect(actualizarVarias).toHaveBeenCalledTimes(1);
    expect(actualizarVarias).toHaveBeenCalledWith({
      where: {
        courtId: "cancha-1",
        status: BookingStatus.PENDING,
        expiresAt: { lte: AHORA },
      },
      data: { status: BookingStatus.EXPIRED },
    });
    expect(cantidad).toBe(2);
  });

  it("filtra por la cancha indicada y no por otra", async () => {
    const { transaccion, actualizarVarias } = crearTransaccion(0);

    const cantidad = await liberarReservasVencidas(transaccion, "cancha-2");

    expect(actualizarVarias.mock.calls[0]?.[0].where.courtId).toBe("cancha-2");
    expect(cantidad).toBe(0);
  });

  it("usa la fecha indicada como instante de vencimiento", async () => {
    const { transaccion, actualizarVarias } = crearTransaccion(1);
    const otroInstante = new Date("2031-04-01T00:00:00.000Z");

    await liberarReservasVencidas(transaccion, "cancha-1", otroInstante);

    expect(actualizarVarias.mock.calls[0]?.[0].where.expiresAt).toEqual({
      lte: otroInstante,
    });
  });
});
