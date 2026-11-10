import { getLocalSong } from './db';
import { getFileFromLocalSong } from './localMusicService';
import { createSafeObjectUrl } from '../utils/blobGuards';

// src/services/localSongVideoSource.ts
// 视频曲目（MV）的画面地址。
//
// 声音走的是和普通本地歌曲完全一样的那条链（<audio> 放文件的音轨），画面这一份单独从同一个文件再取一个
// blob URL 给 <video> 用。按曲目缓存一份，换歌时把上一份释放掉：一个 MV 几百兆，攒几首就是实实在在的内存。
// 只有 mediaKind === 'video' 的曲目才会有地址；普通歌曲这里直接答 null，调用方据此退回原来的背景。
//
// 这里假设同一时刻只有一个读者（播放页上的那一个 VideoLayer），所以「换歌就释放上一份」是安全的。

export interface LocalSongVideoSource {
    songId: string;
    /** 直接可以喂给 <video src> 的 blob URL。 */
    url: string;
}

let current: LocalSongVideoSource | null = null;
// 每次解析都换一个序号：慢的那次回来时如果已经被更新的请求顶掉，就不能再动全局那一份。
let revision = 0;

const revoke = (source: LocalSongVideoSource | null) => {
    if (source) URL.revokeObjectURL(source.url);
};

/**
 * 取 `songId` 这条曲目的画面地址；不是视频曲目、或文件已经读不到时返回 null。
 * 同一个曲目重复问只读一次文件。被更新的请求顶掉时也返回 null——不把别的曲目的地址递给调用方。
 */
export const resolveLocalSongVideoSource = async (songId: string): Promise<LocalSongVideoSource | null> => {
    if (current?.songId === songId) return current;
    const requestRevision = ++revision;
    const song = await getLocalSong(songId);
    if (requestRevision !== revision) return null;
    if (!song || song.mediaKind !== 'video') {
        releaseLocalSongVideoSource();
        return null;
    }

    const file = await getFileFromLocalSong(song);
    const url = file ? createSafeObjectUrl(file) : null;
    if (requestRevision !== revision) {
        // 迟到的结果：这个 URL 没人要了，当场放掉，不要挂到全局那一份上。
        if (url) URL.revokeObjectURL(url);
        return null;
    }
    if (!url) {
        console.warn(`[LocalSongVideo] Could not read the video file for ${song.fileName}`);
        releaseLocalSongVideoSource();
        return null;
    }

    revoke(current);
    current = { songId, url };
    return current;
};

/** 放掉手上这份地址（换歌、离开播放页、画面解不开）。 */
export const releaseLocalSongVideoSource = () => {
    revision += 1;
    revoke(current);
    current = null;
};
