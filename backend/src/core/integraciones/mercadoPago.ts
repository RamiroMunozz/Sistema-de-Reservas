import {
  MercadoPagoConfig,
  Payment,
  PaymentRefund,
  Preference,
} from "mercadopago";
import { ServiceUnavailableError } from "../errors/AppError.js";

/**
 * Único punto de contacto con el SDK de Mercado Pago. Concentra las credenciales
 * (PAG-007) y permite simular la integración en las pruebas.
 */

export interface DatosPreferencia {
  idReserva: string;
  titulo: string;
  descripcion: string;
  monto: number;
  emailPagador?: string;
  urlRetorno: string;
  /** Instante en que el link deja de poder pagarse. Sin valor, no vence. */
  venceEn?: Date;
}

export interface PreferenciaCreada {
  id: string | undefined;
  initPoint: string | undefined;
  sandboxInitPoint: string | undefined;
}

const obtenerVariableRequerida = (nombre: string): string => {
  const valor = process.env[nombre];

  if (!valor) {
    throw new Error(`${nombre} no está definido.`);
  }

  return valor;
};

export const obtenerVariableMercadoPago = (nombre: string): string => {
  const valor = process.env[nombre];

  if (!valor) {
    throw new ServiceUnavailableError(
      "Los pagos con Mercado Pago no están configurados.",
    );
  }

  return valor;
};

const crearClienteMercadoPago = () =>
  new MercadoPagoConfig({
    accessToken: obtenerVariableMercadoPago("MERCADOPAGO_ACCESS_TOKEN"),
  });

export const crearPreferencia = async (
  datos: DatosPreferencia,
): Promise<PreferenciaCreada> => {
  // Sin el secreto el webhook rechazaría la notificación de un pago ya cobrado
  obtenerVariableMercadoPago("MERCADOPAGO_WEBHOOK_SECRET");
  const backendUrl = obtenerVariableRequerida("BACKEND_URL");
  const preferencia = new Preference(crearClienteMercadoPago());

  // No se envía expiration_date_from: el reloj local puede estar adelantado
  // respecto de Mercado Pago y la preferencia quedaría "disponible desde" el futuro.
  const respuesta = await preferencia.create({
    body: {
      items: [
        {
          id: datos.idReserva,
          title: datos.titulo,
          description: datos.descripcion,
          quantity: 1,
          unit_price: datos.monto,
          currency_id: "ARS",
        },
      ],
      payer: datos.emailPagador ? { email: datos.emailPagador } : undefined,
      back_urls: {
        success: datos.urlRetorno,
        failure: datos.urlRetorno,
        pending: datos.urlRetorno,
      },
      // Se omite auto_return para evitar el error 400 en localhost
      // source_news=webhooks evita las notificaciones IPN, que no llevan firma
      notification_url: `${backendUrl}/api/v1/payments/webhook?source_news=webhooks`,
      external_reference: datos.idReserva,
      ...(datos.venceEn
        ? { expires: true, expiration_date_to: datos.venceEn.toISOString() }
        : {}),
    },
  });

  return {
    id: respuesta.id,
    initPoint: respuesta.init_point,
    sandboxInitPoint: respuesta.sandbox_init_point,
  };
};

/**
 * Hace que la preferencia expire en este instante. Mercado Pago exige reenviar
 * los ítems en la actualización, por eso se lee la preferencia antes.
 */
export const expirarPreferencia = async (idPreferencia: string): Promise<void> => {
  const preferencia = new Preference(crearClienteMercadoPago());
  const actual = await preferencia.get({ preferenceId: idPreferencia });

  await preferencia.update({
    id: idPreferencia,
    updatePreferenceRequest: {
      items: actual.items ?? [],
      expires: true,
      expiration_date_to: new Date().toISOString(),
    },
  });
};

export const obtenerPago = async (idPago: string) =>
  new Payment(crearClienteMercadoPago()).get({ id: idPago });

/**
 * Reembolso total del pago: sin `body.amount`, Mercado Pago devuelve el saldo
 * completo. La clave de idempotencia evita reembolsar dos veces ante un reintento.
 */
export const reembolsarPago = async (
  idPagoMp: string,
  claveIdempotencia: string,
) =>
  new PaymentRefund(crearClienteMercadoPago()).create({
    payment_id: idPagoMp,
    requestOptions: { idempotencyKey: claveIdempotencia },
  });
