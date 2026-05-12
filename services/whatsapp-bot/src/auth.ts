import type { Request, Response, NextFunction } from "express";

import { config } from "./config.js";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || token !== config.apiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
