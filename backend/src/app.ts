import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { courtRoutes } from "./modules/courts/court.routes.js";
import bookingRoutes from "./modules/bookings/booking.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { errorHandler } from "./core/middlewares/errorHandler.js";
import { paymentRoutes } from "./modules/payments/payments.routes.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rutas de API v1
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/courts", courtRoutes);
app.use("/api/v1/bookings", bookingRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/payments", paymentRoutes);

// Manejador global de errores
app.use(errorHandler);

export default app;
