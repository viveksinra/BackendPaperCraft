const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// JWT token helpers
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signToken(payload, ttlSeconds = 60 * 60) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + ttlSeconds };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(full));
  const data = `${encHeader}.${encPayload}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${signature}`;
}

function verifyToken(token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid token');
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (expected !== s) throw new Error('bad signature');
  const payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('token expired');
  return payload;
}

// Password helpers
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  return { salt, hash };
}

function verifyPassword(password, record) {
  if (!record) return false;
  return hashPassword(password, record.salt) === record.hash;
}

// Cookie helpers
function getCookie(req, name) {
  const cookieHeader = req.headers['cookie'];
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const c of cookies) {
    const idx = c.indexOf('=');
    if (idx === -1) continue;
    const k = decodeURIComponent(c.slice(0, idx));
    if (k === name) return decodeURIComponent(c.slice(idx + 1));
  }
  return null;
}

function attachAuthFromCookie(req) {
  // First try Authorization header (Bearer token)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    try {
      const payload = verifyToken(token);
      req.auth = payload;
      return payload;
    } catch (_) {
      // If Bearer token fails, fall through to cookie
    }
  }
  
  // Fallback to cookie
  const token = getCookie(req, 'seo_auth');
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    req.auth = payload;
    return payload;
  } catch (_) {
    return null;
  }
}

// Auth middleware
function ensureAuth(req, res, next) {
  if (req.auth && req.auth.sub) return next();
  attachAuthFromCookie(req);
  if (req.auth && req.auth.sub) return next();
  return res.status(401).sendEnvelope('unauthenticated', 'error');
}

// Rate limiting for login
const loginAttempts = Object.create(null);
function loginRateLimit(windowMs = 5 * 60 * 1000, max = 10) {
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').toString();
    const key = `${req.tenantId}|${ip}`;
    const now = Date.now();
    if (!loginAttempts[key]) loginAttempts[key] = [];
    loginAttempts[key] = loginAttempts[key].filter((t) => now - t < windowMs);
    if (loginAttempts[key].length >= max) {
      return res.status(429).sendEnvelope('too many login attempts, slow down', 'error');
    }
    loginAttempts[key].push(now);
    next();
  };
}

module.exports = {
  signToken,
  verifyToken,
  createPasswordRecord,
  verifyPassword,
  getCookie,
  attachAuthFromCookie,
  ensureAuth,
  loginRateLimit
};

