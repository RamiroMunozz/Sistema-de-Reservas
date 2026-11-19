import { Prisma } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import { NotFoundError } from "../../core/errors/AppError.js";
import { filtroNoVencida } from "../bookings/filtrosReserva.js";
import {
  CreateCourtDTO,
  UpdateCourtDTO,
  MetricsQueryDTO,
  PorcentajeSenaDTO,
} from "./admin.dto.js";

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

  async getDepositPercent(id: string) {
    const complejo = await prisma.complex.findUnique({
      where: { id },
      select: { id: true, depositPercent: true },
    });

    if (!complejo) {
      throw new NotFoundError("Complejo no encontrado");
    }

    return complejo;
  }

  async updateDepositPercent(id: string, dto: PorcentajeSenaDTO) {
    await this.getDepositPercent(id);

    // El valor nuevo solo afecta a las reservas que se creen después (PAG-022).
    return prisma.complex.update({
      where: { id },
      data: { depositPercent: dto.depositPercent },
      select: { id: true, depositPercent: true },
    });
  }

  async getMetrics(dto: MetricsQueryDTO) {
    const start = new Date(`${dto.startDate}T00:00:00.000Z`);
    const end = new Date(`${dto.endDate}T23:59:59.999Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...filtroNoVencida(new Date()),
      },
      include: {
        court: {
          select: { name: true, sport: true },
        },
        // Pagos que efectivamente cuentan: válidos y sin reembolso
        payments: {
          where: { isValid: true, refundedAt: null },
          select: { amount: true },
        },
      },
    });

    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(
      (b) => b.status === "CONFIRMED",
    );
    const cancelledBookings = bookings.filter(
      (b) => b.status === "CANCELLED",
    );

    // Un invitado (con seña) aporta lo cobrado online; una reserva con cuenta, su
    // precio total hasta que exista la política de cobro.
    const totalRevenue = confirmedBookings
      .reduce(
        (acc, b) =>
          b.depositAmount === null
            ? acc.plus(b.totalPrice)
            : b.payments.reduce((suma, pago) => suma.plus(pago.amount), acc),
        new Prisma.Decimal(0),
      )
      .toNumber();

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
      details: bookings.map((b) => ({
        id: b.id,
        court: b.court.name,
        sport: b.court.sport,
        status: b.status,
        price: b.totalPrice.toNumber(),
        startTime: b.startTime,
      })),
    };
  }
}
