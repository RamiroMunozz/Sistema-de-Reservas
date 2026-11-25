import { Request, Response, NextFunction } from "express";
import { authenticate } from "./auth.js";
import { requireRole } from "./role.middleware.js";
import { NotFoundError, UnauthorizedError } from "../errors/AppError.js";
import { esSlugValido } from "../../modules/negocios/slug.js";
import { NegocioService } from "../../modules/negocios/negocio.service.js";

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

const MENSAJE_NEGOCIO_NO_ENCONTRADO = "Negocio no encontrado.";
const negocioService = new NegocioService();

// Fábrica común de los resolutores por slug. Un slug mal formado o reservado responde 404 sin consultar
// la base; un slug inexistente o de un negocio inactivo responde el mismo 404 (NEG-005, NEG-006).
const crearResolverNegocio =
  (obtenerSlug: (req: Request) => string) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = obtenerSlug(req);

      if (!esSlugValido(slug)) {
        throw new NotFoundError(MENSAJE_NEGOCIO_NO_ENCONTRADO);
      }

      const negocio = await negocioService.resolverPorSlug(slug);

      if (!negocio) {
        throw new NotFoundError(MENSAJE_NEGOCIO_NO_ENCONTRADO);
      }

      req.idNegocio = negocio.id;
      req.negocio = negocio;
      next();
    } catch (error) {
      next(error);
    }
  };

// Negocio del slug de la ruta (`/negocios/:slug/...`).
export const resolverNegocio = crearResolverNegocio((req) => String(req.params.slug));

// Negocio fijo para las rutas viejas sin slug (compatibilidad con `principal`, hasta el frontend por slug).
export const resolverNegocioFijo = (slug: string) => crearResolverNegocio(() => slug);
