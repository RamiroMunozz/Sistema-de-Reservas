import { Router } from "express";
import { AdminController } from "./admin.controller.js";
import { soloDueno } from "../../core/middlewares/negocio.js";

const router = Router();
const controller = new AdminController();

// Todas las rutas requieren autenticación y rol DUENO (con su negocio)
router.use(soloDueno);

router.post("/courts", controller.createCourt);
router.patch("/courts/:id", controller.updateCourt);
router.get("/metrics", controller.getMetrics);
router.get("/complexes", controller.listarComplejos);
router.get("/complexes/:id/deposit-percent", controller.getDepositPercent);
router.patch("/complexes/:id/deposit-percent", controller.updateDepositPercent);

export { router as adminRoutes };
