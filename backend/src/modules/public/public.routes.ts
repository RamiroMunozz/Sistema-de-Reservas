import { Router } from "express";
import {
  limitadorConsultaPublica,
  limitadorCreacionPublica,
} from "../../core/middlewares/limitadorPublico.js";
import { PublicController } from "./public.controller.js";

const router = Router();
const publicController = new PublicController();

// El limitador va antes de validar: cuenta todas las solicitudes (RES-030).
router.post("/bookings", limitadorCreacionPublica, publicController.crearReserva);

// Rutas por token (RES-028, RES-029, PAG-021): con su propio limitador de consulta.
router.get("/bookings/:token", limitadorConsultaPublica, publicController.consultarReserva);
router.patch(
  "/bookings/:token/cancel",
  limitadorConsultaPublica,
  publicController.cancelarReserva,
);
router.post(
  "/bookings/:token/payment",
  limitadorConsultaPublica,
  publicController.reintentarPago,
);

export { router as publicRoutes };
export default router;
