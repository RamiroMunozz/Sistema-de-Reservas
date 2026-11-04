import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import { convertirReservaSolapada } from "../../core/errors/reservaSolapada.js";

const OPCIONES_DE_TRANSACCION = { maxWait: 5000, timeout: 10000 };

/**
 * Serializa las escrituras que ocupan turnos de una misma cancha.
 * Sin este bloqueo, los inserts simultáneos pueden caer en deadlock al validar
 * la restricción bookings_sin_solapamiento, que sigue siendo la garantía final.
 */
export const conBloqueoDeCancha = async <T>(
  idCancha: string,
  operacion: (transaccion: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  try {
    return await prisma.$transaction(async (transaccion) => {
      await transaccion.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await transaccion.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idCancha}))`;
      return operacion(transaccion);
    }, OPCIONES_DE_TRANSACCION);
  } catch (error) {
    throw convertirReservaSolapada(error);
  }
};
