import type { Response } from 'express';

/** Response envelope shared by every JSON endpoint. */
export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = 'Success',
  status = 200,
): void => {
  res.status(status).json({
    success: true,
    message,
    data,
  } satisfies ApiResponse<T>);
};

export const sendError = (
  res: Response,
  message = 'Something went wrong',
  status = 500,
): void => {
  res.status(status).json({
    success: false,
    message,
    error: message,
  } satisfies ApiResponse);
};
