import { Request, Response, NextFunction } from "express";
import { authenticate } from "./auth.js";
import { requireRole } from "./role.middleware.js";
import { UnauthorizedError } from "../errors/AppError.js";

// Fija en req.idNegocio el negocio firmado en el token del dueño. Nunca lo toma del cliente.
export const asignarNegocioDelDueno = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user || req.user.role !== "DUENO") {
    return next(new UnauthorizedError("Usuario no autenticado"));
  }

  req.idNegocio = req.user.negocioId;
  next();
};

// Cadena de las rutas del dueño: autenticado, con rol DUENO y con su negocio asignado.
export const soloDueno = [
  authenticate,
  requireRole(["DUENO"]),
  asignarNegocioDelDueno,
];

// Los controladores leen el negocio con este ayudante. Si falta es un error de programación (500).
export const obtenerIdNegocio = (req: Request): string => {
  if (!req.idNegocio) {
    throw new Error("El negocio no fue asignado: falta un middleware de negocio en la ruta.");
  }

  return req.idNegocio;
};
