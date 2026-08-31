import { Request, Response, NextFunction } from "express";
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
      const { bookingId } = req.body;

      if (!bookingId) {
        return res.status(400).json({ message: "El bookingId es requerido" });
      }

      const preference =
        await this.paymentService.createPaymentPreference(bookingId);
      return res.status(200).json(preference);
    } catch (error) {
      next(error);
    }
  };

  handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentId =
        req.body?.data?.id || req.query?.["data.id"] || req.query?.id;

      const type = req.body?.type || req.query?.type || req.query?.topic;

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
