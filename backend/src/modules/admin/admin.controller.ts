import { Request, Response, NextFunction } from "express";
import { AdminService } from "./admin.service.js";
import {
  createCourtSchema,
  updateCourtSchema,
  metricsQuerySchema,
  idComplejoSchema,
  porcentajeSenaSchema,
} from "./admin.dto.js";
import { idCanchaSchema } from "../courts/court.dto.js";

export class AdminController {
  constructor(private readonly adminService = new AdminService()) {}

  createCourt = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validatedData = createCourtSchema.parse(req.body);
      const court = await this.adminService.createCourt(validatedData);
      res.status(201).json(court);
    } catch (error) {
      next(error);
    }
  };

  updateCourt = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = idCanchaSchema.parse(req.params);
      const validatedData = updateCourtSchema.parse(req.body);
      const court = await this.adminService.updateCourt(id, validatedData);
      res.status(200).json(court);
    } catch (error) {
      next(error);
    }
  };

  getDepositPercent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = idComplejoSchema.parse(req.params);
      const complejo = await this.adminService.getDepositPercent(id);
      res.status(200).json(complejo);
    } catch (error) {
      next(error);
    }
  };

  updateDepositPercent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = idComplejoSchema.parse(req.params);
      const datos = porcentajeSenaSchema.parse(req.body);
      const complejo = await this.adminService.updateDepositPercent(id, datos);
      res.status(200).json(complejo);
    } catch (error) {
      next(error);
    }
  };

  getMetrics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = metricsQuerySchema.parse(req.query);
      const metrics = await this.adminService.getMetrics(filters);
      res.status(200).json(metrics);
    } catch (error) {
      next(error);
    }
  };
}
