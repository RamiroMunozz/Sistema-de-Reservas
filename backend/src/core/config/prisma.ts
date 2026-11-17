import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  // Sin "error": los errores manejados (p. ej. solapamiento, 409) no deben
  // aparecer como fallas; los no manejados los registra errorHandler.
  log: process.env.NODE_ENV === "development" ? ["query", "warn"] : [],
});
