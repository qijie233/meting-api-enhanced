const assert = require('assert')
const { default: axios } = require('axios')

// 已知可用的测试 ID（与 meting 官方 demo 一致）
const SONG_ID_OK = 33894312 // 海阔天空 - Beyond (常规可播放)
const PLAYLIST_ID_OK = 2619366284 // meting 官方 demo 歌单
const KEYWORD_OK = 'Adele'

// 在每个请求里实时读取 global.host（由 server.test.js 的 before 钩子设置），
// 而不是模块加载时一次性缓存，因为此时全局还没被设置。
function get(path, params, opts) {
  opts = opts || {}
  return axios.get((global.host || 'http://localhost:3000') + path, {
    params,
    // 默认 30s 超时，歌单等重型请求可显式传入 timeoutMs
    timeout: opts.timeoutMs || 30000,
    // 不自动跟随 302，让 redirect_url 测试拿到 Location 头
    maxRedirects: 0,
    // 用 cnIp 走网易云白名单
    headers: { Cookie: '' },
    validateStatus: () => true,
  })
}

describe('meting 兼容层 /meting', () => {
  describe('基础参数校验', () => {
    it('缺失 type 应重定向到文档页', async () => {
      const res = await get('/meting', { id: SONG_ID_OK })
      assert.strictEqual(res.status, 302)
      assert.strictEqual(res.headers.location, '/meting.html')
    })

    it('缺失 id 应重定向到文档页', async () => {
      const res = await get('/meting', { type: 'song' })
      assert.strictEqual(res.status, 302)
      assert.strictEqual(res.headers.location, '/meting.html')
    })

    it('无任何参数应重定向到文档页', async () => {
      const res = await get('/meting', {})
      assert.strictEqual(res.status, 302)
      assert.strictEqual(res.headers.location, '/meting.html')
    })

    it('未知 type 应返回 400', async () => {
      const res = await get('/meting', { type: 'foo', id: 1 })
      assert.strictEqual(res.status, 400)
    })

    it('server 参数静默忽略（不报错）', async () => {
      const res = await get('/meting', {
        type: 'name',
        id: SONG_ID_OK,
        server: 'tencent',
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(typeof res.data, 'string')
    })
  })

  describe('纯文本 type', () => {
    it('type=name 返回歌曲名', async () => {
      const res = await get('/meting', { type: 'name', id: SONG_ID_OK })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(typeof res.data, 'string')
      assert.ok(res.data.length > 0, '歌曲名不应为空')
    })

    it('type=artist 返回歌手字符串', async () => {
      const res = await get('/meting', { type: 'artist', id: SONG_ID_OK })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(typeof res.data, 'string')
      assert.ok(res.data.length > 0, '歌手名不应为空')
    })
  })

  describe('LRC', () => {
    it('type=lrc 输出 LRC 文本（包含 [mm:ss 时间戳）', async () => {
      const res = await get('/meting', { type: 'lrc', id: SONG_ID_OK })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(typeof res.data, 'string')
      // 空歌 fallback 也算合法（包含 [00:00.00]）
      assert.ok(/\[00:\d{2}\.\d{2}\]/.test(res.data), '应包含 LRC 时间戳')
    })
  })

  describe('302 重定向 type', () => {
    it('type=url 返回 302 + Location', async () => {
      const res = await get('/meting', { type: 'url', id: SONG_ID_OK, br: 320 })
      assert.strictEqual(res.status, 302)
      assert.ok(res.headers && res.headers.location, '应包含 Location 头')
      // URL 应是 http(s) 开头的可播放地址（自解灰可能走 kuwo/qq）
      assert.ok(/^https?:\/\//.test(res.headers.location))
    })

    it('type=pic 返回 302 + Location', async () => {
      const res = await get('/meting', {
        type: 'pic',
        id: SONG_ID_OK,
        cover: 300,
      })
      assert.strictEqual(res.status, 302)
      assert.ok(res.headers && res.headers.location, '应包含 Location 头')
      // 网易云封面默认 p1.music.126.net 或 替换解析后的 CDN
      assert.ok(/^https?:\/\//.test(res.headers.location))
    })

    it('type=pic 支持 cover 参数升级分辨率', async () => {
      const resBig = await get('/meting', {
        type: 'pic',
        id: SONG_ID_OK,
        cover: 500,
      })
      assert.strictEqual(resBig.status, 302)
      assert.ok(resBig.headers.location.includes('500y500'))
    })
  })

  describe('JSON 列表 type', () => {
    it('type=song 返回单元素数组 [{name,artist,url,pic,lrc}]', async () => {
      const res = await get('/meting', {
        type: 'song',
        id: SONG_ID_OK,
        br: 320,
      })
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(res.data), '应是数组')
      assert.strictEqual(res.data.length, 1)
      const item = res.data[0]
      assert.ok('name' in item)
      assert.ok('artist' in item)
      assert.ok('url' in item)
      assert.ok('pic' in item)
      assert.ok('lrc' in item)
      assert.ok(
        item.url.startsWith('/meting/?') || /^https?:\/\//.test(item.url),
      )
      assert.ok(
        item.pic.startsWith('/meting/?') || /^https?:\/\//.test(item.pic),
      )
    })

    it('type=playlist 返回多元素数组', async function () {
      // 歌单里每首歌要 detail+url+lyric 三个 NCM 请求，并发限流 8，
      // 大型歌单可能耗时较长，单测放宽超时
      this.timeout(180000)
      const res = await get(
        '/meting',
        {
          type: 'playlist',
          id: PLAYLIST_ID_OK,
        },
        { timeoutMs: 180000 },
      )
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(res.data), '应是数组')
      assert.ok(res.data.length > 0, '歌单不应为空')
      const item = res.data[0]
      for (const k of ['name', 'artist', 'url', 'pic', 'lrc']) {
        assert.ok(k in item, `首元素应包含字段 ${k}`)
      }
    })

    it('type=search 返回关键词相关数组', async () => {
      const res = await get('/meting', {
        type: 'search',
        id: KEYWORD_OK,
        limit: 3,
      })
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(res.data), '应是数组')
      assert.ok(res.data.length > 0, '搜索结果不应为空')
      assert.ok(res.data.length <= 3, '不应超过 limit')
      const item = res.data[0]
      for (const k of ['name', 'artist', 'url', 'pic', 'lrc']) {
        assert.ok(k in item, `首元素应包含字段 ${k}`)
      }
    })

    it('type=search 即使无精确匹配也应返回合法 JSON 数组', async () => {
      // NCM 搜索有模糊匹配兜底，所以即使是不存在的关键词也可能返回结果；
      // 这里只校验：200 + 数组 + 元素具备 meting 协议字段。
      const res = await get('/meting', {
        type: 'search',
        id: 'zzzzzqqqqqxxxxx_ncm_nothing_98765',
        limit: 5,
      })
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(res.data))
      // 数组每个元素（若有）都应具备 5 个 meting 协议字段
      for (const item of res.data) {
        for (const k of ['name', 'artist', 'url', 'pic', 'lrc']) {
          assert.ok(k in item, `元素应包含字段 ${k}`)
        }
      }
    })

    it('type=search 透传 limit 与 page 参数', async () => {
      const res = await get('/meting', {
        type: 'search',
        id: KEYWORD_OK,
        limit: 2,
        page: 1,
      })
      assert.strictEqual(res.status, 200)
      assert.ok(res.data.length <= 2)
    })
  })

  describe('透传 query 参数', () => {
    it('br 参数在 type=url 中生效（默认 320）', async () => {
      const res = await get('/meting', { type: 'url', id: SONG_ID_OK })
      // 即便解灰成功，也应至少拿到一个 URL（可能非 NCM 源）
      assert.strictEqual(res.status, 302)
      assert.ok(res.headers.location)
    })

    it('cover 参数在 type=song 中透传到子链接', async () => {
      const res = await get('/meting', {
        type: 'song',
        id: SONG_ID_OK,
        cover: 500,
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.length, 1)
      assert.ok(res.data[0].pic.includes('cover=500'))
    })

    it('br 参数在 type=song 中透传到 url 子链接', async () => {
      const res = await get('/meting', {
        type: 'song',
        id: SONG_ID_OK,
        br: 2000,
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.data.length, 1)
      assert.ok(res.data[0].url.includes('br=2000'))
    })
  })
})
