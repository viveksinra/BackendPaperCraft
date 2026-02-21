/**
 * Centralized Error Handling Middleware for TalkDrill API
 * 
 * This middleware catches all errors thrown from controllers and formats them
 * according to the TalkDrill standard: {message: '', variant: '', myData?: any}
 */

const { BaseError, InsufficientLicensesError } = require('../utils/errors');

/**
 * Error handler middleware
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    userId: req.user?.id || 'anonymous',
    body: req.body,
    params: req.params
  });

  // If response was already sent, delegate to Express default error handler
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let message = 'Internal server error';
  let variant = 'error';
  let myData = undefined;


  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    variant = 'error';
  }
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    variant = 'error';
  }
  // Handle rate limiting errors
  else if (err.status === 429) {
    statusCode = 429;
    message = 'Too many requests, please try again later';
    variant = 'error';
  }
  // Handle multer file upload errors
  else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'File size too large';
    variant = 'error';
  }
  // Handle other known errors
  else if (err.status || err.statusCode) {
    statusCode = err.status || err.statusCode;
    message = err.message || 'An error occurred';
  }

  // Construct response according to TalkDrill standard
  const response = {
    message,
    variant
  };

  // Add myData if available
  if (myData !== undefined) {
    response.myData = myData;
  }

  // Send error response
  res.status(statusCode).json(response);
};

/**
 * Async error handler wrapper
 * Wraps async functions to catch errors and pass them to error middleware
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler - should be placed after all routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler
};