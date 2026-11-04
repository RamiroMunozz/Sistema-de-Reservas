import rateLimit from "express-rate-limit";
import { AppError } from "../errors/AppError.js";

const QUINCE_MINUTOS = 15 * 60 * 1000;

// Cuenta solo los intentos fallidos para no bloquear a quien inicia sesión bien.
export const limitadorAutenticacion = rateLimit({
  windowMs: QUINCE_MINUTOS,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, _res, next) => {
    next(new AppError("Demasiados intentos. Probá de nuevo más tarde.", 429));
  },
});
