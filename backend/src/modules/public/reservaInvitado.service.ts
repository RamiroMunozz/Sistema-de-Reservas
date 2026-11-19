import { BookingStatus } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
} from "../../core/errors/AppError.js";
import {
  crearPreferencia,
  obtenerVariableMercadoPago,
} from "../../core/integraciones/mercadoPago.js";
import {
  bloquearTelefono,
  conBloqueoDeCancha,
} from "../bookings/bloqueoCancha.js";
import { validarTurnoReservable } from "../bookings/booking.service.js";
import { cancelarEnTransaccion } from "../bookings/cancelacionReserva.js";
import { estadoEfectivo, pagoValidoVigente } from "../bookings/estadoSena.js";
import {
  invalidarLinkDePago,
  mensajeReservaNoPagable,
  reemplazarPreferenciaVigente,
} from "../bookings/linkDePago.js";
import { liberarReservasVencidas } from "../bookings/vencimiento.js";
import type { CrearReservaInvitadoDTO } from "./public.dto.js";
import { calcularSena } from "./sena.js";
import { TOKEN_VALIDO, generarToken, hashearToken } from "./tokenAcceso.js";
import { armarVistaPublica } from "./vistaPublica.js";
import type { VistaPublicaReserva } from "./vistaPublica.js";

const MINUTOS_DE_VENCIMIENTO = 15;
const MS_POR_MINUTO = 60 * 1000;

// Variables que exige la preferencia (PAG-007): se verifican antes de escribir.
const VARIABLES_DE_MERCADO_PAGO = [
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
];

const MENSAJE_NO_ENCONTRADA = "Reserva no encontrada.";

const SELECCION_DE_PAGOS = {
  select: { isValid: true, refundReason: true, refundedAt: true, amount: true },
} as const;

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

  /** Consulta pública por token (RES-028). */
  async consultar(token: string): Promise<VistaPublicaReserva> {
    const reserva = await this.buscarPorToken(token);

    return armarVistaPublica(reserva, new Date());
  }

  /** Cancelación por token bajo el bloqueo de la cancha (RES-029, PAG-025). */
  async cancelar(token: string): Promise<VistaPublicaReserva> {
    const { id, courtId } = await this.buscarPorToken(token);

    const { vista, idPreferencia } = await conBloqueoDeCancha(
      courtId,
      async (transaccion) => {
        // Una PENDING vencida pasa a EXPIRED antes de validar el estado.
        await liberarReservasVencidas(transaccion, courtId);

        const reserva = await transaccion.booking.findUnique({
          where: { id },
          include: {
            court: { select: { name: true, sport: true } },
            payments: SELECCION_DE_PAGOS,
          },
        });

        if (!reserva) {
          throw new NotFoundError(MENSAJE_NO_ENCONTRADA);
        }

        this.validarCancelable(reserva.status);

        const { depositPaidAtCancel } = await cancelarEnTransaccion(transaccion, id);

        return {
          vista: armarVistaPublica(reserva, new Date(), {
            status: BookingStatus.CANCELLED,
            refundAtOwnerDiscretion: depositPaidAtCancel,
          }),
          idPreferencia: reserva.mpPreferenceId,
        };
      },
    );

    // Después del commit: un fallo de Mercado Pago no revierte la cancelación.
    await invalidarLinkDePago(idPreferencia);

    return vista;
  }

  /** Reintento del pago de la seña por token (PAG-021). */
  async reintentarPago(token: string): Promise<{ initPoint: string }> {
    const reserva = await this.buscarPorToken(token);
    const ahora = new Date();
    const estado = estadoEfectivo(reserva, ahora);

    if (estado !== BookingStatus.PENDING || pagoValidoVigente(reserva.payments)) {
      throw new ConflictError(mensajeReservaNoPagable(estado));
    }

    if (reserva.depositAmount === null || reserva.expiresAt === null) {
      throw new NotFoundError(MENSAJE_NO_ENCONTRADA);
    }

    VARIABLES_DE_MERCADO_PAGO.forEach(obtenerVariableMercadoPago);

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    let preferencia: Awaited<ReturnType<typeof crearPreferencia>>;

    try {
      preferencia = await crearPreferencia({
        idReserva: reserva.id,
        titulo: `Seña - ${reserva.court.name}`,
        descripcion: `Seña del turno de ${reserva.court.sport}`,
        monto: reserva.depositAmount.toNumber(),
        emailPagador: reserva.guestEmail ?? undefined,
        urlRetorno: `${frontendUrl}/reserva/${token}`,
        // Vence junto con la reserva: el reintento no extiende expiresAt.
        venceEn: reserva.expiresAt,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[RESERVA_INVITADO] No se pudo generar el link de pago.", error);
      throw new AppError("No se pudo generar el link de pago. Intenta de nuevo.", 502);
    }

    if (!preferencia.id || !preferencia.initPoint) {
      await invalidarLinkDePago(preferencia.id ?? null);
      throw new AppError("No se pudo generar el link de pago. Intenta de nuevo.", 502);
    }

    await reemplazarPreferenciaVigente({
      idReserva: reserva.id,
      idAnterior: reserva.mpPreferenceId,
      idNueva: preferencia.id,
      condicion: {
        status: BookingStatus.PENDING,
        expiresAt: { gt: ahora },
        payments: { none: { isValid: true, refundedAt: null } },
      },
    });

    return { initPoint: preferencia.initPoint };
  }

  private validarCancelable(estado: BookingStatus) {
    if (estado === BookingStatus.CANCELLED) {
      throw new ConflictError("La reserva ya se encuentra cancelada.");
    }

    if (estado === BookingStatus.COMPLETED) {
      throw new ConflictError("No se puede cancelar una reserva completada.");
    }

    if (estado === BookingStatus.EXPIRED) {
      throw new ConflictError("La reserva venció y no se puede cancelar.");
    }
  }

  /** Busca por el hash del token; un formato inválido no consulta la base. */
  private async buscarPorToken(token: string) {
    if (!TOKEN_VALIDO.test(token)) {
      throw new NotFoundError(MENSAJE_NO_ENCONTRADA);
    }

    const reserva = await prisma.booking.findUnique({
      where: { accessTokenHash: hashearToken(token) },
      include: {
        court: { select: { name: true, sport: true } },
        payments: SELECCION_DE_PAGOS,
      },
    });

    if (!reserva) {
      throw new NotFoundError(MENSAJE_NO_ENCONTRADA);
    }

    return reserva;
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
