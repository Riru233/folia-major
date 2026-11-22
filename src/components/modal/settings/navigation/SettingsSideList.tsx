import React from 'react';
import { CircleHelp, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SettingsSearchField from './SettingsSearchField';
import type { SettingsNavGroup, SettingsSectionId } from './settingsNavModel';
// src/components/modal/settings/navigation/SettingsSideList.tsx
// The settings' side list: a search field, then the categories under their group names, and Help at
// the foot. It lists categories only; what a page holds is in that page's header. The compact
// window opens this same list from its menu button, without the search field - the top bar keeps
// that one, so the list there starts straight at the categories.

// 「帮助」不在分类清单里，颜色只好在本地给一个：跟「常规」那类的中性灰同一支，不抢分类的色。
const HELP_ICON_COLOR = '#6b7c93';

type SettingsSideListProps = {
    groups: SettingsNavGroup[];
    /** The category on screen, 'help', or null while search results are shown. */
    activeId: SettingsSectionId | 'help' | null;
    onSelectSection: (sectionId: SettingsSectionId) => void;
    onSelectHelp: () => void;
    query: string;
    onQueryChange: (query: string) => void;
    /** Enter in the search field. */
    onSubmitQuery: () => void;
    /** 紧凑档的抽屉里不画搜索框：那一个在顶栏上（所以上面三个搜索参数仍要传，只是不被画出）。 */
    showSearch?: boolean;
};

export const SettingsSideList: React.FC<SettingsSideListProps> = ({
    groups,
    activeId,
    onSelectSection,
    onSelectHelp,
    query,
    onQueryChange,
    onSubmitQuery,
    showSearch = true,
}) => {
    const { t } = useTranslation();

    /* 图标不再是一条单色描边：每类一个色相，画在一块实色的彩色小方块上（24px、圆角 7px），
       图标本身是白的——像一排小徽章，扫读时是「一块块颜色」而不是「一堆线」。色块带一点自上而下的
       明暗过渡，平涂的小方块在浅色面板上会显得发灰；选中项只换行底色，不去动图标。 */
    const renderItem = (id: SettingsSectionId | 'help', Icon: LucideIcon, label: string, onSelect: () => void, color: string) => {
        const isActive = activeId === id;
        return (
            <button
                key={id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={onSelect}
                className={`flex h-[35px] w-full shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2 text-left text-[13px] transition-colors ${isActive ? 'bg-[var(--st-fill2)] text-[color:var(--st-t1)]' : 'text-[color:var(--st-t2)] hover:bg-[var(--st-fill)]'}`}
            >
                <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.18)]"
                    style={{ backgroundColor: color, backgroundImage: `linear-gradient(180deg, ${color}00, ${color}cc)` }}
                >
                    <Icon size={15} strokeWidth={2.15} />
                </span>
                <span className="truncate">{label}</span>
            </button>
        );
    };

    // 宽屏时这一栏就长在弹窗面板上，自己再刷一层底会和面板的颜色叠出两种灰；紧凑档它在抽屉里，
    // 抽屉本身没有底色，所以只有那一形态需要自己铺底（showSearch === false 只发生在抽屉里）。
    return (
        <aside className={`flex h-full min-h-0 w-full shrink-0 flex-col px-2.5 pb-2.5 pt-3.5 ${showSearch ? 'border-r border-[var(--st-line)]' : 'bg-[var(--bg-color)]'}`}>
            {showSearch && (
                <SettingsSearchField
                    query={query}
                    onQueryChange={onQueryChange}
                    onSubmitQuery={onSubmitQuery}
                    className="shrink-0"
                />
            )}
            <nav className="mt-1 flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden">
                {groups.map(group => (
                    <div key={group.id} className="flex flex-col gap-px">
                        <div className="block px-2.5 pb-1 pt-3.5 text-xs leading-[18px] text-[color:var(--st-t3)]">
                            {group.label}
                        </div>
                        {group.items.map(section => renderItem(section.id, section.icon, section.label, () => onSelectSection(section.id), section.color))}
                    </div>
                ))}
            </nav>
            {/* 「帮助」不跟着分类列表滚：它钉在侧栏底部，列表再长也只在自己那块里滚。 */}
            <div className="mt-2 shrink-0 border-t border-[var(--st-line)] pt-2">
                {renderItem('help', CircleHelp, t('help.title'), onSelectHelp, HELP_ICON_COLOR)}
            </div>
        </aside>
    );
};

export default SettingsSideList;
