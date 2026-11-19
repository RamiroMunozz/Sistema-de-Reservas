import type { Booking } from "@prisma/client";

/**
 * Reserva tal como la recibe el jugador al cancelar, con un mapeo explícito de
 * campos (lista blanca): nunca expone el hash del token de acceso, la
 * preferencia de Mercado Pago ni la marca interna de la cancelación (RES-025).
 */
export type VistaReservaJugador = Pick<
  Booking,
  | "id"
  | "userId"
  | "courtId"
  | "startTime"
  | "endTime"
  | "totalPrice"
  | "status"
  | "paymentMethod"
  | "createdAt"
  | "updatedAt"
>;

export const armarVistaJugador = (reserva: Booking): VistaReservaJugador => ({
  id: reserva.id,
  userId: reserva.userId,
  courtId: reserva.courtId,
  startTime: reserva.startTime,
  endTime: reserva.endTime,
  totalPrice: reserva.totalPrice,
  status: reserva.status,
  paymentMethod: reserva.paymentMethod,
  createdAt: reserva.createdAt,
  updatedAt: reserva.updatedAt,
});
