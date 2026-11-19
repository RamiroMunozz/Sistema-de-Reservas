import { z } from "zod";
import { uuidSchema } from "../../core/validacion/esquemas.js";

export const crearPreferenciaSchema = z.object({
  bookingId: z.string().uuid("El bookingId debe ser un UUID válido"),
});

// El id del BookingPayment, no el id de pago de Mercado Pago (PAG-024)
export const idPagoRegistradoSchema = z.object({
  paymentId: uuidSchema("El paymentId"),
});

export const cuerpoWebhookSchema = z
  .object({ type: z.string().optional() })
  .catch({});

export const consultaWebhookSchema = z
  .object({
    "data.id": z.string().optional(),
    type: z.string().optional(),
  })
  .catch({});

export type CrearPreferenciaDTO = z.infer<typeof crearPreferenciaSchema>;
