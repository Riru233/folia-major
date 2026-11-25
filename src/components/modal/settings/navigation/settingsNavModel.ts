import { Boxes, Cable, Clapperboard, Contrast, Database, FlaskConical, Gauge, Keyboard, LayoutGrid, Link2, Monitor, MonitorPlay, PictureInPicture2, PlayCircle, SlidersHorizontal, Sparkles, Terminal, TextAlignStart, type LucideIcon } from 'lucide-react';
import { SHINO_LAB_ENTRY_HIDDEN } from '@/shinoinject/lab/labVideoGate';
// src/components/modal/settings/navigation/settingsNavModel.ts
// Single source of truth for the settings categories: their order in the side list, their grouping,
// icons and names. A category is cut by what the listener is looking at or doing, so each page holds
// one subject; which page an option is on is settingsAnchorModel's and the page files' to say.

export type SettingsSectionId =
    | 'appearance'
    | 'player'
    | 'home'
    | 'graphics'
    | 'playback'
    | 'lyrics'
    | 'sources'
    | 'general'
    | 'interaction'
    | 'integration'
    | 'ai'
    | 'storage'
    | 'desktop'
    | 'lab'
    | 'remote'
    | 'video'
    | 'mods'
    | 'developer';

export interface SettingsNavItem {
    id: SettingsSectionId;
    icon: LucideIcon;
    /** 侧栏里这一项的图标色：每类一个色相，图标和它下面那块淡色底都用它。 */
    color: string;
    label: string;
}

export interface SettingsNavGroup {
    id: string;
    label: string;
    items: SettingsNavItem[];
}

type Translate = (key: string) => string;

interface SectionSpec {
    id: SettingsSectionId;
    icon: LucideIcon;
    color: string;
    labelKey: string;
    /** Sections that only exist on the desktop build. */
    electronOnly?: boolean;
    /** 只在 Shino 实验室打开「在线视频」时才出现。 */
    onlineVideoOnly?: boolean;
    /**
     * 这一版先不露面：侧栏不显示、命令面板不进、上次停留的页面读到也回退到默认页。
     * 页面本身还注册着（[pages] 里那份不删），所以谁也进不来，但改回来只动这个标记。
     */
    hidden?: boolean;
}

interface GroupSpec {
    id: string;
    labelKey: string;
    sections: SectionSpec[];
}

export const SETTINGS_NAV_GROUP_SPECS: GroupSpec[] = [
    {
        id: 'interface',
        labelKey: 'options.settingsGroupInterface',
        sections: [
            { id: 'appearance', color: '#8b7cf6', icon: Contrast, labelKey: 'options.settingsPageAppearance' },
            { id: 'player', color: '#e07a3f', icon: MonitorPlay, labelKey: 'options.settingsPagePlayer' },
            { id: 'home', color: '#3b9ae1', icon: LayoutGrid, labelKey: 'options.settingsPageHome' },
            { id: 'graphics', color: '#18a67c', icon: Gauge, labelKey: 'options.settingsPageGraphics' },
        ],
    },
    {
        id: 'music',
        labelKey: 'options.settingsGroupMusic',
        sections: [
            { id: 'playback', color: '#e2568f', icon: PlayCircle, labelKey: 'options.settingsPagePlayback' },
            { id: 'lyrics', color: '#9b5cf0', icon: TextAlignStart, labelKey: 'options.settingsPageLyrics' },
            // Folium 2.0 (plan §5.3): every online source's state. The states live in the desktop main process.
            { id: 'sources', color: '#d9663d', icon: Cable, labelKey: 'options.settingsPageSources', electronOnly: true },
        ],
    },
    {
        id: 'app',
        labelKey: 'options.settingsGroupApp',
        sections: [
            { id: 'general', color: '#6b7c93', icon: SlidersHorizontal, labelKey: 'options.settingsPageGeneral' },
            { id: 'interaction', color: '#c9932a', icon: Keyboard, labelKey: 'options.settingsPageInteraction' },
            { id: 'integration', color: '#2fa7a7', icon: Link2, labelKey: 'options.settingsPageIntegration' },
            // 所有 AI 功能共用的接口与密钥：主题生成以及之后用到 AI 的地方都读这一份。
            // 网页版没有用户侧的密钥（部署自己配），所以只在桌面端出现。
            { id: 'ai', color: '#a855f7', icon: Sparkles, labelKey: 'options.settingsPageAi', electronOnly: true },
            { id: 'storage', color: '#4f7df3', icon: Database, labelKey: 'options.settingsPageStorage' },
            { id: 'desktop', color: '#4e8fe6', icon: Monitor, labelKey: 'options.settingsPageDesktop', electronOnly: true },
            // The Remote Control window is a desktop-app window; its settings key opens this page.
            { id: 'remote', color: '#e05353', icon: PictureInPicture2, labelKey: 'options.settingsPageRemote', electronOnly: true },
        ],
    },
    {
        id: 'advanced',
        labelKey: 'options.settingsGroupAdvanced',
        sections: [
            // 实验室：还带着「实验」标签的功能。视频播放与 bilibili 的视频背景都在这里，关掉开关
            // 它们带来的设置、背景类型和面板入口就一起消失。
            // 这一版整体不露面：入口与里面的实验（在线视频 / 本地视频 / bilibili MV）由
            // SHINO_LAB_ENTRY_HIDDEN 一处统一按关处理，改回 false 就全部恢复。
            { id: 'lab', color: '#38a169', icon: FlaskConical, labelKey: 'options.settingsPageShinoLab', hidden: SHINO_LAB_ENTRY_HIDDEN },
            // 视频分区跟着实验室里的「在线视频」开关走：关掉时连侧栏项一起消失。
            { id: 'video', color: '#d98f3c', icon: Clapperboard, labelKey: 'options.settingsPageVideo', onlineVideoOnly: true },
            // The loader only exists in the desktop main process; on web there is nothing to switch on.
            { id: 'mods', color: '#a1743c', icon: Boxes, labelKey: 'options.settingsPageMods', electronOnly: true },
            { id: 'developer', color: '#5a6472', icon: Terminal, labelKey: 'options.settingsPageDeveloper' },
        ],
    },
];

/** Resolves the grouping into translated nav items, dropping desktop-only sections (and groups left empty) on web. */
export const buildSettingsNavGroups = (
    t: Translate,
    options: { isElectron: boolean; onlineVideoEnabled?: boolean },
): SettingsNavGroup[] => (
    SETTINGS_NAV_GROUP_SPECS
        .map(group => ({
            id: group.id,
            label: t(group.labelKey),
            items: group.sections
                .filter(section => !section.hidden
                    && (!section.electronOnly || options.isElectron)
                    && (!section.onlineVideoOnly || options.onlineVideoEnabled === true))
                .map(section => ({
                    id: section.id,
                    icon: section.icon,
                    color: section.color,
                    label: t(section.labelKey),
                })),
        }))
        .filter(group => group.items.length > 0)
);

export const flattenSettingsNavItems = (groups: SettingsNavGroup[]): SettingsNavItem[] => (
    groups.flatMap(group => group.items)
);

export const findSettingsNavItem = (groups: SettingsNavGroup[], id: SettingsSectionId): SettingsNavItem | undefined => (
    flattenSettingsNavItems(groups).find(item => item.id === id)
);
