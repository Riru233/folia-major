// src/components/visualizer/karaoke/karaokeScroll.ts
// 长句的横向跟唱只算一件事：这一行该往左挪多少，才能让「正在唱」的那个字停在可见边界上。
// 抽成纯函数是因为它全是边界条件（没溢出、刚顶到边、顶到末尾、RTL 镜像），比留在组件里好测。

/**
 * @param total   这一行文字的完整宽度（像素）。
 * @param visible 裁切框的宽度（像素）。
 * @param cursor  唱到的位置距离行首多少像素（0..total）。
 * @param rtl     这一行是否从右往左唱。
 * @returns 需要把整行左移的像素数，0 表示不动。
 */
export const resolveKaraokeScrollOffset = (
    total: number,
    visible: number,
    cursor: number,
    rtl = false,
): number => {
    const range = total - visible;
    // 放得下就不滚；宽度还量不出来（0）时也不滚，否则会算出负数。
    if (!Number.isFinite(range) || range <= 0) {
        return 0;
    }
    // LTR：唱到的字贴右边界，前面溢出的部分移出画面；RTL：镜像，唱到的字贴左边界。
    const raw = rtl ? total - cursor : cursor - visible;
    return Math.min(range, Math.max(0, raw));
};

/**
 * 「换行」模式下竖直方向的跟唱：内容比可视高度高时，把整页往上推，让正在唱的那一行留在框里。
 *
 * @param totalHeight   内容的完整高度（像素）。
 * @param visibleHeight 裁切框的高度（像素）。
 * @param cursorY       唱到的位置距离内容顶部的像素数。
 * @param keepRatio     唱到的那一行落在框里的位置（0 顶部、1 底部），默认 0.85：下面还留一点预告。
 */
export const resolveKaraokeWrapScrollOffset = (
    totalHeight: number,
    visibleHeight: number,
    cursorY: number,
    keepRatio = 0.85,
): number => {
    const range = totalHeight - visibleHeight;
    if (!Number.isFinite(range) || range <= 0) {
        return 0;
    }
    const raw = cursorY - visibleHeight * keepRatio;
    return Math.min(range, Math.max(0, raw));
};
