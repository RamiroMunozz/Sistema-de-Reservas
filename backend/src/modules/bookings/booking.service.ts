import { BookingStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError.js";
import { conBloqueoDeCancha } from "./bloqueoCancha.js";
import { cancelarEnTransaccion } from "./cancelacionReserva.js";
import { filtroOcupaTurno } from "./filtrosReserva.js";
import { invalidarLinkDePago } from "./linkDePago.js";
import { liberarReservasVencidas } from "./vencimiento.js";
import { armarVistaAdmin, incluirParaVistaAdmin } from "./vistaAdmin.js";
import { armarVistaJugador } from "./vistaJugador.js";

export interface CreateBookingInput {
  courtId: string;
  startTime: string | Date;
  endTime: string | Date;
  paymentMethod?: PaymentMethod;
}

const validarHorario = (inicio: Date, fin: Date) => {
  if (inicio >= fin) {
    throw new AppError("La hora de inicio debe ser anterior a la hora de fin.");
  }
};

const TRANSICIONES_PERMITIDAS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.COMPLETED]: [],
  // Solo la produce el vencimiento (RES-035); no se entra ni se sale por la API.
  [BookingStatus.EXPIRED]: [],
};

export const puedeTransicionar = (
  actual: BookingStatus,
  nuevo: BookingStatus,
): boolean => TRANSICIONES_PERMITIDAS[actual].includes(nuevo);

/**
 * Valida horario, existencia y disponibilidad de la cancha y que el turno
 * no haya pasado. Devuelve la cancha y las fechas ya convertidas.
 */
export const validarTurnoReservable = async (
  courtId: string,
  startTime: string | Date,
  endTime: string | Date,
) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  validarHorario(start, end);

  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: { complex: { select: { negocioId: true, depositPercent: true } } },
  });

  if (!court) {
    throw new AppError("La cancha no existe.");
  }

  if (!court.isActive) {
    throw new AppError("La cancha no está disponible.");
  }

  if (start <= new Date()) {
    throw new AppError("No se puede reservar un turno pasado.");
  }

  return {
    court,
    start,
    end,
    idNegocio: court.complex.negocioId,
    depositPercent: court.complex.depositPercent,
  };
};

export class BookingService {
  async createBooking(data: CreateBookingInput, userId: string) {
    const { court, start, end, idNegocio } = await validarTurnoReservable(
      data.courtId,
      data.startTime,
      data.endTime,
    );

    return conBloqueoDeCancha(data.courtId, async (transaccion) => {
      // Una PENDING vencida no debe ocupar el turno aunque el barrido no corrió (RES-026).
      await liberarReservasVencidas(transaccion, data.courtId);

      return transaccion.booking.create({
        data: {
          courtId: data.courtId,
          negocioId: idNegocio,
          userId: userId,
          startTime: start,
          endTime: end,
          totalPrice: court.pricePerSlot,
          paymentMethod: data.paymentMethod || PaymentMethod.CASH,
          status: BookingStatus.CONFIRMED,
        },
        include: {
          court: true,
        },
      });
    });
  }

  async getUserBookings(userId: string) {
    return prisma.booking.findMany({
      where: { userId },
      include: {
        court: true,
      },
      orderBy: {
        startTime: "desc",
      },
    });
  }

  async cancelBooking(bookingId: string, userId: string) {
    const existente = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { courtId: true },
    });

    if (!existente) {
      throw new NotFoundError("Reserva no encontrada.");
    }

    const { courtId } = existente;

    const { cancelada, idPreferencia } = await conBloqueoDeCancha(
      courtId,
      async (transaccion) => {
        // Una PENDING vencida pasa a EXPIRED antes de validar la transición (RES-011).
        await liberarReservasVencidas(transaccion, courtId);

        const booking = await transaccion.booking.findUnique({
          where: { id: bookingId },
        });

        if (!booking) {
          throw new NotFoundError("Reserva no encontrada.");
        }

        // Una reserva de invitado no tiene userId y no pertenece a ninguna cuenta.
        if (booking.userId !== userId) {
          throw new ForbiddenError(
            "No tienes autorización para cancelar esta reserva.",
          );
        }

        if (booking.status === BookingStatus.CANCELLED) {
          throw new ConflictError("La reserva ya se encuentra cancelada.");
        }

        if (booking.status === BookingStatus.COMPLETED) {
          throw new ConflictError(
            "No se puede cancelar una reserva completada.",
          );
        }

        if (booking.status === BookingStatus.EXPIRED) {
          throw new ConflictError("La reserva venció y no se puede cancelar.");
        }

        await cancelarEnTransaccion(transaccion, bookingId);

        return {
          cancelada: armarVistaJugador(
            await transaccion.booking.findUniqueOrThrow({
              where: { id: bookingId },
            }),
          ),
          idPreferencia: booking.mpPreferenceId,
        };
      },
    );

    // Después del commit: un fallo de Mercado Pago no revierte la cancelación (PAG-025).
    await invalidarLinkDePago(idPreferencia);

    return cancelada;
  }

  async getOccupiedSlots(courtId: string, dateStr: string) {
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        courtId,
        ...filtroOcupaTurno(new Date()),
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        startTime: true,
      },
    });

    return bookings.map((b) => {
      const d = new Date(b.startTime);
      const hours = String(d.getUTCHours()).padStart(2, "0");
      const minutes = String(d.getUTCMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    });
  }

  async getAllBookingsForAdmin() {
    const reservas = await prisma.booking.findMany({
      include: incluirParaVistaAdmin,
      orderBy: {
        startTime: "desc",
      },
    });
    const ahora = new Date();

    return reservas.map((reserva) => armarVistaAdmin(reserva, ahora));
  }

  async getDailyBookingsForAdmin(dateStr: string) {
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    const reservas = await prisma.booking.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        ...filtroOcupaTurno(new Date()),
      },
      include: incluirParaVistaAdmin,
      orderBy: {
        startTime: "asc",
      },
    });
    const ahora = new Date();

    return reservas.map((reserva) => armarVistaAdmin(reserva, ahora));
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus) {
    const existente = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { courtId: true },
    });

    if (!existente) {
      throw new NotFoundError("Reserva no encontrada.");
    }

    const { courtId } = existente;

    const { actualizada, idPreferencia } = await conBloqueoDeCancha(
      courtId,
      async (transaccion) => {
        // Una PENDING vencida pasa a EXPIRED antes de validar la transición (RES-015).
        await liberarReservasVencidas(transaccion, courtId);

        const reserva = await transaccion.booking.findUnique({
          where: { id: bookingId },
          select: { status: true, mpPreferenceId: true },
        });

        if (!reserva) {
          throw new NotFoundError("Reserva no encontrada.");
        }

        if (!puedeTransicionar(reserva.status, status)) {
          throw new ConflictError(
            `No se puede cambiar una reserva de ${reserva.status} a ${status}.`,
          );
        }

        if (status === BookingStatus.CANCELLED) {
          await cancelarEnTransaccion(transaccion, bookingId);
        } else {
          await transaccion.booking.update({
            where: { id: bookingId },
            data: { status },
          });
        }

        return {
          actualizada: await transaccion.booking.findUniqueOrThrow({
            where: { id: bookingId },
            include: incluirParaVistaAdmin,
          }),
          idPreferencia:
            status === BookingStatus.CANCELLED ? reserva.mpPreferenceId : null,
        };
      },
    );

    // Después del commit: un fallo de Mercado Pago no revierte la cancelación (PAG-025).
    await invalidarLinkDePago(idPreferencia);

    return armarVistaAdmin(actualizada, new Date());
  }

  async createAdminBooking(
    data: {
      courtId: string;
      startTime: string;
      endTime: string;
      paymentMethod: PaymentMethod;
    },
    adminUserId: string,
  ) {
    const { court, start, end, idNegocio } = await validarTurnoReservable(
      data.courtId,
      data.startTime,
      data.endTime,
    );

    return conBloqueoDeCancha(data.courtId, async (transaccion) => {
      // Una PENDING vencida no debe ocupar el turno aunque el barrido no corrió (RES-026).
      await liberarReservasVencidas(transaccion, data.courtId);

      return transaccion.booking.create({
        data: {
          courtId: data.courtId,
          negocioId: idNegocio,
          userId: adminUserId,
          startTime: start,
          endTime: end,
          totalPrice: court.pricePerSlot,
          status: BookingStatus.CONFIRMED,
          paymentMethod: data.paymentMethod,
        },
        include: {
          court: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });
  }
}
