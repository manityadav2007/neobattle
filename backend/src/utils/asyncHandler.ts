import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Shared higher-order async route handler wrapper.
 * Guarantees that any uncaught Promise rejection inside an async route handler
 * is caught and safely forwarded to Express's central error handling middleware,
 * preventing unhandled promise rejections from crashing the Node process.
 */
export const asyncHandler = (
  fn: (req: any, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
