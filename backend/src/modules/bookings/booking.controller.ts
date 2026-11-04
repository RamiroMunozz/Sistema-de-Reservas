import { Request, Response, NextFunction } from "express";
import {
  actualizarEstadoSchema,
  consultaDiariaSchema,
  consultaDisponibilidadSchema,
  createBookingSchema,
  crearReservaAdminSchema,
  idReservaSchema,
} from "./booking.dto.js";
import { BookingService } from "./booking.service.js";

const bookingService = new BookingService();

const responderNoAutenticado = (res: Response) =>
  res.status(401).json({ message: "Usuario no autenticado." });

export class BookingController {
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idUsuario = req.user?.userId;

      if (!idUsuario) {
        return responderNoAutenticado(res);
      }

      const datos = createBookingSchema.parse(req.body);
      const booking = await bookingService.createBooking(datos, idUsuario);

      return res.status(201).json(booking);
    } catch (error) {
      next(error);
    }
  };

  getMyBookings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idUsuario = req.user?.userId;

      if (!idUsuario) {
        return responderNoAutenticado(res);
      }

      const bookings = await bookingService.getUserBookings(idUsuario);
      return res.status(200).json(bookings);
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idUsuario = req.user?.userId;

      if (!idUsuario) {
        return responderNoAutenticado(res);
      }

      const { id } = idReservaSchema.parse(req.params);
      const updated = await bookingService.cancelBooking(id, idUsuario);

      return res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  };

  getAvailability = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courtId, date } = consultaDisponibilidadSchema.parse(req.query);
      const occupied = await bookingService.getOccupiedSlots(courtId, date);

      return res.status(200).json(occupied);
    } catch (error) {
      next(error);
    }
  };

  getDailyAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date } = consultaDiariaSchema.parse(req.query);
      const bookings = await bookingService.getDailyBookingsForAdmin(date);

      return res.status(200).json(bookings);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idReservaSchema.parse(req.params);
      const { status } = actualizarEstadoSchema.parse(req.body);
      const updated = await bookingService.updateBookingStatus(id, status);

      return res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  };

  createAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idAdmin = req.user?.userId;

      if (!idAdmin) {
        return responderNoAutenticado(res);
      }

      const datos = crearReservaAdminSchema.parse(req.body);
      const booking = await bookingService.createAdminBooking(datos, idAdmin);

      return res.status(201).json(booking);
    } catch (error) {
      next(error);
    }
  };
}
