import type { JwtPayload } from "../config/security.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
