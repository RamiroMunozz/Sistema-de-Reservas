import { Router } from "express";
import { limitadorCreacionPublica } from "../../core/middlewares/limitadorPublico.js";
import { PublicController } from "./public.controller.js";

const router = Router();
const publicController = new PublicController();

// El limitador va antes de validar: cuenta todas las solicitudes (RES-030).
router.post("/bookings", limitadorCreacionPublica, publicController.crearReserva);

export { router as publicRoutes };
export default router;
