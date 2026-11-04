import { Router } from "express";
import { BookingController } from "./booking.controller.js";
import { authenticate } from "../../core/middlewares/auth.js"; // Revisá la ruta de tu middleware
import { requireRole } from "../../core/middlewares/role.middleware.js";

const router = Router();
const bookingController = new BookingController();
const soloAdmin = [authenticate, requireRole(["ADMIN"])];

// 1. Rutas públicas / de consulta
router.get("/availability", bookingController.getAvailability);

// 2. Rutas de administración (van antes de cualquier /:id)
router.get("/admin/daily", soloAdmin, bookingController.getDailyAdmin);
router.patch("/admin/:id/status", soloAdmin, bookingController.updateStatus);
router.post("/admin/create", soloAdmin, bookingController.createAdmin);

// 3. Rutas de usuario
router.post("/", authenticate, bookingController.create);
router.get("/my-bookings", authenticate, bookingController.getMyBookings);
router.patch("/:id/cancel", authenticate, bookingController.cancel);

export default router;
