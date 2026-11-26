import React from 'react';
import { X } from 'lucide-react';
import { Tabs } from './Tabs';
import { SettingsPageEdgeBlur } from './PageEdgeBlur';

// src/components/modal/settings/kit/PageHeader.tsx
// The head of a settings page: a row with its title and the close button, and under it the kit's
// Tabs, one tab for each group on the page. The tab of the group in view carries the line, which
// slides to another tab as the page scrolls; a click on a tab goes to its group. A hairline closes
// the head. A page of one group has no tabs, and a `summary` takes their place.

type PageHeaderProps = {
    title: string;
    /** The page's groups, in the order they are on the page. */
    contents: ReadonlyArray<{ id: string; label: string }>;
    /** The group in view. */
    activeId: string | null;
    onSelect: (id: string) => void;
    /** Shown in place of the tabs, e.g. how many options a search found. */
    summary?: string;
    closeLabel: string;
    onClose: () => void;
    /**
     * 紧凑档的关闭按钮在顶上那条导航栏的右端（搜索框右边），这里就不再画一颗。
     * 默认画，宽屏照旧。
     */
    showClose?: boolean;
};

const UNDER_ROW_PADDING = 'px-4 pt-1 md:px-8 md:pt-2';

export const PageHeader: React.FC<PageHeaderProps> = ({ title, contents, activeId, onSelect, summary, closeLabel, onClose, showClose = true }) => {
    const hasTabs = summary === undefined && contents.length > 1;

    return (
        <header className="st-page-head relative isolate z-30 shrink-0">
            {/* 顶栏自己那层渐进模糊：铺满整个 header 作为它的背景，文字压在它上面。
                它必须在 header 里、跟着 header 一起浮在正文上层，blur 的才是从下面穿过的正文。 */}
            <SettingsPageEdgeBlur />
            <div className={`flex items-center justify-between gap-3 pl-4 pr-3 pt-4 md:pl-8 md:pr-4 md:pt-5${hasTabs || summary !== undefined ? '' : ' border-b border-[var(--st-line)] pb-3 md:pb-4'}`}>
                <h2 className="min-w-0 truncate text-[22px] leading-8 text-[color:var(--text-color)]">{title}</h2>
                {showClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={closeLabel}
                        className="st-t-fast grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[color:var(--st-t2)] transition-colors hover:bg-[var(--st-fill)] hover:text-[color:var(--st-t1)]"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
            {summary !== undefined && (
                <div className={`border-b border-[var(--st-line)] ${UNDER_ROW_PADDING} truncate text-[13px] leading-9 text-[color:var(--st-t2)]`}>{summary}</div>
            )}
            {hasTabs && <Tabs contents tabs={contents} activeId={activeId} onSelect={onSelect} className={UNDER_ROW_PADDING} />}
        </header>
    );
};

export default PageHeader;
