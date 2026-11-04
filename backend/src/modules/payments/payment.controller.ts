import { Request, Response, NextFunction } from "express";
import {
  consultaWebhookSchema,
  crearPreferenciaSchema,
  cuerpoWebhookSchema,
} from "./payment.dto.js";
import { PaymentService } from "./payment.service.js";

export class PaymentController {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  createPreference = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const idUsuario = req.user?.userId;

      if (!idUsuario) {
        return res.status(401).json({ message: "Usuario no autenticado." });
      }

      const { bookingId } = crearPreferenciaSchema.parse(req.body);

      const preference = await this.paymentService.createPaymentPreference(
        bookingId,
        idUsuario,
      );
      return res.status(200).json(preference);
    } catch (error) {
      next(error);
    }
  };

  handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cuerpo = cuerpoWebhookSchema.parse(req.body);
      const consulta = consultaWebhookSchema.parse(req.query);

      const paymentId = cuerpo.data?.id || consulta["data.id"] || consulta.id;

      const type = cuerpo.type || consulta.type || consulta.topic;

      if (
        (type === "payment" ||
          type === "payment.created" ||
          type === "payment.updated") &&
        paymentId
      ) {
        await this.paymentService.processWebhook(String(paymentId));
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  };
}
