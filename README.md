# meting-api-enhanced

**完全兼容 meting 协议的网易云音乐 API** — 基于 [api-enhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced)，新增 meting 兼容端点、VIP 解锁、自动解灰、调用统计等增强功能。

[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

---

## 核心能力对比

| 功能 | 原 api-enhanced | 本项目 |
|------|---------------|--------|
| meting 兼容端点 `/meting` | ❌ 无 | ✅ 完全兼容 |
| VIP Cookie 全链路透传 | ❌ 无 | ✅ 支持 |
| 灰色歌曲自动解灰（酷我/咪咕/QQ） | ❌ 无 | ✅ 支持 |
| 调用统计（总/今日） | ❌ 无 | ✅ api + meting 双统计 |
| 听歌打卡（明文 + NCBL 加密） | ✅ 有 | ✅ 有 |
| ~400 个原生 API 端点 | ✅ 有 | ✅ 有（原封不动） |

---

## 快速开始

### 环境要求

- **Node.js 18+**
- 推荐 **pnpm**

### 安装

```bash
git clone https://github.com/qijie233/meting-api-enhanced.git
cd meting-api-enhanced
pnpm install
```

### 启动

```bash
# 默认端口 3002
node app.js

# 自定义端口（Linux/macOS）
PORT=4000 node app.js

# Windows PowerShell
$env:PORT=4000; node app.js
```

服务启动后访问：

| 页面 | 地址 |
|------|------|
| API 服务首页 | http://localhost:3002/ |
| **meting 文档页** | http://localhost:3002/meting.html |
| 听歌打卡示例 | http://localhost:3002/scrobble.html |

---

## meting 兼容端点 `/meting`

完全兼容 [injahow/meting-api](https://github.com/injahow/meting-api) 协议，APlayer / MetingJS 可直接对接，无需修改任何前端代码。

### 在线测试示例

```
http://localhost:3002/meting/?type=url&id=33894312
http://localhost:3002/meting/?type=url&id=416892104&br=2000      ← FLAC 无损
http://localhost:3002/meting/?type=pic&id=33894312&cover=500
http://localhost:3002/meting/?type=lrc&id=33894312              ← 含中文翻译合并
http://localhost:3002/meting/?type=song&id=33894312
http://localhost:3002/meting/?type=playlist&id=2619366284
http://localhost:3002/meting/?type=search&id=Adele&limit=5
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|--------|--------|
| `type` | `name` · `artist` · `url` · `pic` · `lrc` · `song` · `playlist` · `search` | **必填** |
| `id` | 歌曲/歌单 ID；`type=search` 时为搜索关键词 | **必填** |
| `server` | 数据源（`netease` · `tencent` · `xiami` · `kugou` · `baidu` · `kuwo`） | `netease`（其他静默忽略） |
| `br` | 音质（仅 `type=url`）：`320` / `192` / `128` / `2000`(flac) | `320` |
| `cover` | 封面分辨率（仅 `type=pic`） | `300` |
| `limit` | 搜索条数（`type=search`） | `30` |
| `page` | 搜索页码（`type=search`） | `1` |
| `search_type` | 平台搜索类型（`type=search`） | `1`（单曲） |

### APlayer / MetingJS 集成

```html
<script>
  window.meting_api = 'http://你的域名:3002/meting/?server=:server&type=:type&id=:id&auth=:auth&r=:r'
</script>
<script src="https://cdn.jsdelivr.net/npm/meting@2/dist/Meting.min.js"></script>

<meting-js server="netease" type="playlist" id="2619366284"></meting-js>
```

#### VIP 支持（nginx 反代示例）

```nginx
location /meting/ {
    proxy_pass http://localhost:3002/meting/;
    proxy_set_header Cookie "MUSIC_U=你的真实token";
}
```

---

## 灰色歌曲自动解灰

歌曲因版权或 VIP 限制无法直接获取时，底层自动调用 `matchID` 走替代音源（酷我、咪咕、QQ 等），**无需任何额外配置**：

```bash
# 自动 302 重定向到可播放的替代音源 URL
curl -I "http://localhost:3002/meting/?type=url&id=灰色歌曲ID"
```

---

## VIP 解锁（原生端点）

所有 ~400 个原生 API 端点均支持 VIP Cookie 透传：

```bash
curl -H "Cookie: MUSIC_U=你的token" \
  "http://localhost:3002/song/url/v1?id=1385117201&level=lossless"
```

---

## 调用统计

实时暴露 `GET /stats` 端点，文档页和首页底部每 10 秒自动刷新：

```json
{
  "api":   { "total_calls": 1234, "today_calls": 56 },
  "meting": { "total_calls": 789,  "today_calls": 34 }
}
```

- **api**：全部 API 请求（不含 `/stats` 自身）
- **meting**：所有带 `type`+`id` 的 `/meting` 请求（不含文档页跳转）
- 跨日自动重置 `today_calls`

---

## Docker 部署

```bash
docker pull moefurina/ncm-api:latest
docker run -d -p 3000:3000 --name ncm-api moefurina/ncm-api:latest
```

> 注意：Docker 镜像默认端口 3000，如需改为 3002，启动命令中加 `-e PORT=3002` 覆盖。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3002` | 服务端口 |
| `CORS_ALLOW_ORIGIN` | `*` | 允许跨域请求的域名 |
| `ENABLE_PROXY` | `false` | 是否启用反向代理 |
| `PROXY_URL` | — | 代理服务地址（启用代理时） |
| `ENABLE_RANDOM_CN_IP` | `false` | 是否默认启用随机中国 IP |
| `ENABLE_GENERAL_UNBLOCK` | `true` | 是否启用全局自动解灰 |
| `ENABLE_FLAC` | `true` | 是否启用无损音质 |
| `NETEASE_COOKIE` | — | 默认网易云 Cookie |

完整配置示例见 `.env.prod.example`。

### Cookie 配置（解锁 VIP 歌曲）

本 API 支持通过 `MUSIC_U` cookie 解锁 VIP / 付费歌曲。

**Cookie 填写在 `.env` 文件中**（已被 `.gitignore` 忽略，不会推送到 GitHub）：

```bash
# .env 文件
NETEASE_COOKIE=MUSIC_U=你的MUSIC_U值
```

#### 获取 MUSIC_U

1. 登录 [网易云音乐](https://music.163.com)
2. 按 F12 打开开发者工具 → **Network（网络）** 标签
3. 任意点击一首歌进行播放
4. 在 Network 中找到任意请求，查看 **Request Headers** 或 **Cookies**
5. 找到键为 `MUSIC_U` 的值，复制完整内容（注意：不只是 `MUSIC_U=` 后面的部分，而是整个 cookie 字符串）

#### 示例

```bash
# .env
PORT=3002
NETEASE_COOKIE=MUSIC_U=0073E89B4A1E556FBC730726251369415B7C2FDE26A5018F404B9A9AE45197B7D7E62D839893BF451E44AEDB418B3561A77F16544C001058C58384ED643DA78AA0F5F4530FF252CEE8AD5FF19637BE2257E4B047FD5777E077BD9F2C6B762B7097516B66F98B93AAE07740A0748B77B81343DAF44084CDE7451E76FA3974174CACA35E4117A5606D7AB0B89ED28D1C9F394926CAD5423D807A35CA0CF439F3D212AE5F3CF6B214D2285A2F9F87CA6E7B597E9556F3DF8566698D4E8F5D952B51BE4EF4F070E7E2117E59164C7BE121DA62CC239D17F37057B4E5BE23E82A7116DDD9E1699DC8DE987BB2A8923777BFF0AAAB32BD54BF5DA61C8C1D2C69315FC2254495AA5C54D02CB114328B01202921C3458966EBEB12FDCA5252BA500D46835B44CBEE3D7657B59A9F579BFD283E5FF97E2BD6DABE5A5E27EC3DF0D4834D28D2C5B688A73D2B009899AC1682B05895715F4B41AE61629E0A012D9364E23C3BECA8CEF2867340BFCB6B729116B4F5BB9F4A6232EEFB2824854599FC850C7E8499C4E0E1561AB1D0E2104177A446ACCFE5
```

#### 提示

- `MUSIC_U` 是登录凭证，**请勿泄露给他人**
- `.env` 文件不会推送到 GitHub（已在 `.gitignore` 中）
- 如无 cookie，VIP 歌曲可能无法播放，但普通歌曲不受影响

---

## 单元测试

```bash
pnpm test
```

---

## 项目结构

```
module/
  meting.js          # meting 兼容端点（/meting）
  stats.js            # 调用统计端点（/stats）
  scrobble.js        # 听歌打卡明文版）
  scrobble_v1.js     # 听歌打卡 NCBL 加密版）
util/
  meting.js          # LRC 合并 / URL 构建 / 并发限流
  stats.js           # 同步原子计数器
  ncbl.js            # NCBL 加密工具
public/
  index.html         # API 服务首页（含 meting 区块 + 统计卡片）
  meting.html        # meting 文档页（含全部测试链接）
  scrobble.html       # 听歌打卡示例
  qrlogin-nocookie.html  # 无 cookie QR 登录
server.js             # Express 服务器（路由 / 中间件 / 自动加载）
main.js               # npm SDK 入口
app.js               # CLI 启动入口
```

---

## 主要功能特性

- 登录/注册/验证码
- 用户信息、歌单、动态、播放记录
- 歌曲、专辑、歌手、MV、歌词、评论、排行榜
- 搜索、推荐、私人 FM、签到、云盘
- **歌曲解锁（解灰）**：自动走替代音源
- **听歌打卡**：`/scrobble`（明文）、`/scrobble/v1`（NCBL 加密）

---

## 致谢

- 原作者 [Binaryify/NeteaseCloudMusicApi](https://github.com/binaryify/NeteaseCloudMusicApi) 为本项目基础
- [MoeFurina/NeteaseCloudMusicApiEnhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced) 提供持续维护与增强
- [metowolf/Meting](https://github.com/metowolf/Meting) 提供 meting 协议参考
- [injahow/meting-api](https://github.com/injahow/meting-api) 提供 meting 协议实现参考

---

## License

[MIT](./LICENSE)
