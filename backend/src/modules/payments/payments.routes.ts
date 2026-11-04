import { Router } from "express";
import { authenticate } from "../../core/middlewares/auth.js";
import { PaymentController } from "./payment.controller.js";

const router = Router();
const paymentController = new PaymentController();

// Ruta para crear preferencia
router.post(
  "/create-preference",
  authenticate,
  paymentController.createPreference,
);

// Webhook de Mercado Pago
router.post("/webhook", paymentController.handleWebhook);

export { router as paymentRoutes };
export default router;
