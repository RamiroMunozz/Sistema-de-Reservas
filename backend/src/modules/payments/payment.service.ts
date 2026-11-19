import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from "mercadopago";
import { BookingStatus, PaymentMethod, Prisma } from "@prisma/client";
import type { Booking } from "@prisma/client";
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
import { filtroOcupaTurno } from "../bookings/filtrosReserva.js";
import {
  mensajeReservaNoPagable,
  reemplazarPreferenciaVigente,
} from "../bookings/linkDePago.js";
import { liberarReservasVencidas } from "../bookings/vencimiento.js";

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

    // Solo los pagos aprobados se registran; los demás estados no modifican nada (PAG-016).
    if (paymentData.status === "approved") {
      await this.registrarPagoAprobado(
        referencia.data,
        paymentId,
        paymentData.transaction_amount,
      );
    }
  }

  /**
   * Registra un pago aprobado en BookingPayment y confirma la reserva cuando
   * corresponde (PAG-012, PAG-013). La reserva se relee dentro del bloqueo de la
   * cancha para que la decisión refleje su estado en el instante del pago.
   * Los casos de reembolso (monto distinto, pago duplicado, cancelada, completada
   * y turno ocupado) quedan solo con advertencia hasta la entrega UT-5b.
   */
  private async registrarPagoAprobado(
    idReserva: string,
    idPago: string,
    montoPagado: number | undefined,
  ) {
    const reservaPrevia = await prisma.booking.findUnique({
      where: { id: idReserva },
      select: { courtId: true },
    });

    if (!reservaPrevia) {
      this.advertirRevisionManual(
        idReserva,
        idPago,
        "la reserva no existe en el sistema",
      );
      return;
    }

    await conBloqueoDeCancha(reservaPrevia.courtId, async (transaccion) => {
      const yaRegistrado = await transaccion.bookingPayment.findUnique({
        where: { mpPaymentId: idPago },
      });

      if (yaRegistrado) {
        return;
      }

      const reserva = await transaccion.booking.findUnique({
        where: { id: idReserva },
      });

      if (!reserva) {
        this.advertirRevisionManual(
          idReserva,
          idPago,
          "la reserva no existe en el sistema",
        );
        return;
      }

      const monto = montoPagado ?? (await this.releerMonto(idPago));

      if (monto === undefined) {
        this.advertirRevisionManual(
          idReserva,
          idPago,
          "Mercado Pago no informó el monto del pago",
        );
        return;
      }

      const montoEsperado = reserva.depositAmount ?? reserva.totalPrice;

      if (!new Prisma.Decimal(monto).equals(montoEsperado)) {
        this.advertirRevisionManual(
          idReserva,
          idPago,
          "el monto no coincide con el esperado",
        );
        return;
      }

      const pagoValido = await transaccion.bookingPayment.findFirst({
        where: { bookingId: idReserva, isValid: true, refundedAt: null },
      });

      if (pagoValido) {
        this.advertirRevisionManual(
          idReserva,
          idPago,
          "la reserva ya tiene un pago válido",
        );
        return;
      }

      const registrarComoValido = () =>
        transaccion.bookingPayment.create({
          data: {
            bookingId: idReserva,
            mpPaymentId: idPago,
            amount: monto,
            isValid: true,
          },
        });

      if (reserva.status === BookingStatus.PENDING) {
        await registrarComoValido();
        await transaccion.booking.updateMany({
          where: { id: idReserva, status: reserva.status },
          data: {
            status: BookingStatus.CONFIRMED,
            paymentMethod: PaymentMethod.MERCADOPAGO,
          },
        });
      } else if (reserva.status === BookingStatus.CONFIRMED) {
        await registrarComoValido();
        await transaccion.booking.updateMany({
          where: { id: idReserva, status: reserva.status },
          data: { paymentMethod: PaymentMethod.MERCADOPAGO },
        });
      } else if (reserva.status === BookingStatus.EXPIRED) {
        await this.reactivarSiElTurnoEstaLibre(
          transaccion,
          reserva,
          idPago,
          registrarComoValido,
        );
      } else {
        this.advertirRevisionManual(
          idReserva,
          idPago,
          `la reserva está ${reserva.status}`,
        );
      }
    });
  }

  private async reactivarSiElTurnoEstaLibre(
    transaccion: Prisma.TransactionClient,
    reserva: Booking,
    idPago: string,
    registrarComoValido: () => Promise<unknown>,
  ) {
    const ahora = new Date();
    await liberarReservasVencidas(transaccion, reserva.courtId, ahora);

    const solapadas = await transaccion.booking.count({
      where: {
        courtId: reserva.courtId,
        id: { not: reserva.id },
        startTime: { lt: reserva.endTime },
        endTime: { gt: reserva.startTime },
        ...filtroOcupaTurno(ahora),
      },
    });

    if (solapadas > 0) {
      this.advertirRevisionManual(
        reserva.id,
        idPago,
        "el turno de la reserva ya está ocupado",
      );
      return;
    }

    await registrarComoValido();
    await transaccion.booking.updateMany({
      where: { id: reserva.id, status: reserva.status },
      data: {
        status: BookingStatus.CONFIRMED,
        paymentMethod: PaymentMethod.MERCADOPAGO,
      },
    });
  }

  private async releerMonto(idPago: string): Promise<number | undefined> {
    const pagoActual = await obtenerPago(idPago);
    return pagoActual.transaction_amount;
  }

  private advertirRevisionManual(
    idReserva: string,
    idPago: string,
    motivo: string,
  ) {
    console.warn(
      `[PAGO] El pago ${idPago} de la reserva ${idReserva} requiere revisión manual: ${motivo}.`,
    );
  }
}
