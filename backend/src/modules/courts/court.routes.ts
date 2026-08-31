import { Router } from "express";
import { CourtController } from "./court.controller.js";

const router = Router();
const controller = new CourtController();

router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.get("/:id/availability", controller.getAvailability);

export { router as courtRoutes };
