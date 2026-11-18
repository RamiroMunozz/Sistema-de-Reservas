import { BookingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

// Una PENDING con vencimiento pasado todavía puede no haber sido barrida: las
// lecturas la tratan como vencida. El OR explícito evita que un expiresAt nulo
// (lógica de tres valores de SQL) excluya por error las PENDING sin vencimiento.
const noVencidaPendiente = (ahora: Date): Prisma.BookingWhereInput[] => [
  { status: { not: BookingStatus.PENDING } },
  { expiresAt: null },
  { expiresAt: { gt: ahora } },
];

/** Reservas que ocupan el turno: disponibilidad, agenda y verificación de turno libre. */
export const filtroOcupaTurno = (ahora: Date): Prisma.BookingWhereInput => ({
  status: { notIn: [BookingStatus.CANCELLED, BookingStatus.EXPIRED] },
  OR: noVencidaPendiente(ahora),
});

/** Reservas que cuentan en las métricas: excluye las vencidas, barridas o no. */
export const filtroNoVencida = (ahora: Date): Prisma.BookingWhereInput => ({
  status: { not: BookingStatus.EXPIRED },
  OR: noVencidaPendiente(ahora),
});
