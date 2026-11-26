import type { BilibiliSearchHit } from '../types/bilibili';
import type { SongResult } from '../types';
import { getVideoInfo, getVideoStreamWithAudio, type VideoQuality } from '../shinoinject/lab/bilibili/api';
export type { VideoQuality } from '../shinoinject/lab/bilibili/api';
import { isBilibiliAvailable } from '../shinoinject/lab/bilibili/transport';
import { updatePrefetchedAudioUrl } from './prefetchService';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';

// src/services/bilibiliPlayback.ts
// 把一条 bilibili 视频交给 folia 播放层，而且是「边读边播」，不是先下完再播。
//
// 链路：这里只换地址，不搬字节。带签名的直链交给主进程（electron/bilibili.cjs 的 openVideoStream），
// 换回一条 `folia-bili://media/<id>/video.mp4`；播放器的 <audio> 与画面都读同一条地址。Chromium 的
// 媒体栈按 Range 去要字节，主进程把请求转发给 CDN（带 Referer / Range / UA），收到的字节一边回给
// 播放器、一边抄进缓存文件。所以听到第一秒的时候，缓存已经在同一条流上长出来了；攒满一个完整文件
// 之后，这条地址直接从盘上读，不再出网。
//
// CDN 只认播放器发出来的请求，主进程此前用 Chromium 的 net 发会触发 ERR_BLOCKED_BY_CLIENT，
// 所以取流改走 Node 的 http/https；这也顺带解决了「远端直链能不能播」这个反复出问题的地方。
//
// 播放身份：这首歌不是本地文件、也不是任何一个在线音源（bilibili 只做画面与消遣，不做曲库），
// 所以挂一个 stage 源引用——播放链就不会去问平台要地址，也不会把整段视频塞进音频媒体缓存。
// 地址通过预取条目交给播放链：那是「已经拿到地址」的正规入口。

/** 这首歌的播放身份：同一集视频永远是同一首歌，进度、收藏、队列都按它认。 */
const songIdOf = (bvid: string): string => `bilibili:${bvid}`;

/**
 * 点开一条 bilibili 视频：解析播放地址 → 交给主进程开一条流 → 交回一首可以直接 playSong 的歌。
 * 返回即可播放，不必等到文件下完。
 */
export const prepareBilibiliVideo = async (
    hit: BilibiliSearchHit,
    quality: VideoQuality,
): Promise<SongResult> => {
    if (!isBilibiliAvailable()) throw new Error('online video needs the desktop app');
    const bridge = window.electron?.bilibili;
    if (!bridge || typeof bridge.openVideoStream !== 'function') {
        throw new Error('online video streaming needs the desktop app');
    }

    const info = await getVideoInfo(hit.bvid);
    const stream = await getVideoStreamWithAudio(info.bvid, info.cid, quality);
    // 主地址 + backup_url 一起交给主进程：被 CDN 拒掉时它会换下一个再试。
    const opened = await bridge.openVideoStream({
        urls: [stream.videoUrl, ...(stream.backupUrls ?? [])],
        bvid: info.bvid,
        quality: String(stream.quality || quality),
    });

    const song: SongResult = {
        id: songIdOf(info.bvid),
        name: hit.title || info.title,
        artists: [{ id: info.author || 'bilibili', name: hit.author || info.author || 'bilibili' }],
        album: {
            id: songIdOf(info.bvid),
            name: hit.title || info.title,
            coverUrl: hit.coverUrl || info.coverUrl || undefined,
        },
        durationMs: Math.max(0, Math.round((hit.durationSec || info.durationSec || 0) * 1000)),
        isVideo: true,
        sourceRef: { kind: 'stage', mediaId: songIdOf(info.bvid) },
        // 画面读的是同一条地址：VideoLayer 见到它就当曲目自带的画面来放。
        onlineVideoUrl: opened.url,
    };

    // 播放链只认「已经拿到的地址」：写进预取条目，playSong 就会直接拿它当音源，不再问任何平台。
    updatePrefetchedAudioUrl(song, opened.url, useAudioSettingsStore.getState().audioQuality);
    return song;
};
