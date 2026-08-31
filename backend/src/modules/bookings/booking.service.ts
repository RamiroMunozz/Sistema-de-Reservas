import { PrismaClient, BookingStatus, PaymentMethod } from "@prisma/client";

const prisma = new PrismaClient();

export interface CreateBookingInput {
  courtId: string;
  startTime: string | Date;
  endTime: string | Date;
  paymentMethod?: PaymentMethod;
}

export class BookingService {
  async createBooking(data: CreateBookingInput, userId: string) {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (start >= end) {
      throw new Error("La hora de inicio debe ser anterior a la hora de fin.");
    }

    const court = await prisma.court.findUnique({
      where: { id: data.courtId },
    });

    if (!court) {
      throw new Error("La cancha no existe.");
    }

    // Verificar si ya existe una reserva activa para ese turno
    const overlappingBooking = await prisma.booking.findFirst({
      where: {
        courtId: data.courtId,
        status: BookingStatus.CONFIRMED,
        OR: [
          {
            startTime: { gte: start, lt: end },
          },
          {
            endTime: { gt: start, lte: end },
          },
          {
            AND: [{ startTime: { lte: start } }, { endTime: { gte: end } }],
          },
        ],
      },
    });

    if (overlappingBooking) {
      throw new Error("El horario seleccionado ya no está disponible.");
    }

    return prisma.booking.create({
      data: {
        courtId: data.courtId,
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
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error("Reserva no encontrada.");
    }

    if (booking.userId !== userId) {
      console.warn(
        `[AUTH MISMATCH] Reserva userId: ${booking.userId} vs Token userId: ${userId}`,
      );
      throw new Error("No tienes autorización para cancelar esta reserva.");
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new Error("La reserva ya se encuentra cancelada.");
    }

    return prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
      },
    });
  }

  async getOccupiedSlots(courtId: string, dateStr: string) {
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        courtId,
        status: BookingStatus.CONFIRMED,
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

  async getDailyBookingsForAdmin(dateStr: string) {
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    return prisma.booking.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          not: BookingStatus.CANCELLED,
        },
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
      orderBy: {
        startTime: "asc",
      },
    });
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus) {
    return prisma.booking.update({
      where: { id: bookingId },
      data: { status },
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
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    const existing = await prisma.booking.findFirst({
      where: {
        courtId: data.courtId,
        status: BookingStatus.CONFIRMED,
        AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
      },
    });

    if (existing) {
      throw new Error("El horario seleccionado ya no está disponible.");
    }

    const court = await prisma.court.findUnique({
      where: { id: data.courtId },
    });

    if (!court) throw new Error("Cancha no encontrada.");

    return prisma.booking.create({
      data: {
        courtId: data.courtId,
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
  }
}
