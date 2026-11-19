import { Router } from "express";
import { AdminController } from "./admin.controller.js";
import { authenticate } from "../../core/middlewares/auth.js";
import { requireRole } from "../../core/middlewares/role.middleware.js";

const router = Router();
const controller = new AdminController();

// Todas las rutas requieren autenticación y rol ADMIN
router.use(authenticate);
router.use(requireRole(["ADMIN"]));

router.post("/courts", controller.createCourt);
router.patch("/courts/:id", controller.updateCourt);
router.get("/metrics", controller.getMetrics);
router.get("/complexes/:id/deposit-percent", controller.getDepositPercent);
router.patch("/complexes/:id/deposit-percent", controller.updateDepositPercent);

export { router as adminRoutes };
