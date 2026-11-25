import type { NextFunction, Request, Response } from "express";
import { obtenerIdNegocio } from "../../core/middlewares/negocio.js";
import { crearReservaInvitadoSchema } from "./public.dto.js";
import { ReservaInvitadoService } from "./reservaInvitado.service.js";

const reservaInvitadoService = new ReservaInvitadoService();

export class PublicController {
  crearReserva = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const datos = crearReservaInvitadoSchema.parse(req.body);
      const creada = await reservaInvitadoService.crear(
        obtenerIdNegocio(req),
        datos,
      );

      return res.status(201).json(creada);
    } catch (error) {
      next(error);
    }
  };

  consultarReserva = async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json(await reservaInvitadoService.consultar(String(req.params.token)));
    } catch (error) {
      next(error);
    }
  };

  cancelarReserva = async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json(await reservaInvitadoService.cancelar(String(req.params.token)));
    } catch (error) {
      next(error);
    }
  };

  reintentarPago = async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json(
        await reservaInvitadoService.reintentarPago(String(req.params.token)),
      );
    } catch (error) {
      next(error);
    }
  };
}
