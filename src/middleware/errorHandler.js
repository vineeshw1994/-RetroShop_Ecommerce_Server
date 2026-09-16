import config from '../config/index.js';
import AppError from '../utils/AppError.js';

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || null;

  if (err.name === 'SequelizeValidationError') {
    statusCode = 422;
    message = 'Validation failed';
    errors = err.errors.map((e) => ({ field: e.path, message: e.message }));
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    const field = err.errors?.[0]?.path || 'value';
    message = `That ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is already in use`;
    errors = err.errors.map((e) => ({ field: e.path, message }));
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 409;
    message = 'This record is referenced elsewhere and cannot be changed';
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'That file is too large';
  }

  if (statusCode >= 500) {
    console.error(err);
    if (!(err instanceof AppError) && config.nodeEnv !== 'development') {
      message = 'Internal server error';
    }
  }

  res.status(statusCode).json({ success: false, message, errors });
};

export default errorHandler;
