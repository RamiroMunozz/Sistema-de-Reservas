import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { BookingStatus } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError.js";

const ESTADOS_PAGABLES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

export class PaymentService {
  async createPaymentPreference(bookingId: string, idUsuario: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
        user: true,
      },
    });

    if (!booking) {
      throw new NotFoundError("Reserva no encontrada");
    }

    if (booking.userId !== idUsuario) {
      throw new ForbiddenError(
        "No tienes autorización para pagar esta reserva.",
      );
    }

    if (!ESTADOS_PAGABLES.includes(booking.status)) {
      throw new ConflictError("Esta reserva no se puede pagar.");
    }

    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
    });

    const preference = new Preference(client);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const ngrokOrTunnelUrl = "https://odd-feet-open.loca.lt";

    const response = await preference.create({
      body: {
        items: [
          {
            id: booking.id,
            title: `Reserva - ${booking.court.name}`,
            description: `Turno para deporte: ${booking.court.sport}`,
            quantity: 1,
            unit_price: Number(booking.totalPrice),
            currency_id: "ARS",
          },
        ],
        payer: {
          email: booking.user.email,
        },
        back_urls: {
          success: `${frontendUrl}/mis-reservas`,
          failure: `${frontendUrl}/mis-reservas`,
          pending: `${frontendUrl}/mis-reservas`,
        },
        // Se omite auto_return para evitar el error 400 en localhost
        notification_url: `${ngrokOrTunnelUrl}/api/v1/payments/webhook`,
        external_reference: booking.id,
      },
    });

    return {
      initPoint: response.init_point,
      sandboxInitPoint: response.sandbox_init_point,
      preferenceId: response.id,
    };
  }

  async processWebhook(paymentId: string) {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
    });

    const payment = new Payment(client);
    const paymentData = await payment.get({ id: paymentId });
    const bookingId = paymentData.external_reference;

    if (!bookingId) {
      return { status: paymentData.status };
    }

    if (paymentData.status === "approved") {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "CONFIRMED",
          paymentMethod: "TRANSFER",
        },
      });
    } else if (
      paymentData.status === "rejected" ||
      paymentData.status === "cancelled"
    ) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
        },
      });
    }

    return { status: paymentData.status };
  }
}
