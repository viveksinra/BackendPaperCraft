// Simple in-memory rate limiter suitable for admin endpoints
// Adds standard headers and returns JSON envelope on limit exceed

const buckets = new Map(); // key → { count, resetAt }

function keyFromRequest(req) {
  if (req && req.user && req.user._id) return `user:${req.user._id}`;
  return `ip:${req.ip || 'unknown'}`;
}

function createRateLimiter(options = {}) {
  const windowMs = Number.isFinite(options.windowMs) ? options.windowMs : 60_000;
  const max = Number.isFinite(options.max) ? options.max : 60;

  return function rateLimiter(req, res, next) {
    const key = keyFromRequest(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      return res.status(429).json({ message: 'Too many requests, please try again later.', variant: 'error' });
    }
    return next();
  };
}

module.exports = { createRateLimiter };


