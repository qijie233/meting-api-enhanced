/**
 * 调用统计核心模块
 *
 * 提供两个独立计数器（api-enhanced 整体、/meting 子集），
 * 各有 total_calls / today_calls / last_call_date 三个字段。
 *
 * - 数据落盘到 data/api_stats.json 与 data/meting_stats.json
 * - Node 是单线程 JS，fs.writeFileSync 不会被其他 JS 切片打断，
 *   因此 read-modify-write 全程是原子的，无需队列/锁
 * - 跨日自动重置 today_calls
 *
 * 字段格式与 meting 原 PHP 版（meting/index.php:42-46）保持一致：
 *   { total_calls, today_calls, last_call_date }
 */

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const API_STATS_PATH = path.join(DATA_DIR, 'api_stats.json')
const METING_STATS_PATH = path.join(DATA_DIR, 'meting_stats.json')

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function emptyStats() {
  return { total_calls: 0, today_calls: 0, last_call_date: '' }
}

function readStatsSync(filepath) {
  try {
    // 先 statSync 触碰文件元数据，绕过 Windows 文件系统缓存导致的过期读取
    fs.statSync(filepath)
    const raw = fs.readFileSync(filepath, 'utf-8')
    const data = JSON.parse(raw)
    return {
      total_calls: data.total_calls || 0,
      today_calls: data.today_calls || 0,
      last_call_date: data.last_call_date || '',
    }
  } catch (_) {
    return emptyStats()
  }
}

function ensureFile(filepath) {
  if (!fs.existsSync(path.dirname(filepath))) {
    fs.mkdirSync(path.dirname(filepath), { recursive: true })
  }
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, JSON.stringify(emptyStats()))
  }
}

ensureFile(API_STATS_PATH)
ensureFile(METING_STATS_PATH)

/**
 * 同步原子自增 —— 在 Node 单线程模型下，read + write 之间不会被
 * 其他 JS 切片打断，因此不需要 async/queue/lock。
 */
function incrementSync(filepath) {
  const data = readStatsSync(filepath)
  const today = todayStr()
  if (data.last_call_date !== today) {
    data.today_calls = 0
    data.last_call_date = today
  }
  data.total_calls += 1
  data.today_calls += 1
  fs.writeFileSync(filepath, JSON.stringify(data))
  return data
}

function recordApi() {
  return incrementSync(API_STATS_PATH)
}

function recordMeting() {
  return incrementSync(METING_STATS_PATH)
}

/**
 * 同步读取全部统计 —— 给 /stats 端点和页面内 fetch 用。
 */
function getAllSync() {
  return {
    api: readStatsSync(API_STATS_PATH),
    meting: readStatsSync(METING_STATS_PATH),
  }
}

module.exports = {
  recordApi,
  recordMeting,
  getAllSync,
  // 暴露路径供调试
  _paths: { API_STATS_PATH, METING_STATS_PATH },
}
