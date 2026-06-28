/**
 * GET /stats —— 返回两个 API 的调用统计
 *
 * 响应 JSON:
 * {
 *   api:    { total_calls, today_calls, last_call_date },
 *   meting: { total_calls, today_calls, last_call_date }
 * }
 *
 * 用途：
 * - 文档页底部实时展示调用次数
 * - 第三方监控集成
 *
 * 注意：本端点自身不会被记入 api 计数器（server.js 中间件会排除 /stats）
 */

const stats = require('../util/stats')

module.exports = (query, request) => {
  return {
    status: 200,
    body: stats.getAllSync(),
  }
}
