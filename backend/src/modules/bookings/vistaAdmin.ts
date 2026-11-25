import type { BookingPayment, Prisma, RefundReason } from "@prisma/client";
import {
  derivarEstadoSena,
  derivarReembolsoPendiente,
  estadoEfectivo,
} from "./estadoSena.js";
import type { EstadoSena, ReembolsoPendiente } from "./estadoSena.js";

/**
 * Datos que lee la vista de administrador: la cancha completa, el titular
 * limitado a cuatro campos y los pagos registrados (decisión 11).
 */
export const incluirParaVistaAdmin = {
  court: true,
  user: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  payments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.BookingInclude;

export type ReservaParaVistaAdmin = Prisma.BookingGetPayload<{
  include: typeof incluirParaVistaAdmin;
}>;

/** Pago tal como lo ve el administrador (PAG-026); no incluye el id de la reserva. */
export interface VistaPagoAdmin {
  id: string;
  mpPaymentId: string;
  amount: number;
  isValid: boolean;
  refundReason: RefundReason | null;
  refundedAt: string | null;
  createdAt: string;
}

export type VistaReservaAdmin = Omit<
  ReservaParaVistaAdmin,
  | "status"
  | "totalPrice"
  | "depositAmount"
  | "accessTokenHash"
  | "mpPreferenceId"
  | "depositPaidAtCancel"
  | "negocioId"
  | "payments"
> & {
  status: ReservaParaVistaAdmin["status"];
  totalPrice: number;
  depositAmount: number | null;
  depositStatus: EstadoSena | null;
  refundDue: ReembolsoPendiente | null;
  payments: VistaPagoAdmin[];
};

const armarVistaPago = (pago: BookingPayment): VistaPagoAdmin => ({
  id: pago.id,
  mpPaymentId: pago.mpPaymentId,
  amount: Number(pago.amount),
  isValid: pago.isValid,
  refundReason: pago.refundReason,
  refundedAt: pago.refundedAt ? pago.refundedAt.toISOString() : null,
  createdAt: pago.createdAt.toISOString(),
});

/**
 * Arma la vista de administrador con un mapeo explícito de campos (lista
 * blanca): nunca expone el hash del token de acceso, la preferencia de Mercado
 * Pago ni la marca interna de la cancelación. El estado es el efectivo: una
 * PENDING vencida que el barrido no pasó a EXPIRED se informa como EXPIRED (ADM-008).
 */
export const armarVistaAdmin = (
  reserva: ReservaParaVistaAdmin,
  ahora: Date,
): VistaReservaAdmin => ({
  id: reserva.id,
  userId: reserva.userId,
  courtId: reserva.courtId,
  startTime: reserva.startTime,
  endTime: reserva.endTime,
  totalPrice: Number(reserva.totalPrice),
  status: estadoEfectivo(reserva, ahora),
  paymentMethod: reserva.paymentMethod,
  guestFirstName: reserva.guestFirstName,
  guestLastName: reserva.guestLastName,
  guestPhone: reserva.guestPhone,
  guestEmail: reserva.guestEmail,
  expiresAt: reserva.expiresAt,
  depositAmount:
    reserva.depositAmount === null ? null : Number(reserva.depositAmount),
  createdAt: reserva.createdAt,
  updatedAt: reserva.updatedAt,
  court: reserva.court,
  user: reserva.user,
  depositStatus: derivarEstadoSena(reserva, reserva.payments),
  refundDue: derivarReembolsoPendiente(reserva.payments),
  payments: reserva.payments.map(armarVistaPago),
});
