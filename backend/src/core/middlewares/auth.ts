import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../config/security.js";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Token no proporcionado o inválido." });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Asignar el usuario decodificado a req.user
    req.user = verifyAccessToken(token);

    next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado." });
  }
};
