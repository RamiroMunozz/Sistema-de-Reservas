import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelarEnTransaccion } from "../src/modules/bookings/cancelacionReserva.js";

const ID_RESERVA = "reserva-1";

const marcarPagos = vi.fn();
const actualizarReserva = vi.fn();

const transaccion = {
  bookingPayment: { updateMany: marcarPagos },
  booking: { update: actualizarReserva },
} as unknown as Prisma.TransactionClient;

describe("cancelarEnTransaccion (PAG-026, RES-011)", () => {
  beforeEach(() => {
    marcarPagos.mockReset();
    actualizarReserva.mockReset();
    actualizarReserva.mockResolvedValue({ id: ID_RESERVA, status: "CANCELLED" });
  });

  it("marca OWNER_DISCRETION solo en los pagos válidos sin reembolso", async () => {
    marcarPagos.mockResolvedValue({ count: 1 });

    await cancelarEnTransaccion(transaccion, ID_RESERVA);

    expect(marcarPagos).toHaveBeenCalledWith({
      where: { bookingId: ID_RESERVA, isValid: true, refundedAt: null },
      data: { refundReason: "OWNER_DISCRETION" },
    });
  });

  it("con un pago válido guarda depositPaidAtCancel verdadero y pone CANCELLED", async () => {
    marcarPagos.mockResolvedValue({ count: 1 });

    const resultado = await cancelarEnTransaccion(transaccion, ID_RESERVA);

    expect(resultado).toEqual({ depositPaidAtCancel: true });
    expect(actualizarReserva).toHaveBeenCalledWith({
      where: { id: ID_RESERVA },
      data: { status: "CANCELLED", depositPaidAtCancel: true },
    });
  });

  it("sin pago válido guarda depositPaidAtCancel falso y pone CANCELLED", async () => {
    marcarPagos.mockResolvedValue({ count: 0 });

    const resultado = await cancelarEnTransaccion(transaccion, ID_RESERVA);

    expect(resultado).toEqual({ depositPaidAtCancel: false });
    expect(actualizarReserva).toHaveBeenCalledWith({
      where: { id: ID_RESERVA },
      data: { status: "CANCELLED", depositPaidAtCancel: false },
    });
  });

  it("marca los pagos antes de cancelar la reserva", async () => {
    const orden: string[] = [];
    marcarPagos.mockImplementation(async () => {
      orden.push("pagos");
      return { count: 0 };
    });
    actualizarReserva.mockImplementation(async () => {
      orden.push("reserva");
      return {};
    });

    await cancelarEnTransaccion(transaccion, ID_RESERVA);

    expect(orden).toEqual(["pagos", "reserva"]);
  });
});
