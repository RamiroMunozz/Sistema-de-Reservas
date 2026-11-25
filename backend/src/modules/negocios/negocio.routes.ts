import { Router } from "express";
import { limitadorCreacionPublica } from "../../core/middlewares/limitadorPublico.js";
import { resolverNegocio } from "../../core/middlewares/negocio.js";
import { BookingController } from "../bookings/booking.controller.js";
import { PublicController } from "../public/public.controller.js";
import { CourtController } from "../courts/court.controller.js";
import { NegocioController } from "./negocio.controller.js";

const router = Router();
const negocioController = new NegocioController();
const courtController = new CourtController();
const bookingController = new BookingController();
const publicController = new PublicController();

// Rutas públicas del catálogo por slug (decisión 3 del diseño): el resolutor fija el negocio activo
// del slug y todos los servicios filtran por él.
router.get("/:slug", resolverNegocio, negocioController.obtener);
router.get("/:slug/courts", resolverNegocio, courtController.getAll);
router.get("/:slug/courts/:id", resolverNegocio, courtController.getById);
router.get("/:slug/courts/:id/availability", resolverNegocio, courtController.getAvailability);
router.get("/:slug/bookings/availability", resolverNegocio, bookingController.getAvailability);
// El limitador va antes del resolutor: cuenta todas las solicitudes, también las de un slug inexistente (RES-030).
router.post("/:slug/bookings", limitadorCreacionPublica, resolverNegocio, publicController.crearReserva);

export { router as negocioRoutes };
