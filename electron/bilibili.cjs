const { BrowserWindow, session } = require('electron');

// electron/bilibili.cjs
// The desktop half of the Shino lab's bilibili MV background.
//
// Two things the renderer cannot do for itself:
//   1. Talking to api.bilibili.com. It sends no CORS header, so a page fetch is refused; here the
//      request leaves from the main process through a session of its own that also keeps the login
//      cookies, and carries the Referer bilibili expects.
//   2. Logging in. The QR-code login is bilibili's own page in a small window on that same session;
//      once SESSDATA lands in its cookie jar the window closes and this module answers with the
//      account. Nothing is typed into the app, and the password never passes through the renderer.
//
// The video picture is fetched by the renderer's <video>, not here: that request is given a Referer
// in main.cjs (setupBilibiliMediaAccess), which is all the CDN asks for.

const PARTITION = 'persist:shino-bilibili';
const API_BASE = 'https://api.bilibili.com';
const LOGIN_URL = 'https://passport.bilibili.com/login';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ALLOWED_HOSTS = new Set(['api.bilibili.com', 'api.bilibili.tv']);
const REQUEST_TIMEOUT_MS = 15000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const LOGIN_POLL_MS = 1500;

/** Cookies bilibili hands anonymous visitors so search does not answer -412. */
async function ensureAnonymousCookies(ses) {
  const existing = await ses.cookies.get({ domain: '.bilibili.com' });
  if (existing.some(cookie => cookie.name === 'buvid3' && cookie.value)) return;
  try {
    const response = await ses.fetch(`${API_BASE}/x/frontend/finger/spi`, {
      headers: { 'User-Agent': USER_AGENT, Referer: 'https://www.bilibili.com/' },
    });
    const payload = await response.json();
    const buvid3 = payload?.data?.b_3;
    const buvid4 = payload?.data?.b_4;
    const expirationDate = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    for (const [name, value] of [['buvid3', buvid3], ['buvid4', buvid4]]) {
      if (!value) continue;
      await ses.cookies.set({
        url: 'https://www.bilibili.com/',
        name,
        value,
        domain: '.bilibili.com',
        path: '/',
        secure: true,
        httpOnly: false,
        expirationDate,
      });
    }
  } catch (error) {
    console.warn('[Bilibili] Could not obtain anonymous cookies:', error);
  }
}

function createBilibiliApi({ log = console } = {}) {
  // The bilibili session lives in its own partition. `session.fromPartition` can only be called
  // once the app is ready, so we resolve it lazily on first use (every call site here is reached
  // from an IPC handler, which fires after the app has started) instead of at module load.
  let sessionRef = null;
  const getSession = () => {
    if (!sessionRef) {
      sessionRef = session.fromPartition(PARTITION);
      sessionRef.setUserAgent(USER_AGENT);
    }
    return sessionRef;
  };
  let loginTask = null;

  const readCookie = async (name) => {
    const cookies = await getSession().cookies.get({ domain: '.bilibili.com' });
    return cookies.find(cookie => cookie.name === name && cookie.value)?.value ?? '';
  };

  const buildStatus = async () => {
    const sessData = await readCookie('SESSDATA');
    if (!sessData) return { state: 'signed-out', account: null, available: true };
    try {
      const response = await getSession().fetch(`${API_BASE}/x/web-interface/nav`, {
        headers: { 'User-Agent': USER_AGENT, Referer: 'https://www.bilibili.com/' },
      });
      const payload = await response.json();
      const data = payload?.data;
      if (!data?.isLogin || !data.mid) return { state: 'signed-out', account: null, available: true };
      return {
        state: 'signed-in',
        available: true,
        account: {
          mid: data.mid,
          uname: data.uname ?? '',
          face: typeof data.face === 'string' && data.face.startsWith('//') ? `https:${data.face}` : (data.face ?? ''),
          vip: (data.vipStatus ?? 0) > 0,
        },
      };
    } catch (error) {
      log.warn('[Bilibili] Could not read the account:', error);
      return { state: 'signed-out', account: null, available: true };
    }
  };

  const request = async (payload) => {
    const target = typeof payload?.url === 'string' ? payload.url : '';
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      throw new Error('Invalid bilibili request url.');
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new Error(`Forbidden bilibili host: ${parsed.hostname}`);
    }

    await ensureAnonymousCookies(getSession());
    const headers = { 'User-Agent': USER_AGENT, Referer: 'https://www.bilibili.com/', ...(payload.headers ?? {}) };
    delete headers.Cookie;
    delete headers.cookie;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await getSession().fetch(parsed.toString(), {
        method: typeof payload.method === 'string' ? payload.method : 'GET',
        headers,
        body: typeof payload.body === 'string' ? payload.body : undefined,
        signal: controller.signal,
      });
      return { ok: response.ok, status: response.status, bodyText: await response.text() };
    } finally {
      clearTimeout(timer);
    }
  };

  const openLogin = async () => {
    if (loginTask) return loginTask;
    loginTask = new Promise((resolve) => {
      let settled = false;
      let poller = null;
      let timeout = null;
      const win = new BrowserWindow({
        width: 460,
        height: 700,
        title: 'bilibili',
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          partition: PARTITION,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          spellcheck: false,
        },
      });

      const settle = async () => {
        if (settled) return;
        settled = true;
        if (poller) clearInterval(poller);
        if (timeout) clearTimeout(timeout);
        if (!win.isDestroyed()) win.destroy();
        resolve(await buildStatus());
      };

      poller = setInterval(() => {
        readCookie('SESSDATA')
          .then(value => { if (value) void settle(); })
          .catch(() => {});
      }, LOGIN_POLL_MS);
      timeout = setTimeout(() => { void settle(); }, LOGIN_TIMEOUT_MS);
      win.on('closed', () => { void settle(); });
      win.loadURL(LOGIN_URL).catch(error => {
        log.warn('[Bilibili] Could not open the login page:', error);
        void settle();
      });
    }).finally(() => {
      loginTask = null;
    });
    return loginTask;
  };

  const signOut = async () => {
    await getSession().clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'] });
    return buildStatus();
  };

  return {
    partition: PARTITION,
    getStatus: buildStatus,
    openLogin,
    signOut,
    request,
  };
}

/**
 * The CDN behind a bilibili video answers 403 unless the request looks like it comes from the site.
 * The renderer's <video> is given that header here, for bilibili's media hosts only.
 */
function setupBilibiliMediaAccess(defaultSession) {
  const BILIBILI_MEDIA_URLS = [
    '*://*.bilivideo.com/*',
    '*://*.bilivideo.cn/*',
    '*://*.hdslb.com/*',
    '*://*.bilibili.com/*',
  ];
  defaultSession.webRequest.onBeforeSendHeaders({ urls: BILIBILI_MEDIA_URLS }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders.Referer = 'https://www.bilibili.com/';
    // Only the picture/stream requests need this; a page load keeps its own UA.
    if (!requestHeaders['User-Agent']) requestHeaders['User-Agent'] = USER_AGENT;
    callback({ requestHeaders });
  });
}

module.exports = { createBilibiliApi, setupBilibiliMediaAccess, BILIBILI_PARTITION: PARTITION };
