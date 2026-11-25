import { Request, Response, NextFunction } from "express";
import type { Rol } from "../config/security.js";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError.js";

export const requireRole = (allowedRoles: readonly Rol[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Usuario no autenticado"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          "No tienes los permisos necesarios para realizar esta acción",
        ),
      );
    }

    next();
  };
};
