import { Router } from "express";
import { BookingController } from "./booking.controller.js";
import { authenticate } from "../../core/middlewares/auth.js"; // Revisá la ruta de tu middleware
import { soloDueno } from "../../core/middlewares/negocio.js";

const router = Router();
const bookingController = new BookingController();

// 1. Rutas de administración (van antes de cualquier /:id)
router.get("/admin/daily", soloDueno, bookingController.getDailyAdmin);
router.get("/admin/all", soloDueno, bookingController.getAllAdmin);
router.patch("/admin/:id/status", soloDueno, bookingController.updateStatus);
router.post("/admin/create", soloDueno, bookingController.createAdmin);

// 2. Rutas de usuario
router.post("/", authenticate, bookingController.create);
router.get("/my-bookings", authenticate, bookingController.getMyBookings);
router.patch("/:id/cancel", authenticate, bookingController.cancel);

export default router;
