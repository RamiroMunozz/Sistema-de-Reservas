import type { NextFunction, Request, Response } from "express";
import { crearReservaInvitadoSchema } from "./public.dto.js";
import { ReservaInvitadoService } from "./reservaInvitado.service.js";

const reservaInvitadoService = new ReservaInvitadoService();

export class PublicController {
  crearReserva = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const datos = crearReservaInvitadoSchema.parse(req.body);
      const creada = await reservaInvitadoService.crear(datos);

      return res.status(201).json(creada);
    } catch (error) {
      next(error);
    }
  };
}
