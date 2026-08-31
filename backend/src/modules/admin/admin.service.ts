import { prisma } from "../../core/config/prisma.js";
import { NotFoundError } from "../../core/errors/AppError.js";
import {
  CreateCourtDTO,
  UpdateCourtDTO,
  MetricsQueryDTO,
} from "./admin.dto.js";

interface BookingMetricItem {
  id: string;
  courtId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  totalPrice: any;
  status: string;
  paymentMethod: string;
  createdAt: Date;
  updatedAt: Date;
  court: {
    name: string;
    sport: string;
  };
}

export class AdminService {
  async createCourt(dto: CreateCourtDTO) {
    const complex = await prisma.complex.findUnique({
      where: { id: dto.complexId },
    });

    if (!complex) {
      throw new NotFoundError("El complejo especificado no existe");
    }

    return prisma.court.create({
      data: {
        complexId: dto.complexId,
        name: dto.name,
        sport: dto.sport,
        surface: dto.surface,
        pricePerSlot: dto.pricePerSlot,
        isIndoor: dto.isIndoor,
        isActive: dto.isActive,
      },
    });
  }

  async updateCourt(id: string, dto: UpdateCourtDTO) {
    const existingCourt = await prisma.court.findUnique({
      where: { id },
    });

    if (!existingCourt) {
      throw new NotFoundError("Cancha no encontrada");
    }

    return prisma.court.update({
      where: { id },
      data: dto,
    });
  }

  async getMetrics(dto: MetricsQueryDTO) {
    const start = new Date(`${dto.startDate}T00:00:00.000Z`);
    const end = new Date(`${dto.endDate}T23:59:59.999Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      include: {
        court: {
          select: { name: true, sport: true },
        },
      },
    });

    const typedBookings = bookings as unknown as BookingMetricItem[];

    const totalBookings = typedBookings.length;
    const confirmedBookings = typedBookings.filter(
      (b) => b.status === "CONFIRMED",
    );
    const cancelledBookings = typedBookings.filter(
      (b) => b.status === "CANCELLED",
    );

    const totalRevenue = confirmedBookings.reduce(
      (acc, b) => acc + Number(b.totalPrice),
      0,
    );

    return {
      period: {
        from: dto.startDate,
        to: dto.endDate,
      },
      summary: {
        totalBookings,
        confirmedCount: confirmedBookings.length,
        cancelledCount: cancelledBookings.length,
        totalRevenueARS: totalRevenue,
      },
      details: typedBookings.map((b) => ({
        id: b.id,
        court: b.court.name,
        sport: b.court.sport,
        status: b.status,
        price: Number(b.totalPrice),
        startTime: b.startTime,
      })),
    };
  }
}
