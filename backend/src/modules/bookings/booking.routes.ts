import { Router } from "express";
import { BookingController } from "./booking.controller.js";
import { authenticate } from "../../core/middlewares/auth.js"; // Revisá la ruta de tu middleware

const router = Router();
const bookingController = new BookingController();

router.post("/", authenticate, bookingController.create);
router.get("/my-bookings", authenticate, bookingController.getMyBookings);
router.patch("/:id/cancel", authenticate, bookingController.cancel);
router.get("/availability", bookingController.getAvailability);

export default router;
