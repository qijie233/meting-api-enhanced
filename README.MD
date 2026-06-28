# meting-api-enhanced

**完全兼容 meting 协议的网易云音乐 API** — 基于 [api-enhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced)，新增 meting 兼容端点、VIP 解锁、自动解灰、调用统计等增强功能。

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

---

## 核心能力对比

| | 原 api-enhanced | 本项目 |
|--|---------------|--------|
| meting 兼容端点 | | |
| `/meting` | | |
| VIP Cookie 全链路透传 | | |
| 灰色歌曲自动解灰 | | |
| 调用统计（总/今日） | | |
| 听歌打卡 | | |
| ~400 个原生 API 端点 | | |

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
# 默认端口 3000
node app.js

# 自定义端口（Linux/macOS）
PORT=4000 node app.js

# Windows PowerShell
$env:PORT=4000; node app.js
```

服务启动后访问：

| 页面 | 地址 |
|------|------|
| API 服务首页 | http://localhost:3000/ |
| **meting 文档页** | http://localhost:3000/meting.html |
| 听歌打卡示例 | http://localhost:3000/scrobble.html |

---

## meting 兼容端点 `/meting`

完全兼容 [injahow/meting-api](https://github.com/injahow/meting-api) 协议，APlayer / MetingJS 可直接对接，无需修改任何前端代码。

### 在线测试示例

```
http://localhost:3000/meting/?type=url&id=33894312
http://localhost:3000/meting/?type=url&id=416892104&br=2000      ← FLAC 无损
http://localhost:3000/meting/?type=pic&id=33894312&cover=500
http://localhost:3000/meting/?type=lrc&id=33894312              ← 含中文翻译合并
http://localhost:3000/meting/?type=song&id=33894312
http://localhost:3000/meting/?type=playlist&id=2619366284
http://localhost:3000/meting/?type=search&id=Adele&limit=5
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| type | name · artist · url · pic · lrc · song · playlist · search | **必填** |
| id | 歌曲/歌单 ID；type=search 时为搜索关键词 | **必填** |
| server | 数据源（netease / tencent / xiami / kugou / baidu / kuwo） | netease（其他静默忽略） |
| br | 音质（仅 type=url）：320 / 192 / 128 / 2000(flac) | 320 |
| cover | 封面分辨率（仅 type=pic） | 300 |
| limit | 搜索条数（type=search） | 30 |
| page | 搜索页码（type=search） | 1 |
| search_type | 平台搜索类型（type=search） | 1（单曲） |

### APlayer / MetingJS 集成

```html
<script>
  window.meting_api = 'http://你的域名:3000/meting/?server=:server&type=:type&id=:id&auth=:auth&r=:r'
</script>
<script src="https://cdn.jsdelivr.net/npm/meting@2/dist/Meting.min.js"></script>

<meting-js server="netease" type="playlist" id="2619366284"></meting-js>
```

#### VIP 支持（nginx 反代示例）

```nginx
location /meting/ {
    proxy_pass http://localhost:3000/meting/;
    proxy_set_header Cookie "MUSIC_U=你的真实token";
}
```

---

## 灰色歌曲自动解灰

歌曲因版权或 VIP 限制无法直接获取时，底层自动调用 matchID 走替代音源（酷我、咪咕、QQ 等），**无需任何额外配置**：

```bash
# 自动 302 重定向到可播放的替代音源 URL
curl -I "http://localhost:3000/meting/?type=url&id=灰色歌曲ID"
```

---

## VIP 解锁（原生端点）

所有 ~400 个原生 API 端点均支持 VIP Cookie 透传：

```bash
curl -H "Cookie: MUSIC_U=你的token" \
  "http://localhost:3000/song/url/v1?id=1385117201&level=lossless"
```

---

## 调用统计

实时暴露 GET /stats 端点，文档页和首页底部每 10 秒自动刷新：

```json
{
  "api":   { "total_calls": 1234, "today_calls": 56 },
  "meting": { "total_calls": 789,  "today_calls": 34 }
}
```

- **api**：全部 API 请求（不含 /stats 自身）
- **meting**：所有带 type+id 的 /meting 请求（不含文档页跳转）
- 跨日自动重置 today_calls

---

## Docker 部署

```bash
docker pull moefurina/ncm-api:latest
docker run -d -p 3000:3000 --name ncm-api moefurina/ncm-api:latest
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务端口 |
| CORS_ALLOW_ORIGIN | * | 允许跨域请求的域名 |
| ENABLE_PROXY | false | 是否启用反向代理 |
| PROXY_URL | — | 代理服务地址（启用代理时） |
| ENABLE_RANDOM_CN_IP | false | 是否默认启用随机中国 IP |
| ENABLE_GENERAL_UNBLOCK | true | 是否启用全局自动解灰 |
| ENABLE_FLAC | true | 是否启用无损音质 |
| NETEASE_COOKIE | — | 默认网易云 Cookie |

完整配置示例见 .env.prod.example。

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
  scrobble.js        # 听歌打卡（明文版）
  scrobble_v1.js     # 听歌打卡（NCBL 加密版）
util/
  meting.js          # LRC 合并 / URL 构建 / 并发限流
  stats.js           # 同步原子计数器
  ncbl.js            # NCBL 加密工具
public/
  index.html         # API 服务首页
  meting.html       # meting 文档页（含全部测试链接）
  scrobble.html      # 听歌打卡示例
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
- 歌曲解锁（解灰）：自动走替代音源
- 听歌打卡：/scrobble（明文）、/scrobble/v1（NCBL 加密）

---

## 致谢

- 原作者 [Binaryify/NeteaseCloudMusicApi](https://github.com/binaryify/NeteaseCloudMusicApi) 为本项目基础
- [MoeFurina/NeteaseCloudMusicApiEnhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced) 提供持续维护与增强
- [metowolf/Meting](https://github.com/metowolf/Meting) 提供 meting 协议参考
- [injahow/meting-api](https://github.com/injahow/meting-api) 提供 meting 协议实现参考

---

## License

MIT ./LICENSE
