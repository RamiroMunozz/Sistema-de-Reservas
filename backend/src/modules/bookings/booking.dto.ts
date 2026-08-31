import { z } from "zod";

export const createBookingSchema = z.object({
  courtId: z.string().uuid("El courtId debe ser un UUID válido"),
  startTime: z
    .string()
    .datetime({
      message:
        "startTime debe ser una fecha ISO válida (ej: 2026-08-30T18:00:00.000Z)",
    }),
  endTime: z
    .string()
    .datetime({
      message:
        "endTime debe ser una fecha ISO válida (ej: 2026-08-30T19:00:00.000Z)",
    }),
  paymentMethod: z.enum(["CASH", "TRANSFER"]).default("CASH"),
});

export const cancelBookingParamsSchema = z.object({
  id: z.string().uuid("El ID de la reserva debe ser un UUID válido"),
});

export type CreateBookingDTO = z.infer<typeof createBookingSchema>;
