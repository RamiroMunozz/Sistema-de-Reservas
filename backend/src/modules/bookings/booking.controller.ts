import { Request, Response, NextFunction } from "express";
import { BookingStatus, PaymentMethod } from "@prisma/client";
import { AppError } from "../../core/errors/AppError.js";
import { BookingService } from "./booking.service.js";

const bookingService = new BookingService();

interface CuerpoCrearReserva {
  courtId: string;
  startTime: string;
  endTime: string;
  paymentMethod?: PaymentMethod;
}

interface CuerpoCrearReservaAdmin extends CuerpoCrearReserva {
  paymentMethod: PaymentMethod;
}

interface CuerpoActualizarEstado {
  status: BookingStatus;
}

const obtenerMensajeDeError = (error: unknown, mensajePorDefecto: string) =>
  (error instanceof Error && error.message) || mensajePorDefecto;

const responderNoAutenticado = (res: Response) =>
  res.status(401).json({ message: "Usuario no autenticado." });

export class BookingController {
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idUsuario = req.user?.userId;

      if (!idUsuario) {
        return responderNoAutenticado(res);
      }

      const { courtId, startTime, endTime, paymentMethod } =
        req.body as CuerpoCrearReserva;

      const booking = await bookingService.createBooking(
        { courtId, startTime, endTime, paymentMethod },
        idUsuario,
      );

      return res.status(201).json(booking);
    } catch (error: unknown) {
      if (error instanceof AppError) {
        return next(error);
      }

      // Retorna 400 Bad Request con el mensaje específico de validación
      return res.status(400).json({
        message: obtenerMensajeDeError(error, "Error al crear la reserva"),
      });
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
      const id = req.params.id as string;

      if (!idUsuario) {
        return responderNoAutenticado(res);
      }

      if (!id) {
        return res.status(400).json({ message: "ID de reserva no provisto." });
      }

      const updated = await bookingService.cancelBooking(id, idUsuario);
      return res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  };

  getAvailability = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courtId, date } = req.query;

      if (!courtId || !date) {
        return res
          .status(400)
          .json({ message: "courtId y date son obligatorios." });
      }

      const occupied = await bookingService.getOccupiedSlots(
        courtId as string,
        date as string,
      );

      return res.status(200).json(occupied);
    } catch (error) {
      next(error);
    }
  };

  getDailyAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const date = String(req.query.date);

      if (!date || date === "undefined") {
        return res
          .status(400)
          .json({ message: "El parámetro date es requerido (YYYY-MM-DD)." });
      }

      const bookings = await bookingService.getDailyBookingsForAdmin(date);
      return res.status(200).json(bookings);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { status } = req.body as CuerpoActualizarEstado;

      if (!id || !status) {
        return res.status(400).json({ message: "ID y status son requeridos." });
      }

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

      const { courtId, startTime, endTime, paymentMethod } =
        req.body as CuerpoCrearReservaAdmin;

      if (!courtId || !startTime || !endTime) {
        return res.status(400).json({ message: "Faltan campos obligatorios." });
      }

      const booking = await bookingService.createAdminBooking(
        { courtId, startTime, endTime, paymentMethod },
        idAdmin,
      );

      return res.status(201).json(booking);
    } catch (error: unknown) {
      if (error instanceof AppError) {
        return next(error);
      }

      return res.status(400).json({
        message: obtenerMensajeDeError(
          error,
          "Error al crear la reserva manual.",
        ),
      });
    }
  };
}
