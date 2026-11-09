import { Prisma, BookingStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
} from "../../core/errors/AppError.js";

const SLOT_TAKEN_MESSAGE = "El horario seleccionado ya fue reservado.";
const OVERLAP_CONSTRAINT = "bookings_no_overlap";
const EXCLUSION_VIOLATION_SQLSTATE = "23P01";

// Prisma 5 expone la violación de exclusión como PrismaClientUnknownRequestError
// sin `code`; el SQLSTATE y el nombre de la restricción viajan en el mensaje.
function isOverlapViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientUnknownRequestError) &&
    !(error instanceof Prisma.PrismaClientKnownRequestError)
  ) {
    return false;
  }
  const meta = JSON.stringify((error as { meta?: unknown }).meta ?? "");
  const text = `${error.message} ${meta}`;
  return (
    text.includes(EXCLUSION_VIOLATION_SQLSTATE) ||
    text.includes(OVERLAP_CONSTRAINT)
  );
}

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
      throw new AppError(
        "La hora de inicio debe ser anterior a la hora de fin.",
        400,
      );
    }

    const court = await prisma.court.findUnique({
      where: { id: data.courtId },
    });

    if (!court) {
      throw new NotFoundError("La cancha no existe.");
    }

    await this.assertSlotFree(data.courtId, start, end);

    return this.insertBooking({
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

  // Pre-chequeo rápido; la garantía real es la restricción de exclusión en la base.
  private async assertSlotFree(courtId: string, start: Date, end: Date) {
    const existing = await prisma.booking.findFirst({
      where: {
        courtId,
        status: { not: BookingStatus.CANCELLED },
        startTime: { lt: end },
        endTime: { gt: start },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(SLOT_TAKEN_MESSAGE);
    }
  }

  private async insertBooking<T extends Prisma.BookingCreateArgs>(args: T) {
    try {
      return await prisma.booking.create(args);
    } catch (error) {
      if (isOverlapViolation(error)) {
        throw new ConflictError(SLOT_TAKEN_MESSAGE);
      }
      throw error;
    }
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

    if (start >= end) {
      throw new AppError(
        "La hora de inicio debe ser anterior a la hora de fin.",
        400,
      );
    }

    const court = await prisma.court.findUnique({
      where: { id: data.courtId },
    });

    if (!court) throw new NotFoundError("La cancha no existe.");

    await this.assertSlotFree(data.courtId, start, end);

    return this.insertBooking({
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
