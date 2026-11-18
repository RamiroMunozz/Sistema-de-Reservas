import { BookingStatus, RefundReason } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/**
 * Pasa la reserva a CANCELLED dentro de la transacción de quien la cancela
 * (jugador, administrador o token del invitado). No llama a Mercado Pago: el link
 * de pago se invalida después del commit (decisión 6, PAG-025).
 */
export const cancelarEnTransaccion = async (
  transaccion: Prisma.TransactionClient,
  idReserva: string,
): Promise<{ depositPaidAtCancel: boolean }> => {
  // El pago válido no reembolsado queda a criterio del canchero (DP-11).
  const marcados = await transaccion.bookingPayment.updateMany({
    where: { bookingId: idReserva, isValid: true, refundedAt: null },
    data: { refundReason: RefundReason.OWNER_DISCRETION },
  });
  const depositPaidAtCancel = marcados.count > 0;

  await transaccion.booking.update({
    where: { id: idReserva },
    data: { status: BookingStatus.CANCELLED, depositPaidAtCancel },
  });

  return { depositPaidAtCancel };
};
