import { BookingStatus, RefundReason } from "@prisma/client";
import type { BookingPayment, Prisma } from "@prisma/client";

export type EstadoSena = "PENDING" | "PAID" | "REFUNDED";
export type ReembolsoPendiente = "REQUIRED" | "AT_DISCRETION";

/** Campos de un pago que necesitan las derivaciones (el monto acepta Decimal o número). */
export type PagoDeReserva = Pick<
  BookingPayment,
  "isValid" | "refundReason" | "refundedAt"
> & { amount: Prisma.Decimal | number };

interface ReservaConEstado {
  status: BookingStatus;
  expiresAt: Date | null;
}

interface ReservaConSena {
  depositAmount: Prisma.Decimal | number | null;
}

/**
 * Estado que ve el cliente: una PENDING con vencimiento pasado se informa como
 * EXPIRED aunque el barrido todavía no la haya actualizado (RES-028).
 */
export const estadoEfectivo = (
  reserva: ReservaConEstado,
  ahora: Date,
): BookingStatus =>
  reserva.status === BookingStatus.PENDING &&
  reserva.expiresAt !== null &&
  reserva.expiresAt <= ahora
    ? BookingStatus.EXPIRED
    : reserva.status;

/** El pago válido que todavía no fue reembolsado, o null (PAG-026). */
export const pagoValidoVigente = <T extends PagoDeReserva>(
  pagos: T[],
): T | null => pagos.find((p) => p.isValid && p.refundedAt === null) ?? null;

/** Estado de la seña derivado de los pagos; nulo en una reserva sin seña (PAG-023). */
export const derivarEstadoSena = (
  reserva: ReservaConSena,
  pagos: PagoDeReserva[],
): EstadoSena | null => {
  if (reserva.depositAmount === null) {
    return null;
  }

  if (pagoValidoVigente(pagos)) {
    return "PAID";
  }

  return pagos.some((p) => p.isValid) ? "REFUNDED" : "PENDING";
};

/** Reembolso que queda por hacer según los motivos de los pagos sin reembolsar (PAG-023). */
export const derivarReembolsoPendiente = (
  pagos: PagoDeReserva[],
): ReembolsoPendiente | null => {
  const pendientes = pagos.filter(
    (p) => p.refundReason !== null && p.refundedAt === null,
  );

  if (pendientes.length === 0) {
    return null;
  }

  return pendientes.every((p) => p.refundReason === RefundReason.OWNER_DISCRETION)
    ? "AT_DISCRETION"
    : "REQUIRED";
};

/**
 * Verdadero cuando cancelar dejaría la devolución de la seña a criterio del
 * canchero: la reserva está PENDING o CONFIRMED y su seña está pagada (RES-028).
 */
export const devolucionACriterioDelCanchero = (
  reserva: ReservaConEstado & ReservaConSena,
  pagos: PagoDeReserva[],
  ahora: Date,
): boolean => {
  const estado = estadoEfectivo(reserva, ahora);

  return (
    (estado === BookingStatus.PENDING || estado === BookingStatus.CONFIRMED) &&
    derivarEstadoSena(reserva, pagos) === "PAID"
  );
};
