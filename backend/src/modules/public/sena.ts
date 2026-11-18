import { Prisma } from "@prisma/client";

const DECIMALES_DE_LA_SENA = 2;

/**
 * Seña de una reserva de invitado (PAG-022): el precio total por el porcentaje
 * del complejo, redondeado a 2 decimales con la mitad hacia arriba.
 */
export const calcularSena = (
  precioTotal: Prisma.Decimal,
  porcentaje: number,
): Prisma.Decimal =>
  precioTotal
    .mul(porcentaje)
    .div(100)
    .toDecimalPlaces(DECIMALES_DE_LA_SENA, Prisma.Decimal.ROUND_HALF_UP);
