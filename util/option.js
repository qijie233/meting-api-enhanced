const { cookieObjToString } = require('./index')

const createOption = (query, crypto = '') => {
  // cookie 来源优先级：
  // 1. 字符串（用户通过 Header 或 query 传入）
  // 2. 对象（用户通过 POST body 传入，被 server.js 解析为对象）
  // 3. 回落逻辑：登录路由不回落 NETEASE_COOKIE，其余回落
  const userObj = typeof query.cookie === 'object' && Object.keys(query.cookie).length > 0
  const cookie = typeof query.cookie === 'string' && query.cookie.length > 0
    ? query.cookie
    : userObj
      ? cookieObjToString(query.cookie)
      : query._skipEnvCookie ? '' : process.env.NETEASE_COOKIE
  // Debug log
  if (process.env.DEBUG_COOKIE) {
    console.log('[DEBUG cookie] query.cookie type:', typeof query.cookie, 'len:', query.cookie ? query.cookie.length : 0)
    console.log('[DEBUG cookie] final cookie len:', cookie ? cookie.length : 0, 'has MUSIC_U:', cookie ? cookie.includes('MUSIC_U=') : false)
  }
  return {
    crypto: query.crypto || crypto || '',
    cookie: cookie,
    _skipEnvCookie: query._skipEnvCookie,
    ua: query.ua || '',
    proxy: query.proxy,
    realIP: query.realIP,
    randomCNIP:
      process.env.ENABLE_RANDOM_CN_IP === 'true'
        ? !['false', false].includes(query.randomCNIP)
        : ['true', true].includes(query.randomCNIP),
    e_r: query.e_r || undefined,
    domain: query.domain || '',
    checkToken: query.checkToken || false,
  }
}
module.exports = createOption
