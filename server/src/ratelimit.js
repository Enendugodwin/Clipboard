'use strict';
// Simple in-memory sliding-window rate limiter.
const buckets = new Map();
function rateLimit({ windowMs = 60000, max = 120 } = {}) {
  return (req, res, next) => {
    const key = req.ip || 'anon';
    const t = Date.now();
    let b = buckets.get(key);
    if (!b || t > b.reset) b = { count: 0, reset: t + windowMs };
    b.count += 1;
    buckets.set(key, b);
    if (b.count > max) return res.status(429).json({ error: 'Too many requests, slow down.' });
    next();
  };
}
function strictLimit(opts) { return rateLimit(Object.assign({ windowMs: 60000, max: 10 }, opts)); }
module.exports = { rateLimit, strictLimit };
