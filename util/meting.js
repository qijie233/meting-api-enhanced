/**
 * meting 兼容层辅助函数
 *
 * 提供给 module/meting.js 使用，包括：
 *  - mergeLyric: LRC 行级合并（中文翻译以括号追加到原歌词行）
 *  - formatArtist: NCM 的 ar[] 数组转为 'A/B/C' 字符串
 *  - buildMetingUrl: 生成相对路径 /meting/?type=...&id=...
 */

// 空歌词的兜底（与 meting/index.php:286 保持完全一致）
const EMPTY_LRC_FALLBACK = '[00:00.00]这似乎是一首纯音乐呢，请尽情欣赏它吧！'

/**
 * 把 NCM 的 artists/ar 数组转成 'A/B/C' 字符串。
 * 与 meting/index.php:154 一致。
 */
function formatArtist(artists) {
  if (!Array.isArray(artists)) return ''
  return artists
    .map((a) => (typeof a === 'string' ? a : a && a.name))
    .filter(Boolean)
    .join('/')
}

/**
 * LRC 行级合并：把 tlyric 的中文翻译追加到 lyric 对应时间戳的行。
 * 算法移植自 meting/index.php:283-313，保持 1:1 行为。
 *
 * @param {string} lyric   原歌词 LRC 文本（可为 null/undefined）
 * @param {string} tlyric  翻译歌词 LRC 文本（可为 null/undefined）
 * @returns {string} 合并后的 LRC 文本；空 lyric 返回兜底文案
 */
function mergeLyric(lyric, tlyric) {
  if (!lyric) return EMPTY_LRC_FALLBACK
  if (!tlyric) return lyric

  // 第一步：把 tlyric 解析成 [时间戳前缀] -> 翻译文本 的 map
  const tlyricMap = {}
  const tlyricLines = tlyric.split('\n')
  for (let i = 0; i < tlyricLines.length; i++) {
    const v = tlyricLines[i]
    if (!v) continue
    const idx = v.indexOf(']')
    if (idx < 0) continue
    const time = v.substring(0, idx + 1)
    const text = v
      .substring(idx + 1)
      .trim()
      .replace(/\s\s+/g, ' ')
    tlyricMap[time] = text
  }

  // 第二步：遍历 lyric 行，找到匹配时间戳的翻译追加在括号中
  const lyricLines = lyric.split('\n')
  const out = new Array(lyricLines.length)
  for (let i = 0; i < lyricLines.length; i++) {
    const v = lyricLines[i]
    if (!v) {
      out[i] = v
      continue
    }
    const idx = v.indexOf(']')
    if (idx < 0) {
      out[i] = v
      continue
    }
    const time = v.substring(0, idx + 1)
    const cn = tlyricMap[time]
    if (cn && cn !== '//') {
      out[i] = v + ' (' + cn + ')'
    } else {
      out[i] = v
    }
  }
  return out.join('\n')
}

/**
 * 构建指向 /meting 自身的相对 URL（用于 song/playlist/search 返回的子链接）。
 * 模块拿不到 req，无法生成绝对地址，因此返回相对路径；前端播放器通过
 * window.meting_api 拼接。
 *
 * @param {string} type       url | pic | lrc
 * @param {string} songId     歌曲 ID
 * @param {string} server     数据源（保留字段，meting 客户端会校验，目前仅 netease）
 * @param {object} [opts]     { br, cover } 仅在显式传入时透传
 * @returns {string}
 */
function buildMetingUrl(type, songId, server, opts) {
  opts = opts || {}
  const params = ['type=' + encodeURIComponent(type)]
  if (server) params.push('server=' + encodeURIComponent(server))
  params.push('id=' + encodeURIComponent(String(songId)))
  if (opts.br != null && opts.br !== '') {
    params.push('br=' + encodeURIComponent(String(opts.br)))
  }
  if (opts.cover != null && opts.cover !== '') {
    params.push('cover=' + encodeURIComponent(String(opts.cover)))
  }
  return '/meting/?' + params.join('&')
}

/**
 * 简单并发限制：对异步任务数组，最多同时执行 limit 个。
 * 用于 type=playlist/type=search 时控制 N+1 请求的并发度。
 */
async function pMap(items, mapper, limit) {
  limit = Math.max(1, limit || 8)
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      try {
        results[idx] = await mapper(items[idx], idx)
      } catch (e) {
        results[idx] = null
      }
    }
  }
  const workers = []
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker())
  await Promise.all(workers)
  return results
}

module.exports = {
  formatArtist,
  mergeLyric,
  buildMetingUrl,
  pMap,
  EMPTY_LRC_FALLBACK,
}
