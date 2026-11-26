const { BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PassThrough, Readable } = require('node:stream');
// 取流故意不走 Electron 的 net：net 底层还是 Chromium 的网络栈，手工塞 Origin / Sec-Fetch-* 这类
// 受管请求头会被它直接判成非法并回 ERR_BLOCKED_BY_CLIENT（连字节都发不出去）。Node 的 http/https
// 是独立的实现，不受这一层管，头发什么就是什么，正好用来伪装成播放器去 CDN 拿流。
const nodeHttp = require('node:http');
const nodeHttps = require('node:https');
const { parseRangeHeader } = require('./transcode/protocol.cjs');

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
/** 在线视频播放用的本机协议：渲染进程读它，主进程把字节从 CDN 搬过来，顺路缓存。 */
const STREAM_SCHEME = 'folia-bili';
const STREAM_HOST = 'media';
const API_BASE = 'https://api.bilibili.com';
const LOGIN_URL = 'https://passport.bilibili.com/login';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ALLOWED_HOSTS = new Set(['api.bilibili.com', 'api.bilibili.tv']);
// 视频 CDN：下载直链用于「在线视频像本地视频那样播」。子域极多，而且同一个视频在不同地区会拿到
// 不同的 CDN（国内 *.bilivideo.com / *.hdslb.com，海外 *.akamaized.net 之类），所以按「主域名」
// 认，不逐个枚举子域。仍然只放行这一份白名单，避免下载接口被当成任意 URL 代理。
const MEDIA_DOMAINS = [
  'bilivideo.com',
  'bilivideo.cn',
  'bilivideo.net',
  'hdslb.com',
  'hdslb.org',
  'bilibili.com',
  'bilibili.cn',
  'bilibili.tv',
  'biliapi.net',
  'biliapi.com',
  'akamaized.net',
  'mountaintoys.cn',
  'szbdyd.com',
  'bdydns.com',
  'bag-cn.com',
  'bvcst.com',
];
const isAllowedMediaHost = (hostname) => MEDIA_DOMAINS.some(
  domain => hostname === domain || hostname.endsWith(`.${domain}`),
);
const REQUEST_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000;
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

function createBilibiliApi({ log = console, streamCacheDir = null } = {}) {
  // 在线视频的缓存目录：流过的字节落在这里，攒成完整文件后就成了离线可用的那份。
  const cacheDir = streamCacheDir;
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

  /**
   * upos 会给直链签一组参数：deadline（过期时间）+ upsig/og/oi（签名）。bilibili 的 CDN 域名换得很勤
   * （最近又出现了 *.edge.mountaintoys.cn 这种），只靠主域名白名单迟早被新域名挡住；反过来完全放开
   * 又成了任意 URL 代理。所以两条都认：域名命中白名单，或者带着这套签名参数——后者是 playurl 亲手
   * 签出来的地址，外部地址伪造不出来。
   */
  const hasMediaSignature = (parsed) => {
    const params = parsed.searchParams;
    return params.has('deadline') || params.has('upsig') || params.has('og') || params.has('oi');
  };

  /** 直链可能是协议相对地址（//upos-...），也可能是老的 http，统一规整成 https。 */
  const normalizeMediaUrl = (raw) => {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) throw new Error('Invalid bilibili media url.');
    const target = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      throw new Error('Invalid bilibili media url.');
    }
    const hostname = parsed.hostname.toLowerCase();
    const allowed = isAllowedMediaHost(hostname) || hasMediaSignature(parsed);
    // 老格式 durl 偶尔给 http 直链，统一升级到 https（这些 CDN 都支持），不放行明文。
    if (parsed.protocol === 'http:' && allowed) parsed.protocol = 'https:';
    if (parsed.protocol !== 'https:' || !allowed) {
      throw new Error(`Forbidden bilibili media host: ${hostname} (${parsed.protocol})`);
    }
    return parsed.toString();
  };

  /**
   * CDN 只认「像播放器发出来的请求」。renderer 直接 <audio src=直链> 会被拒，主进程裸 GET 同样会被拒，
   * 差别就在这里：
   *   - Referer 必须是这条视频自己的播放页，站点首页不够；
   *   - Sec-Fetch-* 要和媒体元素一致（dest=video / mode=no-cors / site=cross-site）；
   *   - 必须带 Range。upos 现在对没有 Range 的整段请求直接 403，这也是一直报 403 的真正原因；
   *   - Accept-Encoding 固定 identity，免得 Chromium 协商压缩、拿到的不是裸媒体字节。
   */
  const mediaHeaders = (bvid, withRange) => ({
    'User-Agent': USER_AGENT,
    Referer: bvid ? `https://www.bilibili.com/video/${bvid}` : 'https://www.bilibili.com/',
    Origin: 'https://www.bilibili.com',
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'identity',
    // 有的视频/节点认 Range，有的反而对 Range 敏感；两种都试，见 openUpstream 的变体循环。
    ...(withRange ? { Range: 'bytes=0-' } : {}),
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
  });

  /** upos 经常用 302 把人换到另一台机器上，直链签名跟着 Location 走，这里自己跟。 */
  const MAX_MEDIA_REDIRECTS = 4;

  // ---------------------------------------------------------------------------------------------
  // 在线视频的流式播放
  //
  // 播放器要的是一条能边读边播的地址，而不是一个下完才存在的文件。所以这里把带签名的直链收在主进程，
  // 给渲染进程一条 folia-bili://media/<id>/video.mp4：Chromium 的媒体栈按 Range 来要字节，我们转发
  // 给 CDN，收到的字节一边回给播放器、一边抄进缓存文件。播放和缓存是同一条流上的两件事，没有「先
  // 下载完再播」这一步；缓存攒够一个完整文件之后，同样的地址直接读盘，不再出网（离线也能重看）。
  // ---------------------------------------------------------------------------------------------

  const openStreams = new Map();
  /** 同时登记着的流条数上限（每点开一次视频算一条）。 */
  const MAX_OPEN_STREAMS = 32;

  /** 缓存文件名按「视频 + 画质」定：同一集换画质是另一份，重复点开则秒开。 */
  const cachePathsFor = (bvid, quality) => {
    if (!cacheDir) return null;
    const safe = (value, fallback) => String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '') || fallback;
    const base = path.join(cacheDir, `${safe(bvid, 'video')}-${safe(quality, 'auto')}`);
    return { final: `${base}.mp4`, part: `${base}.part` };
  };

  const fileSizeOf = async (target) => {
    try {
      const stat = await fs.promises.stat(target);
      return stat.isFile() ? stat.size : 0;
    } catch {
      return 0;
    }
  };

  /** 从 `bytes=N-` / `bytes=N-M` 里取起点；没有 Range 视作 0；后缀式 `bytes=-N` 返回 null。 */
  const rangeStartOf = (value) => {
    if (!value) return 0;
    const match = /^bytes=(\d*)-(\d*)$/i.exec(String(value).trim());
    if (!match) return null;
    return match[1] === '' ? null : Number(match[1]);
  };

  /** `bytes 0-1023/4567` 里的总长；`Content-Length` 只在整段响应上等于总长。 */
  const totalBytesOf = (response) => {
    const contentRange = String(response.headers['content-range'] || '');
    const fromRange = /\/(\d+)\s*$/.exec(contentRange);
    if (fromRange) return Number(fromRange[1]);
    const length = Number(response.headers['content-length'] || 0);
    return Number.isFinite(length) && length > 0 ? length : null;
  };

  /** 发一次 GET 并把响应头交回来（body 留给调用方读）。 */
  const requestUpstream = (target, headers) => new Promise((resolve, reject) => {
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      reject(new Error('Invalid bilibili media url.'));
      return;
    }
    const transport = targetUrl.protocol === 'http:' ? nodeHttp : nodeHttps;
    const request = transport.request(targetUrl, { method: 'GET', headers }, (response) => {
      resolve({ request, response });
    });
    request.on('error', reject);
    // 一个字节都不来的连接不配占着播放器，按空闲超时掐掉。
    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => request.destroy(new Error('Media stream stalled.')));
    request.end();
  });

  /** 跟着 302 走完再判断能不能用：CDN 换机器是常态，签名参数跟着 Location 一起走。 */
  const requestUpstreamFollowing = async (target, headers, hopsLeft = MAX_MEDIA_REDIRECTS) => {
    const opened = await requestUpstream(target, headers);
    const status = opened.response.statusCode || 0;
    const location = opened.response.headers.location;
    if (status >= 300 && status < 400 && location) {
      opened.response.resume();
      opened.request.destroy();
      if (hopsLeft <= 0) throw new Error('Too many media redirects.');
      let next;
      try {
        next = new URL(location, target).toString();
      } catch {
        throw new Error('Invalid media redirect.');
      }
      return requestUpstreamFollowing(next, headers, hopsLeft - 1);
    }
    return opened;
  };

  /**
   * CDN 偶尔会看指纹 cookie（buvid3 这一套）。Node 的 http/https 没有 cookie jar，也不认 Chromium
   * 的 partition，所以从 bilibili 的 session 里取出来手动拼进请求头。
   */
  const readMediaCookies = async () => {
    try {
      const cookies = await getSession().cookies.get({ domain: '.bilibili.com' });
      return cookies
        .filter((cookie) => ['buvid3', 'buvid4', 'SESSDATA', 'bili_jct'].includes(cookie.name) && cookie.value)
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ');
    } catch {
      return '';
    }
  };

  /** 主地址 403/404 时按 backup_url 依次换源；只在拿到响应头、还没往播放器写过字节的时候换。 */
  const openUpstream = async (entry, rangeHeader, cookieHeader) => {
    const askRange = /^bytes=\d*-\d*$/i.test(String(rangeHeader || '').trim())
      ? String(rangeHeader).trim()
      : 'bytes=0-';
    let lastError = null;
    for (const target of entry.urls) {
      for (const withRange of [true, false]) {
        const headers = mediaHeaders(entry.bvid, withRange);
        if (withRange) headers.Range = askRange;
        if (cookieHeader) headers.Cookie = cookieHeader;
        let opened;
        try {
          opened = await requestUpstreamFollowing(target, headers);
        } catch (error) {
          lastError = error;
          continue;
        }
        const { response } = opened;
        const status = response.statusCode || 0;
        const contentType = String(response.headers['content-type'] || '');
        // 被网关拦下时 CDN 会回 200 + 一段 HTML/JSON：这种字节喂给播放器只会让画面一片空白。
        if ((status !== 200 && status !== 206) || /^(text\/|application\/json)/i.test(contentType)) {
          response.resume();
          opened.request.destroy();
          lastError = Object.assign(new Error(`Media stream failed (${status || contentType || 'unknown'})`), { status });
          continue;
        }
        return opened;
      }
    }
    throw lastError ?? new Error('Media stream failed.');
  };

  /** 缓存已经攒成完整文件：按 Range 读盘，不出网。 */
  const serveCachedStream = (cachePath, size, rangeHeader, method) => {
    const range = parseRangeHeader(rangeHeader, size);
    if (range?.invalid) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
      'Content-Length': String(range ? range.end - range.start + 1 : size),
    };
    if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
    if (method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
    const stream = fs.createReadStream(cachePath, range ? { start: range.start, end: range.end } : undefined);
    return new Response(Readable.toWeb(stream), { status: range ? 206 : 200, headers });
  };

  /**
   * 打开一条视频流：收下签名地址，回一条本机协议地址。地址里的 id 是随机的，直链不出主进程。
   */
  const openVideoStream = async (payload) => {
    const rawList = Array.isArray(payload?.urls) ? payload.urls : [payload?.url];
    const urls = rawList.filter((item) => typeof item === 'string' && item.trim()).map(normalizeMediaUrl);
    if (!urls.length) throw new Error('Invalid bilibili media url.');
    const bvid = typeof payload?.bvid === 'string' ? payload.bvid : '';
    const quality = typeof payload?.quality === 'string' ? payload.quality : String(payload?.quality ?? '');
    await ensureAnonymousCookies(getSession());

    // 只留最近的几十条：地址只在这一轮播放里有意义，点过的视频不该一直攒在主进程里。
    if (openStreams.size >= MAX_OPEN_STREAMS) {
      const oldest = openStreams.keys().next().value;
      if (oldest) openStreams.delete(oldest);
    }
    const id = crypto.randomUUID();
    openStreams.set(id, { urls, bvid, cachePath: cachePathsFor(bvid, quality), caching: false });
    return { id, url: `${STREAM_SCHEME}://${STREAM_HOST}/${id}/video.mp4` };
  };

  /**
   * 协议的响应体：转发 CDN 的字节，同时在 `bytes=0-` 的顺读里抄一份到缓存。播放器要 seek 时会带新的
   * Range 过来，那种请求只转发不缓存——和已有的半截文件拼起来只会把文件写坏。
   */
  const handleStreamRequest = async (request) => {
    let parsed;
    try {
      parsed = new URL(request.url);
    } catch {
      return new Response('Not found', { status: 404 });
    }
    if (parsed.protocol !== `${STREAM_SCHEME}:` || parsed.hostname !== STREAM_HOST) {
      return new Response('Not found', { status: 404 });
    }
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    const entry = id ? openStreams.get(id) : null;
    if (!entry) return new Response('Not found', { status: 404 });

    const rangeHeader = request.headers.get('range');
    const cachePath = entry.cachePath?.final;
    const cachedSize = cachePath ? await fileSizeOf(cachePath) : 0;
    if (cachedSize > 0) return serveCachedStream(cachePath, cachedSize, rangeHeader, request.method);

    let opened;
    try {
      opened = await openUpstream(entry, rangeHeader, await readMediaCookies());
    } catch (error) {
      log.warn('[Bilibili] Could not open the video stream:', error);
      return new Response(String(error?.message || 'The video stream could not be opened'), { status: 502 });
    }

    const { response, request: upstream } = opened;
    const status = response.statusCode || 200;
    const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4' });
    for (const name of ['content-length', 'content-range', 'last-modified', 'etag']) {
      const value = response.headers[name];
      if (value) headers.set(name, String(value));
    }
    if (request.method === 'HEAD') {
      response.resume();
      upstream.destroy();
      return new Response(null, { status, headers });
    }

    // 缓存写入：只认从头开始的顺读，而且同一份缓存同时只有一个写者。
    const partPath = entry.cachePath?.part;
    const canCache = Boolean(partPath) && !entry.caching && rangeStartOf(rangeHeader) === 0;
    let sink = null;
    let written = 0;
    let expected = null;
    if (canCache) {
      try {
        await fs.promises.mkdir(path.dirname(partPath), { recursive: true });
        sink = fs.createWriteStream(partPath, { flags: 'w' });
        // 写盘失败（盘满、目录被删）只是这一份缓存没了，播放照旧。
        sink.on('error', () => { entry.caching = false; sink = null; });
        entry.caching = true;
        expected = totalBytesOf(response);
      } catch (error) {
        log.warn('[Bilibili] Could not open the video cache file:', error);
        sink = null;
      }
    }

    const closeSink = (complete) => {
      if (!sink) return;
      const stream = sink;
      sink = null;
      entry.caching = false;
      stream.end(() => {
        if (!complete || !expected || written < expected) return;
        fs.promises.rename(partPath, entry.cachePath.final).catch(() => { /* 下次再攒 */ });
      });
    };

    const body = new PassThrough();
    // 播放器关了这条流（换歌、seek 到别处）以后还会有一段已经在路上的字节：丢掉，不要往死流里写。
    let closed = false;
    body.on('error', () => { closed = true; });
    response.on('data', (chunk) => {
      if (closed) return;
      if (sink) {
        written += chunk.length;
        sink.write(chunk);
      }
      if (!body.write(chunk)) response.pause();
    });
    body.on('drain', () => { if (!closed) response.resume(); });
    response.on('end', () => {
      closeSink(true);
      if (!closed) body.end();
    });
    response.on('aborted', () => closeSink(false));
    response.on('error', (error) => {
      closeSink(false);
      closed = true;
      body.destroy(error);
    });
    const abort = () => {
      closed = true;
      upstream.destroy();
      closeSink(false);
      body.destroy();
    };
    if (request.signal) {
      if (request.signal.aborted) abort();
      else request.signal.addEventListener('abort', abort);
    }

    return new Response(Readable.toWeb(body), { status, headers });
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
    openVideoStream,
    handleStreamRequest,
  };
}

/**
 * The CDN behind a bilibili video answers 403 unless the request looks like it comes from the site.
 * The renderer's <video> is given that header here, for bilibili's media hosts only.
 */
function setupBilibiliMediaAccess(defaultSession) {
  // 和取流用同一份域名表：bilibili 换 CDN 时只改 MEDIA_DOMAINS 一处，两边的匹配面不会漂。
  const BILIBILI_MEDIA_URLS = MEDIA_DOMAINS.map((domain) => `*://*.${domain}/*`);
  defaultSession.webRequest.onBeforeSendHeaders({ urls: BILIBILI_MEDIA_URLS }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders.Referer = 'https://www.bilibili.com/';
    // Only the picture/stream requests need this; a page load keeps its own UA.
    if (!requestHeaders['User-Agent']) requestHeaders['User-Agent'] = USER_AGENT;
    callback({ requestHeaders });
  });
}

module.exports = {
  createBilibiliApi,
  setupBilibiliMediaAccess,
  BILIBILI_PARTITION: PARTITION,
  BILIBILI_STREAM_SCHEME: STREAM_SCHEME,
};
