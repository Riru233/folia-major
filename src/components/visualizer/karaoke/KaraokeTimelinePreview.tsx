import React, { useMemo } from 'react';
import { Row } from '../../modal/settings/kit';
import type { VisualizerSettingsPanelProps } from '../definition';
import { selectDisplayLyrics, selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { useKaraokeInfoOverrideStore } from '../../../stores/useKaraokeInfoOverrideStore';
import { useKaraokeLeadInStore } from '../../../stores/useKaraokeLeadInStore';
import { resolveKaraokeCredits } from './karaokeCredits';
import { LEAD_IN_DOT_COLORS } from './karaokeLeadIn';
import { buildKaraokeTimeline } from './karaokeTimeline';
import type { KaraokeTuning } from './types';

// src/components/visualizer/karaoke/KaraokeTimelinePreview.tsx
// 设置面板里的时间轴预览：这首歌开头那几秒长什么样——信息块亮多久、交叉窗在哪、
// 三个预备点各在什么时候消失、第一句什么时候开口。拖下面的滑块时这里跟着走，
// 数字不再靠脑补。几何用一个固定的 viewBox 画，容器多宽都等比缩放。

const WIDTH = 320;
const HEIGHT = 60;
const PAD_X = 4;
const PLOT = WIDTH - PAD_X * 2;

/** 三条轨道和坐标轴的高度：信息、交叉窗、预备点。 */
const TRACK = {
    info: { y: 4, height: 8 },
    overlap: { y: 18, height: 8 },
    dots: { y: 35, radius: 4 },
    axis: 48,
};

/** 秒数标签：十秒以内留一位小数，再长取整，轴尾不至于挤成一片。 */
const formatTime = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)}s`;

const KaraokeTimelinePreview: React.FC<{
    t: VisualizerSettingsPanelProps['t'];
    tuning: KaraokeTuning;
}> = ({ t, tuning }) => {
    const displaySong = usePlaybackStore(selectDisplaySong);
    const displayLyrics = usePlaybackStore(selectDisplayLyrics);
    /** 空数组每次都是新的，不能当依赖：只认歌词对象本身。 */
    const lyricsLines = displayLyrics?.lines;
    const songKey = displaySong ? getPlaybackSongKey(displaySong) : null;
    const infoOverride = useKaraokeInfoOverrideStore(state => (songKey ? state.bySong[songKey] : undefined));
    const leadInOverride = useKaraokeLeadInStore(state => (songKey ? state.bySong[songKey] : undefined));
    const leadInSeconds = typeof leadInOverride === 'number' ? leadInOverride : tuning.leadInSeconds;

    // 和渲染器同一套识别：手动/模型给出的信息行优先，否则按开头那一段自动认。
    const credits = useMemo(() => resolveKaraokeCredits(lyricsLines ?? [], {
        title: infoOverride?.title || displaySong?.name || null,
        hiddenIndexes: infoOverride ? infoOverride.hiddenIndexes : null,
        rows: infoOverride?.rows ?? null,
    }), [lyricsLines, displaySong, infoOverride]);

    const timeline = useMemo(() => buildKaraokeTimeline({
        credits,
        leadInSeconds,
        leadInGapSeconds: tuning.leadInGapSeconds,
        advanceSeconds: tuning.creditsAdvanceSeconds,
    }), [credits, leadInSeconds, tuning.leadInGapSeconds, tuning.creditsAdvanceSeconds]);

    // 秒 → 横坐标。所有矩形和点都走这一个换算，区间贴边也不会画到框外。
    const x = (time: number) => PAD_X + (Math.min(Math.max(time, 0), timeline.span) / timeline.span) * PLOT;
    const span = (from: number, to: number) => Math.max(1.5, x(to) - x(from));

    const label = t('options.karaokeTimeline');
    const legend = [
        { key: 'info', color: 'var(--st-accent)', text: t('options.karaokeTimelineInfo') },
        { key: 'overlap', color: 'var(--st-t3)', text: t('options.karaokeTimelineOverlap') },
        { key: 'dots', color: LEAD_IN_DOT_COLORS[0], text: t('options.karaokeTimelineDots') },
        { key: 'lyric', color: 'var(--st-t2)', text: t('options.karaokeTimelineFirstLyric') },
    ];

    return (
        <Row
            label={label}
            hint={t('options.karaokeTimelineHint')}
            below={(
                <>
                    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={label}>
                        {/* 交叉窗：标题、信息、预备点、歌词同屏的那一段。 */}
                        {timeline.overlap && timeline.overlap.end > timeline.overlap.start && (
                            <rect
                                x={x(timeline.overlap.start)}
                                y={TRACK.overlap.y}
                                width={span(timeline.overlap.start, timeline.overlap.end)}
                                height={TRACK.overlap.height}
                                rx={3}
                                fill="var(--st-t3)"
                                opacity={0.35}
                            />
                        )}
                        {/* 信息块：从 0s 一直亮到淡完，只有右端随「提前消失」前移。 */}
                        {timeline.info && timeline.info.end > timeline.info.start && (
                            <rect
                                x={x(timeline.info.start)}
                                y={TRACK.info.y}
                                width={span(timeline.info.start, timeline.info.end)}
                                height={TRACK.info.height}
                                rx={3}
                                fill="var(--st-accent)"
                                opacity={0.8}
                            />
                        )}
                        {/* 交叉点：第一句开口。 */}
                        {timeline.lyricStart !== null && (
                            <line
                                x1={x(timeline.lyricStart)}
                                y1={2}
                                x2={x(timeline.lyricStart)}
                                y2={TRACK.axis}
                                stroke="var(--st-t2)"
                                strokeWidth={1}
                                strokeDasharray="2 2"
                            />
                        )}
                        {/* 三个预备点：位置就是它们各自消失的时刻，颜色和画面上一致。 */}
                        {timeline.dots.map((at, index) => (
                            <circle
                                key={LEAD_IN_DOT_COLORS[index]}
                                cx={x(at)}
                                cy={TRACK.dots.y}
                                r={TRACK.dots.radius}
                                fill={LEAD_IN_DOT_COLORS[index]}
                                stroke="#ffffff"
                                strokeWidth={1}
                            />
                        ))}
                        {/* 没有信息行（或还没开始播放）时，轨道空着会看着像坏了：说一句。 */}
                        {!timeline.info && (
                            <text x={WIDTH / 2} y={26} fontSize={10} fill="var(--st-t3)" textAnchor="middle">
                                {t('options.karaokeTimelineEmpty')}
                            </text>
                        )}
                        {/* 坐标轴：起点和终点各一个时间，中间留刻度。 */}
                        <line
                            x1={PAD_X}
                            y1={TRACK.axis}
                            x2={PAD_X + PLOT}
                            y2={TRACK.axis}
                            stroke="var(--st-line2)"
                            strokeWidth={1}
                        />
                        {[0, 0.25, 0.5, 0.75, 1].map(part => (
                            <line
                                key={part}
                                x1={PAD_X + part * PLOT}
                                y1={TRACK.axis}
                                x2={PAD_X + part * PLOT}
                                y2={TRACK.axis + 3}
                                stroke="var(--st-line2)"
                                strokeWidth={1}
                            />
                        ))}
                        <text x={PAD_X} y={HEIGHT - 1} fontSize={9} fill="var(--st-t3)">0s</text>
                        <text x={PAD_X + PLOT} y={HEIGHT - 1} fontSize={9} fill="var(--st-t3)" textAnchor="end">
                            {formatTime(timeline.span)}
                        </text>
                    </svg>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-[16px] text-[color:var(--st-t3)]">
                        {legend.map(item => (
                            <span key={item.key} className="inline-flex items-center gap-1">
                                {item.key === 'dots' ? (
                                    <span className="inline-flex items-center gap-[2px]">
                                        {LEAD_IN_DOT_COLORS.map(color => (
                                            <span
                                                key={color}
                                                className="inline-block h-2 w-2 rounded-full"
                                                style={{ backgroundColor: color, boxShadow: 'inset 0 0 0 1px #ffffff' }}
                                            />
                                        ))}
                                    </span>
                                ) : (
                                    <span
                                        className="inline-block h-[3px] w-3 rounded-full"
                                        style={{ backgroundColor: item.color, opacity: item.key === 'overlap' ? 0.5 : 1 }}
                                    />
                                )}
                                {item.text}
                            </span>
                        ))}
                    </div>
                </>
            )}
        >
            {timeline.lyricStart !== null && (
                <span className="shrink-0 whitespace-nowrap text-xs leading-[18px] text-[color:var(--st-t3)]">
                    {`${t('options.karaokeTimelineFirstLyric')} ${formatTime(timeline.lyricStart)}`}
                </span>
            )}
        </Row>
    );
};

export default KaraokeTimelinePreview;
