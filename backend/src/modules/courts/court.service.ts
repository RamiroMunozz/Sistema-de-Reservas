import { prisma } from "../../core/config/prisma.js";
import {
  NotFoundError,
  UnprocessableEntityError,
} from "../../core/errors/AppError.js";
import { GetCourtsQueryDTO } from "./court.dto.js";

export class CourtService {
  async getAllCourts(filters: GetCourtsQueryDTO) {
    const whereClause: any = {
      isActive: true,
    };

    if (filters.sport) whereClause.sport = filters.sport;
    if (filters.surface) whereClause.surface = filters.surface;
    if (filters.isIndoor !== undefined) whereClause.isIndoor = filters.isIndoor;
    if (filters.complexId) whereClause.complexId = filters.complexId;
    if (filters.maxPrice) {
      whereClause.pricePerSlot = { lte: filters.maxPrice };
    }

    return prisma.court.findMany({
      where: whereClause,
      include: {
        complex: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
      },
      orderBy: { pricePerSlot: "asc" },
    });
  }

  async getCourtById(id: string) {
    const court = await prisma.court.findUnique({
      where: { id },
      include: {
        complex: true,
        schedules: {
          orderBy: { dayOfWeek: "asc" },
        },
      },
    });

    if (!court || !court.isActive) {
      throw new NotFoundError(
        "La cancha solicitada no existe o se encuentra inactiva",
      );
    }

    return court;
  }

  async getCourtAvailability(courtId: string, dateStr: string) {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(targetDate.getTime())) {
      throw new UnprocessableEntityError("Fecha inválida");
    }

    const dayOfWeek = targetDate.getUTCDay();

    // 1. Obtener la cancha y su horario de atención para ese día
    const court = await prisma.court.findUnique({
      where: { id: courtId },
      include: {
        schedules: {
          where: { dayOfWeek },
        },
      },
    });

    if (!court || !court.isActive) {
      throw new NotFoundError("Cancha no encontrada");
    }

    const schedule = court.schedules[0];

    // Horarios base: si la cancha tiene schedule usa ese, sino por defecto 08:00 a 23:00 de 60 min
    const openHour = schedule ? schedule.openTime.getUTCHours() : 8;
    const closeHour = schedule ? schedule.closeTime.getUTCHours() : 23;
    const durationMinutes = schedule ? schedule.slotDurationMinutes : 60;

    // 2. Obtener las reservas existentes confirmadas para ese día
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    const existingBookings = await prisma.booking.findMany({
      where: {
        courtId,
        status: "CONFIRMED",
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    // 3. Generar todos los slots posibles
    const slots: Array<{
      startTime: string;
      endTime: string;
      isAvailable: boolean;
    }> = [];

    let currentSlotTime = new Date(
      `${dateStr}T${String(openHour).padStart(2, "0")}:00:00.000Z`,
    );
    const finalCloseTime = new Date(
      `${dateStr}T${String(closeHour).padStart(2, "0")}:00:00.000Z`,
    );

    while (currentSlotTime < finalCloseTime) {
      const slotEnd = new Date(
        currentSlotTime.getTime() + durationMinutes * 60 * 1000,
      );

      // Validar si el slot colisiona con alguna reserva existente
      const isOccupied = existingBookings.some(
        (booking: { startTime: Date; endTime: Date }) => {
          return (
            currentSlotTime.getTime() < booking.endTime.getTime() &&
            slotEnd.getTime() > booking.startTime.getTime()
          );
        },
      );

      slots.push({
        startTime: currentSlotTime.toISOString(),
        endTime: slotEnd.toISOString(),
        isAvailable: !isOccupied,
      });

      currentSlotTime = slotEnd;
    }

    return {
      courtId: court.id,
      courtName: court.name,
      pricePerSlot: court.pricePerSlot,
      date: dateStr,
      slots,
    };
  }
}
