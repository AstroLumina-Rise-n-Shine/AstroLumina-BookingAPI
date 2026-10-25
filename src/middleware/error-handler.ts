import type { Request, Response, NextFunction } from "express";
import axios from "axios";
import { env } from "../config/env.js";

export function calComErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const o = data as Record<string, unknown>;
  const err = o["error"];
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e["message"] === "string") return e["message"];
    return JSON.stringify(err);
  }
  if (typeof o["message"] === "string") return o["message"];
  return undefined;
}

export interface AppError extends Error {
  statusCode?: number;
  expose?: boolean;
  type?: string;
}

export function createError(statusCode: number, message: string): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.expose = statusCode < 500;
  return error;
}

export function payloadTooLargeHandler(
  err: AppError,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    err.message?.includes("entity.too.large") ||
    err.type === "entity.too.large"
  ) {
    res
      .status(413)
      .json({ error: "Request payload too large. Maximum size is 256KB." });
    return;
  }
  next(err);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found" });
}

export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("Unhandled error:", err);

  const isProduction = env.NODE_ENV === "production";

  if (axios.isAxiosError(err)) {
    const upstream = err.response?.status;
    const body = err.response?.data;
    const calMsg = calComErrorMessage(body);
    if (upstream && upstream >= 400 && upstream < 500) {
      res.status(upstream).json({
        error: calMsg ?? err.message ?? "Upstream request failed",
        ...(!isProduction && body !== undefined ? { details: body } : {}),
      });
      return;
    }
    res.status(502).json({
      error: isProduction ? "Bad gateway" : (calMsg ?? err.message),
      ...(!isProduction && body !== undefined ? { details: body } : {}),
    });
    return;
  }

  const appErr = err as AppError;
  const statusCode = appErr.statusCode ?? 500;

  const response: Record<string, unknown> = {
    error: isProduction ? "Internal server error" : (appErr.message ?? "Error"),
  };

  if (!isProduction && appErr instanceof Error) {
    response.stack = appErr.stack;
  }

  res.status(statusCode).json(response);
}
