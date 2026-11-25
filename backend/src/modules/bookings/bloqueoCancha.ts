import { BookingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { leerEnteroPositivo } from "../../core/config/entorno.js";
import { prisma } from "../../core/config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { convertirReservaSolapada } from "../../core/errors/reservaSolapada.js";

const OPCIONES_DE_TRANSACCION = { maxWait: 5000, timeout: 10000 };
const TOPE_POR_DEFECTO_DE_PENDIENTES_POR_TELEFONO = 2;

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

/**
 * Serializa las reservas de invitado de un mismo teléfono en un negocio y aplica el tope de
 * reservas PENDING vigentes de ese negocio (RES-031): el mismo teléfono en otro negocio no comparte
 * clave de bloqueo ni tope. Debe llamarse dentro de
 * conBloqueoDeCancha: el orden fijo (cancha y luego teléfono) evita deadlocks.
 * El primer entero de la clave (2) separa su espacio del de las canchas.
 */
export const bloquearTelefono = async (
  transaccion: Prisma.TransactionClient,
  idNegocio: string,
  telefono: string,
): Promise<void> => {
  await transaccion.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${idNegocio} || ':' || ${telefono}))`;

  const pendientes = await transaccion.booking.count({
    where: {
      negocioId: idNegocio,
      guestPhone: telefono,
      status: BookingStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
  });

  const tope = leerEnteroPositivo(
    "TOPE_PENDIENTES_POR_TELEFONO",
    TOPE_POR_DEFECTO_DE_PENDIENTES_POR_TELEFONO,
  );

  if (pendientes >= tope) {
    throw new AppError(
      "Este teléfono ya tiene reservas pendientes de pago. Completa el pago o espera a que venzan.",
      429,
    );
  }
};
