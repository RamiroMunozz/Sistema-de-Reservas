import { z } from "zod";
import { esFechaExistente, uuidSchema } from "../../core/validacion/esquemas.js";

const canchaBaseSchema = z.object({
  complexId: z.string().uuid("El complexId debe ser un UUID válido"),
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  sport: z.enum(["FUTBOL_5", "FUTBOL_7", "PADEL", "TENIS"]),
  surface: z.enum(["SINTETICO", "CEMENTO", "POLVO_LADRILLO", "PARQUET"]),
  pricePerSlot: z.number().positive("El precio debe ser un número positivo"),
  isIndoor: z.boolean(),
  isActive: z.boolean(),
});

export const createCourtSchema = canchaBaseSchema.extend({
  isIndoor: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateCourtSchema = canchaBaseSchema.partial();

const fechaMetricaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
  .refine(esFechaExistente, "La fecha no existe");

export const metricsQuerySchema = z.object({
  startDate: fechaMetricaSchema,
  endDate: fechaMetricaSchema,
});

export const idComplejoSchema = z.object({
  id: uuidSchema("El ID del complejo"),
});

export const porcentajeSenaSchema = z.object({
  depositPercent: z
    .number("El porcentaje de seña debe ser un número")
    .int("El porcentaje de seña debe ser un entero")
    .min(1, "El porcentaje de seña debe ser al menos 1")
    .max(100, "El porcentaje de seña no puede superar 100"),
});

export type CreateCourtDTO = z.infer<typeof createCourtSchema>;
export type UpdateCourtDTO = z.infer<typeof updateCourtSchema>;
export type MetricsQueryDTO = z.infer<typeof metricsQuerySchema>;
export type PorcentajeSenaDTO = z.infer<typeof porcentajeSenaSchema>;
