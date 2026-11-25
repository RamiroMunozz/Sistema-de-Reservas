import { Request, Response, NextFunction } from "express";
import { NegocioService } from "./negocio.service.js";
import { altaNegocioSchema } from "./negocio.dto.js";
import { NotFoundError } from "../../core/errors/AppError.js";

export class NegocioController {
  constructor(private readonly negocioService = new NegocioService()) {}

  crear = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const datos = altaNegocioSchema.parse(req.body);
      const resultado = await this.negocioService.crearConDueno(datos);
      res.status(201).json(resultado);
    } catch (error) {
      next(error);
    }
  };

  // El resolutor ya fijó el negocio activo del slug (NEG-005).
  obtener = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.negocio) {
      return next(new NotFoundError("Negocio no encontrado."));
    }

    res.status(200).json({ nombre: req.negocio.nombre, slug: req.negocio.slug });
  };
}
