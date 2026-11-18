import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from "mercadopago";
import { BookingStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../core/config/prisma.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../core/errors/AppError.js";
import { crearPreferencia, obtenerPago } from "../../core/integraciones/mercadoPago.js";
import { conBloqueoDeCancha } from "../bookings/bloqueoCancha.js";
import {
  mensajeReservaNoPagable,
  reemplazarPreferenciaVigente,
} from "../bookings/linkDePago.js";

const ESTADOS_PAGABLES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

const EVENTOS_DE_PAGO = ["payment", "payment.created", "payment.updated"];

const ID_PAGO_VALIDO = /^\d+$/;

const referenciaReservaSchema = z.string().uuid();

export interface NotificacionWebhook {
  firma: string | string[] | undefined;
  idPedido: string | string[] | undefined;
  idPago: string | undefined;
  tipo: string | undefined;
}

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
      throw new ConflictError(mensajeReservaNoPagable(booking.status));
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    const preferencia = await crearPreferencia({
      idReserva: booking.id,
      titulo: `Reserva - ${booking.court.name}`,
      descripcion: `Turno para deporte: ${booking.court.sport}`,
      monto: Number(booking.totalPrice),
      // userId coincide con idUsuario (validado arriba), así que la cuenta existe
      emailPagador: booking.user?.email,
      urlRetorno: `${frontendUrl}/mis-reservas`,
    });

    if (!preferencia.id) {
      throw new Error("Mercado Pago no devolvió el id de la preferencia.");
    }

    // La preferencia nueva pasa a ser la vigente y la anterior se vence (PAG-025).
    await reemplazarPreferenciaVigente({
      idReserva: booking.id,
      idAnterior: booking.mpPreferenceId,
      idNueva: preferencia.id,
      condicion: { status: { in: ESTADOS_PAGABLES } },
    });

    return {
      initPoint: preferencia.initPoint,
      sandboxInitPoint: preferencia.sandboxInitPoint,
      preferenceId: preferencia.id,
    };
  }

  async procesarNotificacion(notificacion: NotificacionWebhook) {
    this.validarFirma(notificacion);

    const { idPago, tipo } = notificacion;

    if (
      idPago &&
      ID_PAGO_VALIDO.test(idPago) &&
      tipo &&
      EVENTOS_DE_PAGO.includes(tipo)
    ) {
      await this.processWebhook(idPago);
    }
  }

  private validarFirma({ firma, idPedido, idPago }: NotificacionWebhook) {
    const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET;

    if (!secreto) {
      console.error("MERCADOPAGO_WEBHOOK_SECRET no está definido.");
      throw new UnauthorizedError("Firma de webhook inválida.");
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature: firma,
        xRequestId: idPedido,
        dataId: idPago,
        secret: secreto,
      });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        throw new UnauthorizedError("Firma de webhook inválida.");
      }

      throw error;
    }
  }

  private async processWebhook(paymentId: string) {
    const paymentData = await obtenerPago(paymentId);
    const referencia = referenciaReservaSchema.safeParse(
      paymentData.external_reference,
    );

    if (!referencia.success) {
      return;
    }

    if (paymentData.status === "approved") {
      await this.confirmarReservaPagada(
        referencia.data,
        paymentId,
        paymentData.transaction_amount,
      );
    } else if (
      paymentData.status === "rejected" ||
      paymentData.status === "cancelled"
    ) {
      await prisma.booking.updateMany({
        where: { id: referencia.data, status: { in: ESTADOS_PAGABLES } },
        data: { status: BookingStatus.CANCELLED },
      });
    }
  }

  private async confirmarReservaPagada(
    idReserva: string,
    idPago: string,
    montoPagado: number | undefined,
  ) {
    const booking = await prisma.booking.findUnique({
      where: { id: idReserva },
    });

    if (!booking || booking.status === BookingStatus.COMPLETED) {
      return;
    }

    if (montoPagado !== Number(booking.totalPrice)) {
      console.warn(
        `[PAGO] El monto del pago ${idPago} no coincide con la reserva ${idReserva}.`,
      );
      return;
    }

    try {
      await conBloqueoDeCancha(booking.courtId, (transaccion) =>
        transaccion.booking.updateMany({
          where: { id: idReserva, status: booking.status },
          data: {
            status: BookingStatus.CONFIRMED,
            paymentMethod: "TRANSFER",
          },
        }),
      );
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      console.warn(
        `[PAGO] El pago ${idPago} requiere revisión manual: el turno de la reserva ${idReserva} ya está ocupado.`,
      );
    }
  }
}
