import type { BookingStatus, Prisma } from "@prisma/client";
import {
  derivarEstadoSena,
  devolucionACriterioDelCanchero,
  estadoEfectivo,
} from "../bookings/estadoSena.js";
import type { EstadoSena, PagoDeReserva } from "../bookings/estadoSena.js";

/** Campos de la reserva que necesita la vista pública (el resto nunca se lee). */
export interface ReservaParaVistaPublica {
  status: BookingStatus;
  startTime: Date;
  endTime: Date;
  expiresAt: Date | null;
  totalPrice: Prisma.Decimal;
  depositAmount: Prisma.Decimal | null;
  guestFirstName: string | null;
  court: { name: string; sport: string };
  payments: PagoDeReserva[];
}

/** Vista pública de la reserva (RES-028): solo estos campos salen por la API. */
export interface VistaPublicaReserva {
  status: BookingStatus;
  startTime: string;
  endTime: string;
  expiresAt: string | null;
  totalPrice: number;
  depositAmount: number | null;
  depositStatus: EstadoSena | null;
  guestFirstName: string | null;
  refundAtOwnerDiscretion: boolean;
  court: { name: string; sport: string };
}

/**
 * Arma la vista con un mapeo explícito (lista blanca): no expone teléfono,
 * correo, pagos, ids internos ni el hash del token. `sobrescribir` permite
 * informar el resultado de una cancelación recién hecha.
 */
export const armarVistaPublica = (
  reserva: ReservaParaVistaPublica,
  ahora: Date,
  sobrescribir: { status?: BookingStatus; refundAtOwnerDiscretion?: boolean } = {},
): VistaPublicaReserva => ({
  status: sobrescribir.status ?? estadoEfectivo(reserva, ahora),
  startTime: reserva.startTime.toISOString(),
  endTime: reserva.endTime.toISOString(),
  expiresAt: reserva.expiresAt ? reserva.expiresAt.toISOString() : null,
  totalPrice: Number(reserva.totalPrice),
  depositAmount:
    reserva.depositAmount === null ? null : Number(reserva.depositAmount),
  depositStatus: derivarEstadoSena(reserva, reserva.payments),
  guestFirstName: reserva.guestFirstName,
  refundAtOwnerDiscretion:
    sobrescribir.refundAtOwnerDiscretion ??
    devolucionACriterioDelCanchero(reserva, reserva.payments, ahora),
  court: { name: reserva.court.name, sport: reserva.court.sport },
});
