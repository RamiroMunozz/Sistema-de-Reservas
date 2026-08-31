import { Request, Response, NextFunction } from "express";
import { CourtService } from "./court.service.js";
import {
  getCourtsQuerySchema,
  getCourtAvailabilityQuerySchema,
} from "./court.dto.js";

export class CourtController {
  constructor(private readonly courtService = new CourtService()) {}

  getAll = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = getCourtsQuerySchema.parse(req.query);
      const courts = await this.courtService.getAllCourts(filters);
      res.status(200).json(courts);
    } catch (error) {
      next(error);
    }
  };

  getById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = String(req.params.id);
      const court = await this.courtService.getCourtById(id);
      res.status(200).json(court);
    } catch (error) {
      next(error);
    }
  };

  getAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = String(req.params.id);
      const { date } = getCourtAvailabilityQuerySchema.parse(req.query);
      const availability = await this.courtService.getCourtAvailability(
        id,
        date,
      );
      res.status(200).json(availability);
    } catch (error) {
      next(error);
    }
  };
}
