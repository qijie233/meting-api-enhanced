/**
 * meting 兼容层 —— 单端点 /meting
 *
 * 完全兼容 meting API 协议（PHP injahow/meting-api）：
 *   ?type=name|artist|url|pic|lrc|song|playlist|search
 *     &id=<songId|playlistId|keyword>
 *     [&server=netease|tencent|...]   ← 仅作保留字段，静默忽略（api-enhanced 仅 netease）
 *     [&br=320|2000|192|128]           ← url 音质
 *     [&cover=300]                     ← pic 封面分辨率
 *     [&limit=30] [&page=1] [&search_type=1]  ← search 专用
 *
 * - Cookie 头（特别是 MUSIC_U=...）由 server.js 自动解析并透传到 query.cookie，
 *   实现 VIP 权限。无需本模块处理。
 * - 自动解灰：URL 不可用或 fee 为 1/4 时调用 matchID 走替代音源。
 * - type=url / type=pic 返回 302 重定向（与 meting/index.php:332-339 一致）。
 * - 不修改任何现有模块或 server.js；本文件由 server.js 的自动路由挂载到 /meting。
 */

const createOption = require('../util/option.js')
const logger = require('../util/logger.js')
const stats = require('../util/stats')
const {
  formatArtist,
  mergeLyric,
  buildMetingUrl,
  metingBrToNcmBr,
  pMap,
} = require('../util/meting')

// 复用现有端点（不修改它们，纯 require 调用）
const songDetailModule = require('./song_detail')
const lyricModule = require('./lyric')
const songUrlModule = require('./song_url')
const songUrlMatchModule = require('./song_url_match')
const searchModule = require('./search')
const playlistDetailModule = require('./playlist_detail')

// meting 默认参数（与 meting/index.php:88-89, 137, 134, 167-170 一致）
const DEFAULT_BR = 320
const DEFAULT_COVER = 300
const DEFAULT_LIMIT = 30
const DEFAULT_PAGE = 1
const DEFAULT_SEARCH_TYPE = 1

// 并发上限：playlist/search 时对每首歌发起 detail+url+lyric 的 N+1 请求
const PARALLEL_LIMIT = 8

/**
 * 自动解灰：调用 song_url_match.js（其内部走 matchID）。
 * 返回替代音源 URL 字符串，失败返回空串。
 */
async function unblockUrl(songId) {
  if (process.env.DEBUG_METING) {
    console.log('[DEBUG unblockUrl] called for songId:', songId)
  }
  try {
    const res = await songUrlMatchModule({ id: songId })
    if (process.env.DEBUG_METING) {
      console.log('[DEBUG unblockUrl] response:', JSON.stringify(res).substring(0, 200))
    }
    const url = res && res.body && res.body.data
    if (process.env.DEBUG_METING) {
      console.log('[DEBUG unblockUrl] result:', typeof url, url ? url.substring(0, 100) : 'null')
    }
    return typeof url === 'string' ? url : ''
  } catch (e) {
    logger.warn('meting unblock failed for', songId, e && e.message)
    return ''
  }
}

/**
 * 判断 NCM 返回的歌曲项是否需要解灰：
 * - url 为空
 * - freeTrialInfo 非空（免费试唱）
 * 注意：fee 为 1/4 但有有效 url 时不需要解灰（cookie 足够）
 */
function needsUnblock(songItem) {
  if (!songItem) return true
  if (!songItem.url) return true
  if (songItem.freeTrialInfo) return true
  // 有 url 且不是 free trial，即使 fee 为 1/4 也不需要解灰
  return false
}

/**
 * 把 NCM song 对象转为 meting 协议中 song/playlist/search 的统一返回项。
 *
 * @param {object} song       NCM song 对象（含 id/name/ar/al）
 * @param {object} opts       { br, cover, server }
 * @param {object} query      原始 query，用于向内部模块透传 cookie
 * @param {function} request  server.js 注入的请求函数
 * @returns {object} { name, artist, url, pic, lrc }
 */
async function buildSongItem(song, opts, query, request) {
  const songId = song.id
  // 并行拉取 url + lyric（detail 已经传入，无需再拉）
  // br: meting 协议用 kbps，NCM 接口要 bps（否则 br=320 被丢弃，触发 30s 预览兜底）
  const [urlItem, lyricRes] = await Promise.all([
    songUrlModule(
      { id: String(songId), br: metingBrToNcmBr(opts.br), cookie: query.cookie },
      request,
    )
      .then(
        (res) => (res && res.body && res.body.data && res.body.data[0]) || null,
      )
      .catch((e) => {
        logger.warn(
          'meting buildSongItem: songUrl failed for',
          songId,
          e.message,
        )
        return null
      }),
    lyricModule({ id: songId, cookie: query.cookie }, request).catch((e) => {
      logger.warn('meting buildSongItem: lyric failed for', songId, e.message)
      return null
    }),
  ])

  // 自动解灰：url 不可用就试替代音源
  let finalUrl = ''
  if (process.env.DEBUG_METING) {
    console.log('[DEBUG meting] songId:', songId, 'urlItem:', urlItem ? {url: urlItem.url ? 'exists' : 'null', fee: urlItem.fee, time: urlItem.time, freeTrialInfo: urlItem.freeTrialInfo} : 'null')
  }
  if (needsUnblock(urlItem)) {
    if (process.env.DEBUG_METING) {
      console.log('[DEBUG meting] needsUnblock=true, calling unblockUrl')
    }
    finalUrl = await unblockUrl(songId)
    if (process.env.DEBUG_METING) {
      console.log('[DEBUG meting] unblockUrl result:', finalUrl ? 'has url' : 'empty')
    }
  } else if (urlItem) {
    if (process.env.DEBUG_METING) {
      console.log('[DEBUG meting] needsUnblock=false, using urlItem.url')
    }
    finalUrl = urlItem.url || ''
  }

  // 合并 LRC（中文翻译）
  let lrcText = ''
  if (lyricRes && lyricRes.body) {
    lrcText = mergeLyric(lyricRes.body.lyric, lyricRes.body.tlyric)
  }

  // picUrl 升级分辨率：NCM 默认 300x300，把尺寸替换为 opts.cover
  let picUrl = (song.al && song.al.picUrl) || ''
  if (picUrl && opts.cover && opts.cover !== 300) {
    picUrl =
      picUrl.replace(/\?param=\d+y\d+$/, '') +
      `?param=${opts.cover}y${opts.cover}`
  }

  return {
    name: song.name || '',
    artist: formatArtist(song.ar),
    url: buildMetingUrl('url', songId, opts.server, { br: opts.br }),
    pic: buildMetingUrl('pic', songId, opts.server, { cover: opts.cover }),
    lrc: buildMetingUrl('lrc', songId, opts.server),
  }
}

/**
 * 单曲：返回一个包含一首歌的 JSON 数组。
 */
async function handleSong(query, request, opts) {
  const res = await songDetailModule(
    { ids: String(query.id), cookie: query.cookie },
    request,
  )
  const song = res && res.body && res.body.songs && res.body.songs[0]
  if (!song) {
    return { status: 200, body: '[]' }
  }
  const item = await buildSongItem(song, opts, query, request)
  return {
    status: 200,
    body: JSON.stringify([item]),
  }
}

/**
 * 歌单：返回包含歌单所有歌曲的 JSON 数组。
 * 对每首歌并行（限流）调用 buildSongItem。
 */
async function handlePlaylist(query, request, opts) {
  const res = await playlistDetailModule(
    { id: query.id, cookie: query.cookie },
    request,
  )
  const tracks =
    (res && res.body && res.body.playlist && res.body.playlist.tracks) || []
  if (tracks.length === 0) {
    return { status: 200, body: '[]' }
  }
  const items = await pMap(
    tracks,
    (t) => buildSongItem(t, opts, query, request),
    PARALLEL_LIMIT,
  )
  const filtered = items.filter(Boolean)
  return { status: 200, body: JSON.stringify(filtered) }
}

/**
 * 搜索：返回包含搜索结果的 JSON 数组。
 */
async function handleSearch(query, request, opts) {
  const limit = parseInt(query.limit, 10) || DEFAULT_LIMIT
  const page = parseInt(query.page, 10) || DEFAULT_PAGE
  const searchType = parseInt(query.search_type, 10) || DEFAULT_SEARCH_TYPE
  const offset = (page - 1) * limit

  const res = await searchModule(
    {
      keywords: query.id,
      type: searchType,
      limit,
      offset,
      cookie: query.cookie,
    },
    request,
  )

  const songs =
    (res && res.body && res.body.result && res.body.result.songs) || []
  if (songs.length === 0) {
    return { status: 200, body: '[]' }
  }
  const items = await pMap(
    songs,
    (s) => buildSongItem(s, opts, query, request),
    PARALLEL_LIMIT,
  )
  const filtered = items.filter(Boolean)
  return { status: 200, body: JSON.stringify(filtered) }
}

module.exports = async (query, request) => {
  if (process.env.DEBUG_METING) {
    console.log('[DEBUG meting module] START, type:', query.type, 'id:', query.id)
  }
  const type = query.type
  const id = query.id

  // meting/index.php:77 — 没传 type/id 时交给 public 落地页处理。
  // 这里用 302 重定向到 public/meting.html 静态页（server.js:217 会强制
  // JSON Content-Type，静态文件绕过此限制）。
  // 注意：文档页跳转不计入 meting 统计（仅 api 计数器记录）。
  if (!type || !id) {
    return {
      status: 302,
      body: '',
      redirectUrl: '/meting.html',
    }
  }

  // meting 计数已由 server.js 中的 /meting 中间件统一处理（位于 apicache 之前），
  // 这里不再重复计数，避免因缓存命中而双倍计数。

  // 解析可选参数（与 meting/index.php:88-93 一致）
  const brRaw =
    query.br != null && query.br !== '' ? parseInt(query.br, 10) : DEFAULT_BR
  const coverRaw =
    query.cover != null && query.cover !== ''
      ? parseInt(query.cover, 10)
      : parseInt(query.size, 10) || DEFAULT_COVER
  const opts = {
    br: Math.max(1, brRaw),
    cover: Math.max(1, coverRaw),
    server: 'netease', // server 参数静默忽略，仅做保留字段
  }

  try {
    switch (type) {
      case 'name': {
        const res = await songDetailModule(
          { ids: String(id), cookie: query.cookie },
          request,
        )
        const name =
          (res.body &&
            res.body.songs &&
            res.body.songs[0] &&
            res.body.songs[0].name) ||
          ''
        return { status: 200, body: name }
      }

      case 'artist': {
        const res = await songDetailModule(
          { ids: String(id), cookie: query.cookie },
          request,
        )
        const song = res.body && res.body.songs && res.body.songs[0]
        return { status: 200, body: formatArtist(song && song.ar) }
      }

      case 'url': {
        if (process.env.DEBUG_METING) {
          console.log('[DEBUG handleUrl] id:', id, 'br:', opts.br, 'brNcm:', metingBrToNcmBr(opts.br), 'cookie exists:', !!query.cookie)
        }
        const urlRes = await songUrlModule(
          { id: String(id), br: metingBrToNcmBr(opts.br), cookie: query.cookie },
          request,
        )
        let dataItem =
          (urlRes.body && urlRes.body.data && urlRes.body.data[0]) || null
        if (process.env.DEBUG_METING) {
          console.log('[DEBUG handleUrl] dataItem:', dataItem ? {url: dataItem.url ? 'exists' : 'null', fee: dataItem.fee, time: dataItem.time, freeTrialInfo: dataItem.freeTrialInfo} : 'null')
        }
        let finalUrl = dataItem && dataItem.url
        if (process.env.DEBUG_METING) {
          console.log('[DEBUG handleUrl] needsUnblock:', needsUnblock(dataItem), 'finalUrl before unblock:', !!finalUrl)
        }
        if (!finalUrl || needsUnblock(dataItem)) {
          if (process.env.DEBUG_METING) {
            console.log('[DEBUG handleUrl] calling unblockUrl')
          }
          finalUrl = await unblockUrl(id)
          if (process.env.DEBUG_METING) {
            console.log('[DEBUG handleUrl] unblockUrl returned:', finalUrl ? 'url exists' : 'empty')
          }
        }
        if (!finalUrl) {
          return {
            status: 404,
            body: { code: 404, msg: 'No playable URL found' },
          }
        }
        return { status: 302, body: '', redirectUrl: finalUrl }
      }

      case 'pic': {
        const res = await songDetailModule(
          { ids: String(id), cookie: query.cookie },
          request,
        )
        let picUrl =
          (res.body &&
            res.body.songs &&
            res.body.songs[0] &&
            res.body.songs[0].al &&
            res.body.songs[0].al.picUrl) ||
          ''
        if (picUrl && opts.cover !== 300) {
          picUrl =
            picUrl.replace(/\?param=\d+y\d+$/, '') +
            `?param=${opts.cover}y${opts.cover}`
        }
        if (!picUrl) {
          return { status: 404, body: { code: 404, msg: 'No cover found' } }
        }
        return { status: 302, body: '', redirectUrl: picUrl }
      }

      case 'lrc': {
        const res = await lyricModule({ id: id, cookie: query.cookie }, request)
        const merged = mergeLyric(
          res.body && res.body.lyric,
          res.body && res.body.tlyric,
        )
        return { status: 200, body: merged }
      }

      case 'song':
        return await handleSong(query, request, opts)

      case 'playlist':
        return await handlePlaylist(query, request, opts)

      case 'search':
        return await handleSearch(query, request, opts)

      default:
        return {
          status: 400,
          body: { code: 400, msg: 'unknown type', type },
        }
    }
  } catch (err) {
    logger.error('meting error', type, id, err && err.message)
    return {
      status: 500,
      body: {
        code: 500,
        msg: (err && err.message) || 'internal error',
        type,
        id,
      },
    }
  }
}
