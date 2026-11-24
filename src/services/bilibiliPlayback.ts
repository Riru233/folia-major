import type { BilibiliSearchHit } from '../types/bilibili';
import type { SongResult } from '../types';
import { getVideoInfo, getVideoStreamWithAudio, type VideoQuality } from '../shinoinject/lab/bilibili/api';
export type { VideoQuality } from '../shinoinject/lab/bilibili/api';
import { isBilibiliAvailable } from '../shinoinject/lab/bilibili/transport';
import { importDirectoryHandle } from './localMusicService';
import { buildUnifiedLocalSong } from './playbackAdapters';

// src/services/bilibiliPlayback.ts
// 把一条 bilibili 视频变成「本地视频」交给 folia 播放层。
//
// 为什么先下载：本地视频的播放链（声音 getAudioFromLocalSong、画面 resolveLocalSongVideoSource）
// 只认 FileSystemFileHandle.getFile() 拿到的 blob，不接受 http 直链。所以这里把带签名的直链经主进程
// （带 cookies/Referer，绕开 CORS）下载成 blob，写进 OPFS 的专用目录，再走正常的本地导入流程：
// 得到的 LocalSong 带可用的 fileHandle，mediaKind 按扩展名判为 video，buildUnifiedLocalSong 给它
// 打上 isVideo:true。之后声音、画面、进度同步、画质档都和普通本地 MV 一模一样。
//
// 同一 bvid + 同一画质只下一次：OPFS 文件名带这两样，重复点开直接复用已有的导入记录。

const VIDEO_DIR_NAME = 'Folia Online Video';

const sanitizeFileName = (value: string): string => (
    value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'video'
);

const fileNameOf = (hit: BilibiliSearchHit, quality: VideoQuality): string => (
    `${sanitizeFileName(hit.title)}-${hit.bvid}-${quality}.mp4`
);

const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType || 'video/mp4' });
};

/** 找到（或创建）OPFS 里专放在线视频的目录。 */
const videoDirectory = async (): Promise<FileSystemDirectoryHandle> => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(VIDEO_DIR_NAME, { create: true });
};

/** 下载并写入 OPFS，返回文件名。同一个文件已经在盘上就跳过下载。 */
const ensureVideoFile = async (hit: BilibiliSearchHit, quality: VideoQuality): Promise<string> => {
    const dir = await videoDirectory();
    const fileName = fileNameOf(hit, quality);
    try {
        await dir.getFileHandle(fileName);
        return fileName;
    } catch {
        // 文件不在：下面下载。
    }

    const bridge = typeof window === 'undefined' ? undefined : window.electron?.bilibili;
    if (!bridge?.downloadVideo) throw new Error('online video download needs the desktop app');

    const info = await getVideoInfo(hit.bvid);
    const stream = await getVideoStreamWithAudio(info.bvid, info.cid, quality);
    const downloaded = await bridge.downloadVideo({ url: stream.videoUrl });
    const blob = base64ToBlob(downloaded.base64, downloaded.mimeType);
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    try {
        await writable.write(blob);
    } finally {
        await writable.close();
    }
    return fileName;
};

/**
 * 点开一条 bilibili 视频：下载（必要时）→ 导入 OPFS 目录 → 找到对应的本地视频曲目 → 构造 song。
 * 返回的 song 可以直接交给 folia 的 playSong(song, [song]) 在播放层播放。
 */
export const prepareBilibiliVideo = async (
    hit: BilibiliSearchHit,
    quality: VideoQuality,
): Promise<SongResult> => {
    if (!isBilibiliAvailable()) throw new Error('online video needs the desktop app');
    const fileName = await ensureVideoFile(hit, quality);
    const imported = await importDirectoryHandle(await videoDirectory());
    const localSong = imported.find(song => song.fileName === fileName);
    if (!localSong) throw new Error(`downloaded video was not imported: ${fileName}`);
    // ensureVideoFile 用 .mp4 命名，导入时按扩展名已经判为 video；这里再钉一次，防止个别环境识别差异。
    const videoSong = localSong.mediaKind === 'video' ? localSong : { ...localSong, mediaKind: 'video' as const };
    return buildUnifiedLocalSong({
        localSong: videoSong,
        matchedSong: null,
        coverUrl: hit.coverUrl || null,
        preferOnlineMetadata: false,
    });
};
