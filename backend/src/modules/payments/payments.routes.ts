import { Router } from "express";
import { authenticate } from "../../core/middlewares/auth.js";
import { soloDueno } from "../../core/middlewares/negocio.js";
import { PaymentController } from "./payment.controller.js";

const router = Router();
const paymentController = new PaymentController();

// Ruta para crear preferencia
router.post(
  "/create-preference",
  authenticate,
  paymentController.createPreference,
);

// Reembolso manual de un pago registrado (solo DUENO, PAG-024)
router.post(
  "/admin/payments/:paymentId/refund",
  soloDueno,
  paymentController.refundPayment,
);

// Webhook de Mercado Pago
router.post("/webhook", paymentController.handleWebhook);

export { router as paymentRoutes };
export default router;
