import { Request, Response, NextFunction } from "express";
import { BookingService } from "./booking.service.js";

const bookingService = new BookingService();

export class BookingController {
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // @ts-ignore
      const user = req.user;
      const userId = (user?.id || user?.userId || user?.sub) as string;
      const { courtId, startTime, endTime, paymentMethod } = req.body;

      const booking = await bookingService.createBooking(
        { courtId, startTime, endTime, paymentMethod },
        userId,
      );

      return res.status(201).json(booking);
    } catch (error: any) {
      // Retorna 400 Bad Request con el mensaje específico de validación
      return res
        .status(400)
        .json({ message: error.message || "Error al crear la reserva" });
    }
  };

  getMyBookings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // @ts-ignore
      const userId = (req.user?.id || req.user?.userId) as string;

      const bookings = await bookingService.getUserBookings(userId);
      return res.status(200).json(bookings);
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("--> REQ.USER COMPLETO:", (req as any).user);

      const user = (req as any).user;
      // Extrae ID cubriendo todas las estructuras comunes de JWT
      const userId =
        user?.id ||
        user?.userId ||
        user?.sub ||
        (typeof user === "string" ? user : null);
      const id = req.params.id as string;

      if (!userId) {
        console.error("No se pudo extraer userId de req.user:", user);
        return res.status(401).json({ message: "Usuario no autenticado." });
      }

      if (!id) {
        return res.status(400).json({ message: "ID de reserva no provisto." });
      }

      const updated = await bookingService.cancelBooking(id, userId);
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
}
