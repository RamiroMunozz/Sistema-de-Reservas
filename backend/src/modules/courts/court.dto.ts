import { z } from "zod";

export const getCourtsQuerySchema = z.object({
  sport: z.enum(["FUTBOL_5", "FUTBOL_7", "PADEL", "TENIS"]).optional(),
  surface: z
    .enum(["SINTETICO", "CEMENTO", "POLVO_LADRILLO", "PARQUET"])
    .optional(),
  isIndoor: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  maxPrice: z
    .string()
    .transform((val) => Number(val))
    .refine(
      (val) => !isNaN(val) && val > 0,
      "El precio debe ser un número positivo",
    )
    .optional(),
  complexId: z.string().uuid("El complexId debe ser un UUID válido").optional(),
});

export const getCourtAvailabilityQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "El formato de fecha debe ser YYYY-MM-DD"),
});

export type GetCourtsQueryDTO = z.infer<typeof getCourtsQuerySchema>;
export type GetCourtAvailabilityQueryDTO = z.infer<
  typeof getCourtAvailabilityQuerySchema
>;
