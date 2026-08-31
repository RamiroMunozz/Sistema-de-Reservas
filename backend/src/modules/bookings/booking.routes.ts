import { Router } from "express";
import { BookingController } from "./booking.controller.js";
import { authenticate } from "../../core/middlewares/auth.js"; // Revisá la ruta de tu middleware

const router = Router();
const bookingController = new BookingController();

// 1. Rutas públicas / de consulta
router.get("/availability", bookingController.getAvailability);

// 2. Rutas de administración (van antes de cualquier /:id)
router.get("/admin/daily", authenticate, bookingController.getDailyAdmin);
router.patch("/admin/:id/status", authenticate, bookingController.updateStatus);
router.post("/admin/create", authenticate, bookingController.createAdmin);

// 3. Rutas de usuario
router.post("/", authenticate, bookingController.create);
router.get("/my-bookings", authenticate, bookingController.getMyBookings);
router.patch("/:id/cancel", authenticate, bookingController.cancel);

export default router;
