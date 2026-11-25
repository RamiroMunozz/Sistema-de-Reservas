import type { JwtPayload } from "../config/security.js";
import type { NegocioPublico } from "../../modules/negocios/negocio.service.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      idNegocio?: string;
      negocio?: NegocioPublico;
    }
  }
}
