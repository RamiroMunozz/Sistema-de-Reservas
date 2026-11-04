import { Router } from "express";
import { limitadorAutenticacion } from "../../core/middlewares/limitadorAutenticacion.js";
import { AuthController } from "./auth.controller.js";

const router = Router();
const controller = new AuthController();

router.post("/register", limitadorAutenticacion, controller.register);
router.post("/login", limitadorAutenticacion, controller.login);

export { router as authRoutes };
