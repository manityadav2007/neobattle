import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodSchema, target: ValidationTarget = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      req[target] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues || (error as any).errors || [];
        const first = issues[0];
        res.status(400).json({
          success: false,
          message: first?.message || 'Validation failed',
          errors: issues.map((e) => ({
            field: Array.isArray(e.path) ? e.path.join('.') : '',
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
