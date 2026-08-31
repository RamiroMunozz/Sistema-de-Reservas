import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";
import { ZodError } from "zod";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // 1. Manejo de errores de validación de esquemas (Zod)
  if (err instanceof ZodError) {
    res.status(400).json({
      type: "https://api.tudominio.com/errors/validation-error",
      title: "Bad Request",
      status: 400,
      detail: "Los datos enviados no cumplen con el formato requerido.",
      instance: req.originalUrl,
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  // 2. Manejo de errores operacionales controlados (AppError)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      type: `https://api.tudominio.com/errors/${err.constructor.name.toLowerCase()}`,
      title: err.name,
      status: err.statusCode,
      detail: err.message,
      instance: req.originalUrl,
    });
    return;
  }

  // 3. Error no controlado (500 Internal Server Error)
  console.error("[UNHANDLED_ERROR]:", err);
  res.status(500).json({
    type: "https://api.tudominio.com/errors/internal-server-error",
    title: "Internal Server Error",
    status: 500,
    detail: "Ocurrió un error interno en el servidor.",
    instance: req.originalUrl,
  });
};
