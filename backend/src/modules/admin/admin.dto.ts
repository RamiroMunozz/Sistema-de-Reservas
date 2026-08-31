import { z } from "zod";

export const createCourtSchema = z.object({
  complexId: z.string().uuid("El complexId debe ser un UUID válido"),
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  sport: z.enum(["FUTBOL_5", "FUTBOL_7", "PADEL", "TENIS"]),
  surface: z.enum(["SINTETICO", "CEMENTO", "POLVO_LADRILLO", "PARQUET"]),
  pricePerSlot: z.number().positive("El precio debe ser un número positivo"),
  isIndoor: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateCourtSchema = createCourtSchema.partial();

export const metricsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
});

export type CreateCourtDTO = z.infer<typeof createCourtSchema>;
export type UpdateCourtDTO = z.infer<typeof updateCourtSchema>;
export type MetricsQueryDTO = z.infer<typeof metricsQuerySchema>;
