/**
 * 简易 IP 维度限流 —— 不引第三方依赖。
 *
 * 设计：
 *  - 内存 Map<ip, {count, resetAt}>，按 windowMs 滑动窗口
 *  - 每分钟自动清理过期条目（避免长期运行内存泄漏）
 *  - 命中上限时返回 429 + Retry-After 响应头
 *
 * 适用场景：仅对网易云会触发的"操作频繁，请稍候"型端点（如 /search），
 * 避免单个 IP 把 NCM 打爆 → 反过来连累所有用户。
 *
 * 注意：本进程内内存计数；多实例部署需改 Redis。
 */

function createIpLimiter(opts) {
  const windowMs = (opts && opts.windowMs) || 60 * 1000 // 默认 1 分钟
  const max = (opts && opts.max) || 30 // 默认每窗口 30 次
  const buckets = new Map()

  // 周期性清理过期条目
  const sweepInterval = setInterval(() => {
    const now = Date.now()
    for (const [ip, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(ip)
    }
  }, windowMs)
  sweepInterval.unref() // 不阻止 Node 退出

  function middleware(req, res, next) {
    // trust proxy 已开启，可信 X-Forwarded-For
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    let bucket = buckets.get(ip)

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(ip, bucket)
    }

    bucket.count += 1
    const remaining = Math.max(0, max - bucket.count)
    const resetSec = Math.ceil((bucket.resetAt - now) / 1000)

    res.set('X-RateLimit-Limit', String(max))
    res.set('X-RateLimit-Remaining', String(remaining))
    res.set('X-RateLimit-Reset', String(resetSec))

    if (bucket.count > max) {
      res.set('Retry-After', String(resetSec))
      return res.status(429).json({
        code: 429,
        msg: `请求过于频繁，请 ${resetSec} 秒后再试`,
        retryAfter: resetSec,
      })
    }

    next()
  }

  // 暴露内部状态便于测试
  middleware._buckets = buckets
  middleware._stop = () => clearInterval(sweepInterval)
  return middleware
}

module.exports = { createIpLimiter }