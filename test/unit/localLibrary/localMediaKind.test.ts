import { describe, expect, it } from 'vitest';
import { isImportableVideoFileName, isVideoMediaFileName, resolveLocalMediaKind } from '../../../src/utils/localMediaKind';

// A local library record has to say whether it is a music video before anything opens it: that
// decision drives which background the player page uses, so it is pinned here rather than left to
// an extension check copied into whichever module happens to need one.

describe('isVideoMediaFileName', () => {
    it('recognises the containers the library imports as videos', () => {
        expect(isVideoMediaFileName('MV - Some Song.mp4')).toBe(true);
        expect(isVideoMediaFileName('MV - Some Song.MKV')).toBe(true);
    });

    it('leaves audio files alone', () => {
        expect(isVideoMediaFileName('track.mp3')).toBe(false);
        expect(isVideoMediaFileName('track.flac')).toBe(false);
        expect(isVideoMediaFileName('track.m4a')).toBe(false);
    });

    it('does not match a video extension in the middle of the name', () => {
        expect(isVideoMediaFileName('mp4 live set.flac')).toBe(false);
    });
});

describe('resolveLocalMediaKind', () => {
    it('marks video files and leaves audio records without a kind', () => {
        expect(resolveLocalMediaKind('clip.mkv')).toBe('video');
        expect(resolveLocalMediaKind('song.ogg')).toBeUndefined();
    });
});

describe('isImportableVideoFileName', () => {
    it('视频播放实验关着时，mp4 与 mkv 都不被识别', () => {
        const flags = { videoPlaybackEnabled: false, canTranscodeFallback: true };
        expect(isImportableVideoFileName('MV.mp4', flags)).toBe(false);
        expect(isImportableVideoFileName('MV.mkv', flags)).toBe(false);
        expect(isImportableVideoFileName('MV.MP4', flags)).toBe(false);
    });

    it('实验打开后识别 mp4；mkv 还要桌面端转码回退', () => {
        expect(isImportableVideoFileName('MV.mp4', { videoPlaybackEnabled: true, canTranscodeFallback: false })).toBe(true);
        expect(isImportableVideoFileName('MV.mkv', { videoPlaybackEnabled: true, canTranscodeFallback: true })).toBe(true);
        expect(isImportableVideoFileName('MV.mkv', { videoPlaybackEnabled: true, canTranscodeFallback: false })).toBe(false);
    });

    it('不会把音频文件或名字里带 mp4 的文件当成视频', () => {
        const flags = { videoPlaybackEnabled: true, canTranscodeFallback: true };
        expect(isImportableVideoFileName('track.mp3', flags)).toBe(false);
        expect(isImportableVideoFileName('mp4 live set.flac', flags)).toBe(false);
    });
});
