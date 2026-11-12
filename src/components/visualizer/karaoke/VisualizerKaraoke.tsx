import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, useMotionValueEvent } from 'framer-motion';
import {
    BUILTIN_FONT_STACKS,
    resolveThemeFontStack,
    resolveThemeFontWeight,
    resolveThemeTranslationFontStack,
} from '../../../utils/fontStacks';
import type { VisualizerSharedProps } from '../definition';
import { PlayerState, type Line } from '../../../types';
import { useVisualizerRuntime } from '../runtime';
import VisualizerShell from '../VisualizerShell';
import { resolveSubtitleFontSizes } from '../subtitleFontSizes';
import { buildKaraokeChunks, chunkFillProgress, type KaraokeChunk } from './karaokeSegments';
import { resolveKaraokeScrollOffset, resolveKaraokeWrapScrollOffset } from './karaokeScroll';
import { karaokeCreditsOpacity, resolveKaraokeCredits } from './karaokeCredits';
import { toTraditionalLyrics } from './karaokeHanzi';
import { useKaraokeInfoOverrideStore } from '../../../stores/useKaraokeInfoOverrideStore';
import { useKaraokeInfoAutoDetect } from './useKaraokeInfoAutoDetect';
import { selectDisplayPlayerState, selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { DEFAULT_KARAOKE_TUNING, type KaraokeTuning } from './types';

// src/components/visualizer/karaoke/VisualizerKaraoke.tsx
// 卡拉OK：当前这一句画两遍。底下一遍是「还没唱」的样子（白字黑边），上面一遍是「唱过」的样子
// （白边蓝字），上面那一遍按每个字块的进度让出来——于是已经唱到的地方是蓝字白边，没唱到的还是白字黑边。
// 让出来的方式由「预备进度样式」决定：扫过（clip-path 从左往右裁）、淡入（不透明度渐变）、整块跳变。
//
// 每帧只写 DOM 的 clip-path / opacity，不进 React state：一句话十来块，最多十来次样式写入，
// 而且没变化的块直接跳过（见 EPSILON）。

type VisualizerKaraokeProps = VisualizerSharedProps & {
    /** 参数由 entry 用 tuning.ts 的 read() 取好传进来。 */
    karaokeTuning?: KaraokeTuning;
};

/** 字块的基准大小；全局歌词字号与样式自己的字号倍率都乘在上面。 */
const BASE_FONT_SIZE = 'clamp(1.75rem, 4.4vw, 3.3rem)';

/** 单块进度的变化小于这个值就不写样式：肉眼看不出来，省掉大量无意义的字符串拼装。 */
const EPSILON = 0.004;

/**
 * 歌词页离画面底边的固定距离：不跟播放条、停靠栏或任何底部元素联动，永远钉在这儿。
 * 底下那一条留给浮动的译文（共享字幕层画在自己的基线上），两行歌词都在它上面。
 */
const LYRICS_BOTTOM_PX = 48;

/**
 * 「换行」模式下歌词页框的最大高度。
 *
 * 这里只留一个「极长内容才生效」的兜底上限：正常两句折行撑死六七行，框必须整段装得下。
 * 之前给 58vh，内容一旦略微超过框高，超出的那几行就在框底被裁掉——最后一句的下半截
 * 一直露不全，非要等竖直跟唱把它推上来才看得见。高度放到「几乎不会触发」，裁切和
 * 随之而来的整体上移就都不会发生了。
 */
const WRAP_MAX_HEIGHT = '80vh';

/** 竖直跟唱时给行底留的余量：描边是画在字外面的，贴着框底会被切掉一点。 */
const WRAP_BOTTOM_PADDING = 6;

/** 首字符落在这些区段就按从右往左扫（阿拉伯文、希伯来文等）。 */
const RTL_TEXT = /[\u0590-\u05ff\u0600-\u06ff\u0700-\u074f\u0780-\u07bf\ufb1d-\ufdff\ufe70-\ufeff]/;

const isRtlText = (text: string) => RTL_TEXT.test(text);

const strokeStyle = (fill: string, stroke: string, width: number): React.CSSProperties => (
    width > 0
        // paintOrder: 'stroke' 让描边画在字面下面，笔画不会把字心吃掉。
        ? { color: fill, WebkitTextStrokeWidth: `${width}px`, WebkitTextStrokeColor: stroke, paintOrder: 'stroke' }
        : { color: fill }
);

const VisualizerKaraoke: React.FC<VisualizerKaraokeProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        songTitle,
        theme,
        subtitleTheme,
        showText = true,
        lyricsFontScale = 1,
        subtitleFontScale = 1,
        hideTranslationSubtitle = false,
        isDaylight = false,
        audioPower,
        audioBands,
        staticMode = false,
        karaokeTuning = DEFAULT_KARAOKE_TUNING,
        isPlayerChromeHidden = false,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        subtitleUpcomingLyricsBlur,
        subtitleOverlayLayout,
        isPreviewMode = false,
        ...sharedProps
    } = props;

    const { activeLine, recentCompletedLine, nextLines } = useVisualizerRuntime({ currentTime, currentLineIndex, lines });

    // 两句一页：第 1、2 句同屏（第一行靠左、第二行靠右），第 2 句唱完才翻页，换成第 3、4 句。
    // 句与句之间的空档 currentLineIndex 会退回 -1：这时按刚唱完的那句算页，页面才不会闪掉。
    const anchorIndex = currentLineIndex >= 0
        ? currentLineIndex
        : (recentCompletedLine ? lines.indexOf(recentCompletedLine) : -1);
    const pageStart = anchorIndex >= 0 ? anchorIndex - (anchorIndex % 2) : -1;
    const pageFirstLine = pageStart >= 0 ? lines[pageStart] ?? null : null;
    const pageSecondLine = pageStart >= 0 ? lines[pageStart + 1] ?? null : null;

    // 两行都按同样的字块切分渲染：行高、折行位置必须与「正在唱」的那一行完全一致，
    // 否则一句开唱时整块歌词会因行高变化上下跳一下（就是之前那个「第二句抖动」）。
    // 开了「繁体字形」就把整句先转成繁体再切块：简繁要按词挑字，逐块转会转错。
    const traditionalScript = karaokeTuning.traditionalScript === true;
    const lineTransform = traditionalScript ? toTraditionalLyrics : undefined;
    const firstChunks = useMemo(() => buildKaraokeChunks(pageFirstLine, lineTransform), [pageFirstLine, traditionalScript]);
    const secondChunks = useMemo(() => buildKaraokeChunks(pageSecondLine, lineTransform), [pageSecondLine, traditionalScript]);
    const chunks = activeLine && activeLine === pageSecondLine ? secondChunks : firstChunks;
    const rtl = useMemo(() => isRtlText(activeLine?.fullText ?? ''), [activeLine]);
    const progressStyle = karaokeTuning.progressStyle;

    // 开头的「歌名 / 作词 / 作曲」不是歌词：提出来单独显示，唱到作曲那句末尾再淡出。
    // 这首歌如果手动指定过「开头哪几行是信息」，以那份为准（自动识别漏掉/认错的就落在这里）。
    // 预览用的是示例歌词，和播放键对不上，所以预览里一律走自动识别。
    const displaySong = usePlaybackStore(selectDisplaySong);
    const displayPlayerState = usePlaybackStore(selectDisplayPlayerState);
    const songKey = !isPreviewMode && displaySong ? getPlaybackSongKey(displaySong) : null;
    const infoOverride = useKaraokeInfoOverrideStore(state => (songKey ? state.bySong[songKey] : undefined));
    const credits = useMemo(
        () => resolveKaraokeCredits(lines, {
            title: infoOverride?.title || songTitle || null,
            hiddenIndexes: infoOverride ? infoOverride.hiddenIndexes : null,
            rows: infoOverride?.rows ?? null,
        }),
        [lines, songTitle, infoOverride],
    );
    // 歌曲信息那块也一起转：「作词：」「作曲：」这两行的标签本就是中文，转了简体、不转标题区，
    // 同一块画面里会一边简体一边繁体。识别（resolveKaraokeCredits）仍看原句，
    // 「作词：」这类本地规则认得的是简体写法，先转再认会漏。
    const creditsText = useMemo(() => {
        if (!credits) {
            return null;
        }
        if (!traditionalScript) {
            return { title: credits.title, rows: credits.rows };
        }
        return {
            title: credits.title ? toTraditionalLyrics(credits.title) : credits.title,
            rows: credits.rows.map(toTraditionalLyrics),
        };
    }, [credits, traditionalScript]);

    // 播放时替用户问一次模型：本地一条信息行都没认出来、这首歌也还没有答案时才会真的发请求。
    // 认出什么就按歌存起来，下次播放直接用，不会重复花额度。
    useKaraokeInfoAutoDetect({
        songKey,
        lines,
        active: !isPreviewMode && displayPlayerState === PlayerState.PLAYING,
        needsDetection: !infoOverride && credits === null,
    });

    // 被提走的那几行不再参与两句一页（它们只是署名，不该被唱）。
    const hiddenLines = useMemo(
        () => new Set(credits ? credits.hiddenIndexes.map(index => lines[index]) : []),
        [credits, lines],
    );

    const filledRefs = useRef<(HTMLSpanElement | null)[]>([]);
    /** 上一次写给每一块的进度；换句或换样式时清空，让所有块重画一遍。 */
    const paintedProgress = useRef<number[]>([]);
    const chunksRef = useRef<KaraokeChunk[]>(chunks);
    chunksRef.current = chunks;

    /** 裁切这一页的框（宽度就是可用宽度）与正在唱的那一行（它比框宽多少就滚多少）。 */
    const clipRef = useRef<HTMLDivElement | null>(null);
    /** 横向跟唱推的是「正在唱的那一行」。 */
    const scrollTargetRef = useRef<HTMLDivElement | null>(null);
    /** 折行模式的竖直跟唱推的是整页（两行一起动）。 */
    const wrapTargetRef = useRef<HTMLDivElement | null>(null);
    /** 量尺寸那一层的字块，用来算「唱到哪儿了」在画面上的横坐标。 */
    const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
    /** 每个字块相对行首的左边距 / 宽度，以及相对裁切框顶部的上下位置，换句时量一次。 */
    const chunkMetricsRef = useRef<{ left: number[]; width: number[]; top: number[]; height: number[] }>({
        left: [], width: [], top: [], height: [],
    });
    /** 这一句横向还能滚多远；0 表示放得下，不用滚。 */
    const scrollRangeRef = useRef(0);
    const visibleWidthRef = useRef(0);
    /** 折行模式下的竖直滚动量：内容高、可视高。 */
    const wrapRangeRef = useRef(0);
    const wrapVisibleHeightRef = useRef(0);
    /** 上一次写进 DOM 的位移。同一个值不重复写，切页/停顿的时候才不会抖。 */
    const lastTransformRef = useRef('');
    /** 这一句已经滚到的位置（横向 / 竖直各一个）。换句或重量时清空，让位移从当前时间重新算起。
     *  跟唱只准往前推进：字块交界处算回来的几个像素会让整行退一下再前进，跟着节拍看就是抖。 */
    const lastXOffsetRef = useRef<number | null>(null);
    const lastYOffsetRef = useRef<number | null>(null);
    /** 标题区整块，以及上一次写进去的不透明度（同值不重复写，免得每帧都碰一次 DOM）。
     *  连节点一起记：换歌之后是新节点，值就算一样也得重新写一遍。 */
    const creditsRef = useRef<HTMLDivElement | null>(null);
    const lastCreditsWriteRef = useRef<{ node: HTMLDivElement | null; opacity: number }>({ node: null, opacity: -1 });
    const activeLineRef = useRef(activeLine);
    activeLineRef.current = activeLine;

    /** 量一次字块位置和溢出量。换句、字体加载、改窗口大小都要重量。 */
    const measureScroll = useCallback(() => {
        const clip = clipRef.current;
        const target = scrollTargetRef.current;
        // 量的时候先把上一轮写的位移清掉，不然量到的是被推过之后的位置。
        if (target) {
            target.style.transform = '';
        }
        if (wrapTargetRef.current) {
            wrapTargetRef.current.style.transform = '';
        }
        lastTransformRef.current = '';
        lastXOffsetRef.current = null;
        lastYOffsetRef.current = null;
        const frameRect = clip ? clip.getBoundingClientRect() : null;
        const metrics = { left: [] as number[], width: [] as number[], top: [] as number[], height: [] as number[] };
        // 换句时数组里可能还留着上一句（更长）的尾部槽位：那些是 null，算总宽时不能拿它们当末块，
        // 否则一行唱完换到短句时总宽会算成 0，跟唱直接不滚。
        let total = 0;
        measureRefs.current.forEach(node => {
            if (!node) {
                metrics.left.push(0); metrics.width.push(0); metrics.top.push(0); metrics.height.push(0);
                return;
            }
            const left = node.offsetLeft;
            const width = node.offsetWidth;
            metrics.left.push(left);
            metrics.width.push(width);
            total = Math.max(total, left + width);
            if (frameRect) {
                const rect = node.getBoundingClientRect();
                metrics.top.push(rect.top - frameRect.top);
                metrics.height.push(rect.height);
            } else {
                metrics.top.push(0);
                metrics.height.push(node.offsetHeight);
            }
        });
        chunkMetricsRef.current = metrics;
        const visible = clip ? clip.clientWidth : 0;
        visibleWidthRef.current = visible;
        scrollRangeRef.current = Math.max(0, total - visible);
        wrapVisibleHeightRef.current = clip ? clip.clientHeight : 0;
        // 亚像素的差值（内容比框高 0.4 像素）不值得算作「要滚」，否则整页会平白挪一像素。
        // 取整之后还不到 4px 的溢出同样当没溢出：那种量级滚一次只是让整块歌词上下跳一下。
        const wrapRange = clip ? Math.round(clip.scrollHeight - clip.clientHeight) : 0;
        wrapRangeRef.current = wrapRange >= 4 ? wrapRange : 0;
    }, []);

    /**
     * 跟唱滚动，两种溢出处理：
     * - 滚动（scroll）：不折行，唱到的字还没顶到右边界时整行不动，顶到了才往左推。
     * - 换行（wrap）：折行显示，内容比框高时按正在唱的那一行竖直往上推。
     * 放得下就一点都不动。
     */
    /** 位移一律取整再写：亚像素的 translate 会让文字重新栅格化，看起来就是上下/左右抖动。 */
    const writeTransform = useCallback((node: HTMLDivElement | null, value: string) => {
        if (!node) {
            return;
        }
        const key = `${node === scrollTargetRef.current ? 'x' : 'y'}:${value}`;
        if (lastTransformRef.current === key) {
            return;
        }
        lastTransformRef.current = key;
        node.style.transform = value;
    }, []);

    const applyScroll = useCallback((time: number) => {
        const target = scrollTargetRef.current;
        const wrapTarget = wrapTargetRef.current;
        if (!target || !wrapTarget) {
            return;
        }
        const line = activeLineRef.current;
        const chunks = chunksRef.current;
        if (!line || chunks.length === 0) {
            writeTransform(target, '');
            writeTransform(wrapTarget, '');
            lastXOffsetRef.current = null;
            lastYOffsetRef.current = null;
            return;
        }
        const metrics = chunkMetricsRef.current;
        // 正在唱（或下一个要唱）的那块，按块内进度插值，得到「唱到哪儿」的位置。
        let frontier = chunks.length - 1;
        for (let index = 0; index < chunks.length; index++) {
            if (time < chunks[index].endTime) {
                frontier = index;
                break;
            }
        }
        const progress = chunkFillProgress(chunks[frontier], time);

        if (karaokeTuning.overflowMode === 'wrap') {
            // 折行模式不横向推，改成整页竖直滚动。
            writeTransform(target, '');
            const range = wrapRangeRef.current;
            if (range <= 0) {
                writeTransform(wrapTarget, '');
                lastYOffsetRef.current = null;
                return;
            }
            const top = metrics.top[frontier] ?? 0;
            const height = metrics.height[frontier] ?? 0;
            // 以「这一行的底部」为准，而不是唱到的那一点：整行必须完整露在框里，否则下半截被
            // 框底切掉，看上去就是「最后一行显示不全」。keepRatio 给 1，不加提前量——唱到行底
            // 顶住框底才推，推完正好把整行露出来。
            // 只准往前走：字块交界处算出来的值会往回退一两个像素，跟着节拍退一下再进就是抖。
            const raw = Math.round(resolveKaraokeWrapScrollOffset(
                wrapVisibleHeightRef.current + range,
                wrapVisibleHeightRef.current,
                top + height + WRAP_BOTTOM_PADDING,
                1,
            ));
            const previous = lastYOffsetRef.current;
            const offset = previous === null ? raw : Math.max(previous, raw);
            lastYOffsetRef.current = offset;
            writeTransform(wrapTarget, `translateY(-${offset}px)`);
            return;
        }
        // 换回滚动模式时把竖直位移清掉。
        writeTransform(wrapTarget, '');
        lastYOffsetRef.current = null;

        const range = scrollRangeRef.current;
        if (range <= 0) {
            writeTransform(target, '');
            lastXOffsetRef.current = null;
            return;
        }
        const left = metrics.left[frontier] ?? 0;
        const width = metrics.width[frontier] ?? 0;
        const cursor = left + width * progress;
        // 同上：块与块的交界处会算回来一点点，只准往前滚，免得跟着节拍每秒退回一像素。
        // RTL 的行是反的：唱得越往后，需要左移的量越小，所以那边只准往回（取更小的值）。
        const raw = Math.round(resolveKaraokeScrollOffset(visibleWidthRef.current + range, visibleWidthRef.current, cursor, rtl));
        const previous = lastXOffsetRef.current;
        const offset = previous === null ? raw : (rtl ? Math.min(previous, raw) : Math.max(previous, raw));
        lastXOffsetRef.current = offset;
        writeTransform(target, offset > 0 ? `translateX(-${offset}px)` : '');
    }, [rtl, karaokeTuning.overflowMode, writeTransform]);

    /** 标题区只在开头露脸：唱到作曲末尾开始淡出，第一句歌词出来时正好淡完。 */
    const paintCredits = useCallback((time: number) => {
        const node = creditsRef.current;
        if (!node || !credits) {
            return;
        }
        const opacity = karaokeCreditsOpacity(credits, time);
        const last = lastCreditsWriteRef.current;
        if (last.node === node && Math.abs(opacity - last.opacity) < EPSILON) {
            return;
        }
        lastCreditsWriteRef.current = { node, opacity };
        node.style.opacity = opacity.toFixed(3);
        // 淡到 0 之后整块撤掉：它盖在画面正中，留着会白占一层合成。
        node.style.visibility = opacity <= 0 ? 'hidden' : 'visible';
    }, [credits]);

    const paintFill = useCallback((time: number) => {
        const current = chunksRef.current;
        for (let index = 0; index < current.length; index++) {
            const node = filledRefs.current[index];
            if (!node) {
                continue;
            }
            const progress = chunkFillProgress(current[index], time);
            if (Math.abs((paintedProgress.current[index] ?? -1) - progress) < EPSILON) {
                continue;
            }
            paintedProgress.current[index] = progress;
            if (progressStyle === 'sweep') {
                const hidden = (1 - progress) * 100;
                node.style.opacity = '';
                // RTL 的行从右边开始唱，裁切也跟着从右边放。
                node.style.clipPath = rtl ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;
            } else {
                node.style.clipPath = '';
                // 淡入跟着时间一路变亮；整块跳变只在这一块轮到时翻成 1。
                node.style.opacity = progressStyle === 'fade' ? progress.toFixed(3) : (progress > 0 ? '1' : '0');
            }
        }
        applyScroll(time);
        paintCredits(time);
    }, [progressStyle, rtl, applyScroll, paintCredits]);

    useMotionValueEvent(currentTime, 'change', paintFill);

    /** 把上一轮写在字块上的样式清干净：换句、换进度样式都会让它们不再成立。 */
    const clearPainted = useCallback(() => {
        paintedProgress.current = [];
        filledRefs.current.forEach(node => {
            if (!node) {
                return;
            }
            node.style.clipPath = '';
            node.style.opacity = '';
        });
        // 已经唱完的那一行不再走逐帧绘制，它最后写下的 clip-path 会留在节点上，看上去就是「差一点没唱完」。
        // 这里连它一起清：填充层整句都露出来。
        clipRef.current?.querySelectorAll('[data-karaoke-fill]').forEach(node => {
            const span = node as HTMLElement;
            span.style.clipPath = '';
            span.style.opacity = '';
        });
    }, []);

    const lineKey = activeLine ? `${activeLine.startTime}:${activeLine.fullText}` : 'empty';

    // 换句之后 DOM 是新的（换进度样式时旧样式还留在节点上）：清一遍，量一次溢出，再按当前时间画到该在的位置。
    useEffect(() => {
        clearPainted();
        measureScroll();
        paintFill(currentTime.get());
    }, [lineKey, progressStyle, clearPainted, paintFill, currentTime, chunks, measureScroll]);

    // 主题字体是后加载的：换上来以后英文的字宽会变，折行位置和行高跟着变，量过的溢出就不作数了。
    // 只在第一次字体就绪时补量一次，之后再变（加字体、改系统字体）走 resize 之外的路径也不至于抖。
    useEffect(() => {
        let cancelled = false;
        document.fonts?.ready.then(() => {
            if (cancelled) {
                return;
            }
            measureScroll();
            paintFill(currentTime.get());
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [measureScroll, paintFill, currentTime]);

    // 宽度变了（窗口缩放、竖排转横排）溢出量也跟着变。
    useEffect(() => {
        const onResize = () => {
            measureScroll();
            paintFill(currentTime.get());
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [measureScroll, paintFill, currentTime]);

    const fontFamily = karaokeTuning.fontStyle === 'theme'
        ? resolveThemeFontStack(theme)
        : BUILTIN_FONT_STACKS[karaokeTuning.fontStyle];
    const fontWeight = karaokeTuning.fontWeight || resolveThemeFontWeight(theme, 800);
    const lineFontSize = `calc(${BASE_FONT_SIZE} * ${lyricsFontScale * karaokeTuning.fontScale})`;

    const renderChunks = (rowChunks: KaraokeChunk[], layer: 'idle' | 'filled', interactive: boolean) => rowChunks.map((chunk, index) => (
        <span
            key={index}
            // 填充层的每一块都带这个标记：换句时要把同一页上所有还没重画的裁切一起清掉。
            data-karaoke-fill={layer === 'filled' ? '' : undefined}
            ref={layer === 'filled'
                ? (interactive ? (node) => { filledRefs.current[index] = node; } : undefined)
                : (interactive ? (node) => { measureRefs.current[index] = node; } : undefined)}
        >
            {chunk.text}
        </span>
    ));

    const pageAnimation = karaokeTuning.pageAnimation !== false;
    const wrapMode = karaokeTuning.overflowMode === 'wrap';
    const resolvedSubtitleTheme = subtitleTheme ?? theme;
    const subtitleFontSizes = useMemo(() => resolveSubtitleFontSizes(lyricsFontScale), [lyricsFontScale]);

    // 两句一页的划分在上面（pageStart / pageFirstLine / pageSecondLine），这里只管把两行画出来。
    const renderRow = (line: Line | null, side: 'start' | 'end', rowChunks: KaraokeChunk[]) => {
        if (!line || hiddenLines.has(line)) {
            return null;
        }
        const isSinging = line === activeLine;
        // 同一页里已经唱完的那句不再退回「还没唱」的灰样，维持唱完的蓝白（进度就算满）。
        // 空档里 anchorIndex 指的就是刚唱完的那句，所以是 >=。
        const isSung = !isSinging && anchorIndex >= lines.indexOf(line);
        const rowRtl = isRtlText(line.fullText);
        // 第一行贴左、第二行贴右；RTL 的行把里外两侧对调，免得文字和它靠的那条边打架。
        const textAlign = side === 'start'
            ? (rowRtl ? 'right' : 'left')
            : (rowRtl ? 'left' : 'right');
        const rowStyle: React.CSSProperties = {
            fontFamily,
            fontWeight,
            fontStyle: karaokeTuning.italic ? 'italic' : 'normal',
            fontSize: lineFontSize,
            lineHeight: 1.25,
            letterSpacing: '0.01em',
            direction: rowRtl ? 'rtl' : 'ltr',
            textAlign,
        };

        return (
            <div
                key={`${side}-${line.startTime}`}
                className="flex w-full shrink-0 flex-col"
            >
                {/* 三种状态共用同一套结构（下层量尺寸、上层填充），所以换行位置、行高在「未唱／正在唱／已唱」
                    之间完全一样。以前未唱和已唱是纯文本、正在唱是逐字 span 且带 white-space: pre，
                    一开唱折行消失、行高一塌，底部对齐的整块歌词就会上下跳一下。 */}
                <div
                    ref={isSinging ? (node: HTMLDivElement | null) => { if (node) scrollTargetRef.current = node; } : undefined}
                    className={`relative block w-full ${wrapMode ? 'whitespace-normal' : 'whitespace-nowrap'}`}
                    style={{
                        ...rowStyle,
                        willChange: 'transform',
                        // 刚轮过去的那一行可能还留着跟唱时的 translateX，这里显式清掉。
                        transform: isSinging ? undefined : 'none',
                    }}
                >
                    <div style={strokeStyle(karaokeTuning.idleFill, karaokeTuning.idleStroke, karaokeTuning.strokeWidth)}>
                        {renderChunks(rowChunks, 'idle', isSinging)}
                    </div>
                    <div
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{
                            ...strokeStyle(karaokeTuning.activeFill, karaokeTuning.activeStroke, karaokeTuning.strokeWidth),
                            // 还没轮到的那句：填充层留着但不可见，只为占住同样的框。
                            visibility: !isSinging && !isSung ? 'hidden' : 'visible',
                        }}
                    >
                        {renderChunks(rowChunks, 'filled', isSinging)}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={{ ...sharedProps, isDaylight }}
            className="visualizer-karaoke"
        >
            {/* 开头那段信息：歌名居中（歌词强调色），作词、作曲靠左（未激活歌词的颜色）。
                不透明度在 paintFill 里按播放时间写，不参与逐帧 React 渲染。 */}
            {showText && creditsText && (
                <div
                    ref={creditsRef}
                    className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center px-10"
                    // 先藏起来：挂载后 paintCredits 会按当前时间写一次，避免中途跳进来时闪一下。
                    style={{ opacity: 0, willChange: 'opacity' }}
                >
                    {creditsText.title && (
                        <h1
                            style={{
                                ...strokeStyle(karaokeTuning.activeFill, karaokeTuning.activeStroke, karaokeTuning.strokeWidth),
                                margin: 0,
                                fontFamily,
                                fontWeight,
                                fontStyle: karaokeTuning.italic ? 'italic' : 'normal',
                                fontSize: `calc(${lineFontSize} * 1.3)`,
                                lineHeight: 1.2,
                                letterSpacing: '0.02em',
                                textAlign: 'center',
                            }}
                        >
                            {creditsText.title}
                        </h1>
                    )}
                    {creditsText.rows.length > 0 && (
                        <div className="mt-5 flex flex-col items-start gap-1.5">
                            {creditsText.rows.map((row, index) => (
                                <h2
                                    key={`${index}-${row}`}
                                    style={{
                                        ...strokeStyle(
                                            karaokeTuning.idleFill,
                                            karaokeTuning.idleStroke,
                                            // 描边宽度是给歌词正文字号配的：标题区字号小一半，照搬会糊成一坨。
                                            Math.max(0.5, karaokeTuning.strokeWidth * 0.6),
                                        ),
                                        margin: 0,
                                        fontFamily,
                                        fontWeight,
                                        fontStyle: karaokeTuning.italic ? 'italic' : 'normal',
                                        fontSize: `calc(${lineFontSize} * 0.46)`,
                                        lineHeight: 1.35,
                                        letterSpacing: '0.04em',
                                        textAlign: 'left',
                                    }}
                                >
                                    {row}
                                </h2>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 句与句之间的空档 activeLine 会是 null：这时页面照样留着，否则整块歌词会卸载再挂载，
                看起来就是每句交界处上下抖一下。 */}
            {showText && (pageFirstLine || pageSecondLine) && (
                // 歌词沉在底部，两句一页：第一句靠左、第二句靠右；同一页里只有正在唱的那句会扫，
                // 另一句压暗当预告。第二句唱完才翻页（页的划分见上面的 pageStart）。
                <div
                    style={{ bottom: LYRICS_BOTTOM_PX }}
                    className="absolute inset-x-0 z-0 flex flex-col justify-end px-10 pointer-events-none"
                >
                    {/* 译文就一行浮在歌词上方：用主题的次要色和字幕字体，不带卡拉OK 的描边和配色。 */}
                    {activeLine?.translation && !hideTranslationSubtitle && (
                        // 译文和歌词在同一块画面里，字形得跟着走：开了繁体就一起转（非中文的译文原样）。
                        <div
                            key={`t-${activeLine.startTime}`}
                            className="mx-auto mb-3 max-w-4xl text-center"
                            style={{
                                color: resolvedSubtitleTheme.secondaryColor,
                                fontFamily: resolveThemeTranslationFontStack(resolvedSubtitleTheme),
                                fontWeight: resolveThemeFontWeight(resolvedSubtitleTheme, 500),
                                fontSize: subtitleFontSizes.translationFontSize,
                                textShadow: '0 2px 12px rgba(0,0,0,0.5)',
                                opacity: 0.92,
                            }}
                        >
                            {traditionalScript ? toTraditionalLyrics(activeLine.translation) : activeLine.translation}
                        </div>
                    )}
                    <motion.div
                        key={pageStart}
                        ref={clipRef}
                        // 关掉「切页动画」就是硬切：不给 initial，过渡时长也归零。
                        initial={pageAnimation && !staticMode ? { opacity: 0, y: 10 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={pageAnimation ? { duration: 0.28, ease: 'easeOut' } : { duration: 0 }}
                        className="flex w-full flex-col gap-2 overflow-hidden"
                        // 换行模式要给折行留够竖直空间：框太矮的话两行歌词一折行就顶到框外，
                        // 跟唱一往上推就露出一半、被裁掉一半，看上去就是「一滚就抖」。
                        style={wrapMode ? { maxHeight: WRAP_MAX_HEIGHT, justifyContent: 'flex-start' } : undefined}
                    >
                        <div ref={wrapTargetRef} className="flex w-full shrink-0 flex-col gap-2" style={{ willChange: 'transform' }}>
                            {renderRow(pageFirstLine, 'start', firstChunks)}
                            {renderRow(pageSecondLine, 'end', secondChunks)}
                        </div>
                    </motion.div>
                </div>
            )}

        </VisualizerShell>
    );
};

export default VisualizerKaraoke;
