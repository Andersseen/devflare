import { Request, Response, NextFunction } from 'express';

export const validateProductFilter = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { minPrice, maxPrice, page, pageSize } = req.query;
  const errors: string[] = [];

  if (minPrice !== undefined) {
    const min = Number(minPrice);
    if (isNaN(min) || min < 0) {
      errors.push('minPrice must be a non-negative number');
    }
  }

  if (maxPrice !== undefined) {
    const max = Number(maxPrice);
    if (isNaN(max) || max < 0) {
      errors.push('maxPrice must be a non-negative number');
    }
  }

  if (minPrice !== undefined && maxPrice !== undefined) {
    const min = Number(minPrice);
    const max = Number(maxPrice);
    if (!isNaN(min) && !isNaN(max) && min > max) {
      errors.push('minPrice cannot be greater than maxPrice');
    }
  }

  if (page !== undefined) {
    const p = Number(page);
    if (isNaN(p) || p < 1) {
      errors.push('page must be a positive integer');
    }
  }

  if (pageSize !== undefined) {
    const ps = Number(pageSize);
    if (isNaN(ps) || ps < 1 || ps > 100) {
      errors.push('pageSize must be a positive integer (max 100)');
    }
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
    });
    return;
  }

  next();
};

export const validateProductId = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { id } = req.params;

  if (!id || id.trim() === '') {
    res.status(400).json({
      success: false,
      error: 'Product ID is required',
    });
    return;
  }

  next();
};
