import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import { NotFoundError } from "../../core/errors/AppError.js";

// Pertenencia al negocio (NEG-007, decisión 4 del diseño). Cada función busca el recurso por su id
// Y por el negocio en el mismo `where`, nunca "lee y compara después". Un recurso de otro negocio
// responde exactamente igual que uno inexistente: el mismo NotFoundError de la operación.
// El cliente es opcional para poder usarlas dentro de una transacción.
type Cliente = Pick<
  Prisma.TransactionClient,
  "complex" | "court" | "booking" | "bookingPayment"
>;

export async function buscarComplejoPropio(
  idNegocio: string,
  id: string,
  mensaje = "Complejo no encontrado",
  cliente: Cliente = prisma,
) {
  const complejo = await cliente.complex.findFirst({ where: { id, negocioId: idNegocio } });

  if (!complejo) {
    throw new NotFoundError(mensaje);
  }

  return complejo;
}

export async function buscarCanchaPropia(
  idNegocio: string,
  id: string,
  mensaje = "Cancha no encontrada",
  cliente: Cliente = prisma,
) {
  const cancha = await cliente.court.findFirst({
    where: { id, complex: { negocioId: idNegocio } },
  });

  if (!cancha) {
    throw new NotFoundError(mensaje);
  }

  return cancha;
}

export async function buscarReservaPropia(
  idNegocio: string,
  id: string,
  mensaje = "Reserva no encontrada.",
  cliente: Cliente = prisma,
) {
  const reserva = await cliente.booking.findFirst({ where: { id, negocioId: idNegocio } });

  if (!reserva) {
    throw new NotFoundError(mensaje);
  }

  return reserva;
}

export async function buscarPagoPropio(
  idNegocio: string,
  id: string,
  mensaje = "Pago no encontrado.",
  cliente: Cliente = prisma,
) {
  const pago = await cliente.bookingPayment.findFirst({
    where: { id, booking: { negocioId: idNegocio } },
  });

  if (!pago) {
    throw new NotFoundError(mensaje);
  }

  return pago;
}
