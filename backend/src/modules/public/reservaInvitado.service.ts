import { BookingStatus } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import {
  crearPreferencia,
  obtenerVariableMercadoPago,
} from "../../core/integraciones/mercadoPago.js";
import {
  bloquearTelefono,
  conBloqueoDeCancha,
} from "../bookings/bloqueoCancha.js";
import { validarTurnoReservable } from "../bookings/booking.service.js";
import { invalidarLinkDePago } from "../bookings/linkDePago.js";
import { liberarReservasVencidas } from "../bookings/vencimiento.js";
import type { CrearReservaInvitadoDTO } from "./public.dto.js";
import { calcularSena } from "./sena.js";
import { generarToken, hashearToken } from "./tokenAcceso.js";

const MINUTOS_DE_VENCIMIENTO = 15;
const MS_POR_MINUTO = 60 * 1000;

// Variables que exige la preferencia (PAG-007): se verifican antes de escribir.
const VARIABLES_DE_MERCADO_PAGO = [
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
];

export interface ReservaInvitadoCreada {
  token: string;
  initPoint: string;
}

export class ReservaInvitadoService {
  async crear(datos: CrearReservaInvitadoDTO): Promise<ReservaInvitadoCreada> {
    const { court, start, end } = await validarTurnoReservable(
      datos.courtId,
      datos.startTime,
      datos.endTime,
    );

    VARIABLES_DE_MERCADO_PAGO.forEach(obtenerVariableMercadoPago);

    const { depositPercent } = await prisma.complex.findUniqueOrThrow({
      where: { id: court.complexId },
      select: { depositPercent: true },
    });

    const depositAmount = calcularSena(court.pricePerSlot, depositPercent);
    const token = generarToken();
    const expiresAt = new Date(Date.now() + MINUTOS_DE_VENCIMIENTO * MS_POR_MINUTO);

    const reserva = await conBloqueoDeCancha(court.id, async (transaccion) => {
      // Primera operación: una PENDING vencida deja de ocupar el turno (RES-026).
      await liberarReservasVencidas(transaccion, court.id);
      await bloquearTelefono(transaccion, datos.guestPhone);

      return transaccion.booking.create({
        data: {
          courtId: court.id,
          startTime: start,
          endTime: end,
          totalPrice: court.pricePerSlot,
          status: BookingStatus.PENDING,
          guestFirstName: datos.guestFirstName,
          guestLastName: datos.guestLastName,
          guestPhone: datos.guestPhone,
          guestEmail: datos.guestEmail,
          expiresAt,
          depositAmount,
          accessTokenHash: hashearToken(token),
        },
        select: { id: true },
      });
    });

    const initPoint = await this.generarLinkDePago({
      idReserva: reserva.id,
      idCancha: court.id,
      nombreCancha: court.name,
      deporte: court.sport,
      monto: depositAmount.toNumber(),
      emailPagador: datos.guestEmail,
      token,
      venceEn: expiresAt,
    });

    return { token, initPoint };
  }

  /**
   * Crea la preferencia de seña y la guarda en la reserva. Si algo falla, la
   * reserva pasa a CANCELLED para liberar el turno y no se devuelve el token (RES-032).
   */
  private async generarLinkDePago(datos: {
    idReserva: string;
    idCancha: string;
    nombreCancha: string;
    deporte: string;
    monto: number;
    emailPagador: string | undefined;
    token: string;
    venceEn: Date;
  }): Promise<string> {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    let idPreferencia: string | undefined;

    try {
      const preferencia = await crearPreferencia({
        idReserva: datos.idReserva,
        titulo: `Seña - ${datos.nombreCancha}`,
        descripcion: `Seña del turno de ${datos.deporte}`,
        monto: datos.monto,
        emailPagador: datos.emailPagador,
        urlRetorno: `${frontendUrl}/reserva/${datos.token}`,
        venceEn: datos.venceEn,
      });

      idPreferencia = preferencia.id;

      if (!preferencia.id || !preferencia.initPoint) {
        throw new Error("Mercado Pago no devolvió el id o el link de la preferencia.");
      }

      await prisma.booking.update({
        where: { id: datos.idReserva },
        data: { mpPreferenceId: preferencia.id },
      });

      return preferencia.initPoint;
    } catch (error) {
      await this.cancelarPorFalla(datos.idCancha, datos.idReserva);
      // Si la preferencia llegó a crearse pero no se guardó, el link no debe quedar pagable.
      await invalidarLinkDePago(idPreferencia ?? null);

      if (error instanceof AppError) {
        throw error;
      }

      console.error("[RESERVA_INVITADO] No se pudo generar el link de pago.", error);
      throw new AppError(
        "No se pudo generar el link de pago. Intenta de nuevo.",
        502,
      );
    }
  }

  private async cancelarPorFalla(idCancha: string, idReserva: string) {
    try {
      await conBloqueoDeCancha(idCancha, (transaccion) =>
        transaccion.booking.updateMany({
          where: { id: idReserva, status: BookingStatus.PENDING },
          data: { status: BookingStatus.CANCELLED, depositPaidAtCancel: false },
        }),
      );
    } catch (error) {
      console.error(
        `[RESERVA_INVITADO] No se pudo cancelar la reserva ${idReserva} tras la falla de Mercado Pago.`,
        error,
      );
    }
  }
}
