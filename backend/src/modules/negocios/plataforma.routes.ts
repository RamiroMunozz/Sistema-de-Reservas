import { Router } from "express";
import { authenticate } from "../../core/middlewares/auth.js";
import { requireRole } from "../../core/middlewares/role.middleware.js";
import { NegocioController } from "./negocio.controller.js";

const router = Router();
const controller = new NegocioController();

// Rutas de la plataforma: solo el SUPER_ADMIN (NEG-005).
router.use(authenticate, requireRole(["SUPER_ADMIN"]));

router.post("/negocios", controller.crear);

export { router as plataformaRoutes };
