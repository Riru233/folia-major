import { describe, expect, it } from 'vitest';
import { resolveKaraokeScrollOffset } from '@/components/visualizer/karaoke/karaokeScroll';

describe('karaoke horizontal follow', () => {
    it('does not move while the sung part is still inside the frame', () => {
        expect(resolveKaraokeScrollOffset(2000, 1400, 0)).toBe(0);
        expect(resolveKaraokeScrollOffset(2000, 1400, 900)).toBe(0);
        // 正好顶到右边界：还是不动。
        expect(resolveKaraokeScrollOffset(2000, 1400, 1400)).toBe(0);
    });

    it('starts moving only once the sung part passes the edge', () => {
        expect(resolveKaraokeScrollOffset(2000, 1400, 1500)).toBe(100);
        expect(resolveKaraokeScrollOffset(2000, 1400, 1900)).toBe(500);
    });

    it('never scrolls past the end of the line', () => {
        expect(resolveKaraokeScrollOffset(2000, 1400, 2000)).toBe(600);
        expect(resolveKaraokeScrollOffset(2000, 1400, 2600)).toBe(600);
    });

    it('does not move a line that fits, or one whose width is not known yet', () => {
        expect(resolveKaraokeScrollOffset(1200, 1400, 900)).toBe(0);
        expect(resolveKaraokeScrollOffset(0, 1400, 0)).toBe(0);
        expect(resolveKaraokeScrollOffset(Number.NaN, 1400, 0)).toBe(0);
    });

    it('mirrors for right-to-left lines: the sung character sits at the left edge', () => {
        // 起始位置在最右端：一开始就把整行的右端（也就是开场）露出来。
        expect(resolveKaraokeScrollOffset(2000, 1400, 0, true)).toBe(600);
        expect(resolveKaraokeScrollOffset(2000, 1400, 600, true)).toBe(600);
        // 唱到 1700 时，右侧 1400 那一段还放得下，不用再动。
        expect(resolveKaraokeScrollOffset(2000, 1400, 1700, true)).toBe(300);
        expect(resolveKaraokeScrollOffset(2000, 1400, 2000, true)).toBe(0);
    });
});
