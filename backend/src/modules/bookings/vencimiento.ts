import { BookingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/**
 * Pasa a EXPIRED las reservas PENDING vencidas de una cancha y devuelve cuántas
 * fueron. Debe ejecutarse dentro de conBloqueoDeCancha, como primera operación,
 * para que la validación posterior vea el estado ya actualizado (RES-026).
 */
export const liberarReservasVencidas = async (
  transaccion: Prisma.TransactionClient,
  idCancha: string,
  ahora: Date = new Date(),
): Promise<number> => {
  const { count } = await transaccion.booking.updateMany({
    where: {
      courtId: idCancha,
      status: BookingStatus.PENDING,
      expiresAt: { lte: ahora },
    },
    data: { status: BookingStatus.EXPIRED },
  });
  return count;
};
