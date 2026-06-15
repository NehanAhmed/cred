import { Response } from "express"
import { ApiResponse } from "../types/api.types"

// Helper functions — don't repeat this logic in every controller
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = "Success",
  status = 200
) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  } satisfies ApiResponse<T>)
}

export const sendError = (
  res: Response,
  message = "Something went wrong",
  status = 500
) => {
  return res.status(status).json({
    success: false,
    message,
    error: message,
  } satisfies ApiResponse)
}