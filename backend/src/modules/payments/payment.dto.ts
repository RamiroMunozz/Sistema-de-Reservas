import { z } from "zod";

export const crearPreferenciaSchema = z.object({
  bookingId: z.string().uuid("El bookingId debe ser un UUID válido"),
});

export const cuerpoWebhookSchema = z
  .object({
    data: z
      .object({ id: z.union([z.string(), z.number()]).optional() })
      .optional(),
    type: z.string().optional(),
  })
  .catch({});

export const consultaWebhookSchema = z
  .object({
    "data.id": z.string().optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    topic: z.string().optional(),
  })
  .catch({});

export type CrearPreferenciaDTO = z.infer<typeof crearPreferenciaSchema>;
