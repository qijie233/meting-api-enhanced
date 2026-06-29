const createOption = (query, crypto = '') => {
  const cookie = typeof query.cookie === 'string' && query.cookie.length > 0
    ? query.cookie
    : process.env.NETEASE_COOKIE
  // Debug log
  if (process.env.DEBUG_COOKIE) {
    console.log('[DEBUG cookie] query.cookie type:', typeof query.cookie, 'len:', query.cookie ? query.cookie.length : 0)
    console.log('[DEBUG cookie] final cookie len:', cookie ? cookie.length : 0, 'has MUSIC_U:', cookie ? cookie.includes('MUSIC_U=') : false)
  }
  return {
    crypto: query.crypto || crypto || '',
    cookie: cookie,
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
