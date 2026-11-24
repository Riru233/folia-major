import React from 'react';
import type { CSSProperties } from 'react';
import { EXPLORE_TOKENS } from '../../../../components/app/home/explore/ExploreParts';

// src/library/suites/grid/home/OnlineVideoExplore.tsx
// 在线视频的「探索」页：先照搬在线音乐探索页（ExploreSurface）的版式——首段是一张大图配一列
// 条目，其余各段是横向排开的宽图，段标题用同一套衬线大字加一条横线——但暂时不接 bilibili 数据，
// 所以每个位置都先摆占位块。数据接进来时，把占位块换成真实的卡片即可，版式不用再动。

/** 一段的骨架：首段是大图 + 列表，其余是横向的宽图。 */
interface SectionShape {
    /** 这一段的占位有多高，压着不放内容。 */
    tiles: number;
    lead?: boolean;
}

const SECTIONS: readonly SectionShape[] = [
    { lead: true, tiles: 5 },
    { tiles: 6 },
    { tiles: 6 },
    { tiles: 6 },
];

const SOLID = 'bg-[var(--ex-tint-strong)]';
const FAINT = 'bg-[var(--ex-tint)]';

/** 段标题：音乐探索页是同款衬线大字 + 一条向左伸出的细线。没有标题可写时就是一根长条。 */
const SectionHeading: React.FC = () => (
    <div className="mb-2 flex items-center gap-2.5">
        <span className={`my-1 h-8 w-44 animate-pulse rounded-full ${SOLID}`} />
        <span aria-hidden className="ml-1 h-px min-w-6 flex-1 bg-[var(--ex-line)]" />
    </div>
);

/** 首段左侧的大图，连带标题与副标题两行。 */
const LeadPlaceholder: React.FC = () => (
    <div className="w-full max-w-[384px] shrink-0">
        <span className={`block aspect-video w-full animate-pulse rounded-3xl ${SOLID}`} />
        <span className={`mt-5 block h-6 w-3/4 animate-pulse rounded-full ${SOLID}`} />
        <span className={`mt-2 block h-3 w-1/3 animate-pulse rounded-full ${FAINT}`} />
    </div>
);

/** 首段右侧的条目列：小缩略图 + 两行字，与音乐探索页的 LEAD_LISTED 一致（一列五条）。 */
const LeadLines: React.FC<{ count: number }> = ({ count }) => (
    <div className="grid min-w-0 flex-1 content-start gap-x-6 gap-y-2 lg:grid-cols-2">
        {Array.from({ length: count }, (_, index) => (
            <div key={index} className="flex items-center gap-4 rounded-2xl px-2.5 py-2">
                <span className={`h-[54px] w-24 shrink-0 animate-pulse rounded-xl ${SOLID}`} />
                <span className="block min-w-0 flex-1">
                    <span className={`block h-3 w-3/5 animate-pulse rounded-full ${SOLID}`} />
                    <span className={`mt-2 block h-2.5 w-2/5 animate-pulse rounded-full ${FAINT}`} />
                </span>
            </div>
        ))}
    </div>
);

/** 一张横向的占位卡：16:9 的图 + 标题与副标题，和音乐探索页里的宽图同一尺寸。 */
const TilePlaceholder: React.FC = () => (
    <div className="w-[288px] shrink-0">
        <span className={`block aspect-video w-full animate-pulse rounded-2xl ${SOLID}`} />
        <span className={`mt-3 block h-3 w-4/5 animate-pulse rounded-full ${SOLID}`} />
        <span className={`mt-2 block h-2.5 w-1/2 animate-pulse rounded-full ${FAINT}`} />
    </div>
);

const RowPlaceholder: React.FC<{ count: number }> = ({ count }) => (
    <div className="-mx-2 flex items-start gap-5 overflow-x-auto px-2 pb-7 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: count }, (_, index) => <TilePlaceholder key={index} />)}
    </div>
);

const pageStyle: CSSProperties = { ...EXPLORE_TOKENS, color: 'var(--text-primary)' };

const OnlineVideoExplore: React.FC = () => (
    <div className="relative h-full w-full self-stretch" style={pageStyle} data-testid="online-video-explore">
        {/* 滚动层铺满整个页签层；内容宽度与音乐探索页一致（max-w-7xl，左侧给竖栏留 95px）。 */}
        <div className="absolute inset-0 h-full w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="mx-auto w-full max-w-7xl pb-12 pr-8 pt-2 pl-[95px]">
                {SECTIONS.map((section, index) => (
                    <section key={index} data-explore-shelf>
                        <div className={section.lead ? 'pb-[72px]' : 'pb-14'}>
                            <SectionHeading />
                            {section.lead ? (
                                <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
                                    <LeadPlaceholder />
                                    <LeadLines count={section.tiles} />
                                </div>
                            ) : (
                                <RowPlaceholder count={section.tiles} />
                            )}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    </div>
);

export default OnlineVideoExplore;
