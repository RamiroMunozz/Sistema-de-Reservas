import { BookingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import { ConflictError, NotFoundError } from "../../core/errors/AppError.js";
import { expirarPreferencia } from "../../core/integraciones/mercadoPago.js";

/**
 * Mensaje del 409 cuando una reserva no se puede pagar (PAG-004). Una reserva
 * cancelada nunca se reactiva: para pagar hay que reservar de nuevo.
 */
export const mensajeReservaNoPagable = (estado: BookingStatus): string =>
  estado === BookingStatus.CANCELLED
    ? "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva."
    : "Esta reserva no se puede pagar.";

/**
 * Hace que el link de pago deje de poder pagarse. Es de mejor esfuerzo: si
 * Mercado Pago falla, el error se registra y nunca se propaga (PAG-025).
 */
export const invalidarLinkDePago = async (
  idPreferencia: string | null,
): Promise<void> => {
  if (!idPreferencia) {
    return;
  }

  try {
    await expirarPreferencia(idPreferencia);
  } catch (error) {
    console.error(
      `[PAGO] No se pudo invalidar la preferencia ${idPreferencia} en Mercado Pago.`,
      error,
    );
  }
};

export interface ReemplazoDePreferencia {
  idReserva: string;
  idAnterior: string | null;
  idNueva: string;
  /** Estado que debe seguir cumpliendo la reserva para poder pagarse. */
  condicion: Prisma.BookingWhereInput;
}

/**
 * Guarda la preferencia nueva como la vigente de la reserva y vence la anterior.
 * Es un "comparar y reemplazar": no escribe si otro pedido ya cambió la
 * preferencia o si la reserva dejó de ser pagable. En ese caso invalida la nueva
 * y responde 409. La preferencia nueva se crea antes, fuera de toda transacción.
 */
export const reemplazarPreferenciaVigente = async ({
  idReserva,
  idAnterior,
  idNueva,
  condicion,
}: ReemplazoDePreferencia): Promise<void> => {
  const { count } = await prisma.booking.updateMany({
    where: { id: idReserva, mpPreferenceId: idAnterior, ...condicion },
    data: { mpPreferenceId: idNueva },
  });

  if (count === 1) {
    await invalidarLinkDePago(idAnterior);
    return;
  }

  await invalidarLinkDePago(idNueva);

  const reserva = await prisma.booking.findUnique({
    where: { id: idReserva },
    select: { status: true },
  });

  if (!reserva) {
    throw new NotFoundError("Reserva no encontrada");
  }

  const sigueSiendoPagable =
    reserva.status === BookingStatus.PENDING ||
    reserva.status === BookingStatus.CONFIRMED;

  throw new ConflictError(
    sigueSiendoPagable
      ? "La reserva cambió mientras se generaba el pago. Intenta de nuevo."
      : mensajeReservaNoPagable(reserva.status),
  );
};
