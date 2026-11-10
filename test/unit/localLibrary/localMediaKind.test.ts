import { describe, expect, it } from 'vitest';
import { isVideoMediaFileName, resolveLocalMediaKind } from '../../../src/utils/localMediaKind';

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
