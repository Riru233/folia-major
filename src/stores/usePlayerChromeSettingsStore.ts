// src/stores/usePlayerChromeSettingsStore.ts
// What the player page shows around the lyrics: the progress bar, the back and track-switch
// buttons, the titlebar, the transparent background and the auto-hide behaviour.
//
// Split out of useSettingsUiStore.
//
// @note 这里除 player_header_blur 以外的设置（播放页控件、底部播放条的样式与固定、标题栏、鼠标指针、透明背景、系统材质）是用户明确决定
// 「不进外观配置导入导出」的（2026-11-08）：配置码也用于 web 版 OBS 链接，只加 OBS 页面看得到的，
// OBS 页面隐藏了这些控件。不要按 settings-feature-integration「视觉设置必须进
// buildCurrentConfig / compressConfig / decompressConfig / validKeys / handleImportConfig」的规则把它们补进短码或 JSON。

import { create } from 'zustand';
import i18n from '../i18n/config';
import {
    DEFAULT_PLAYER_CONTROL_SLOT_PRIMARY,
    DEFAULT_PLAYER_CONTROL_SLOT_SECONDARY,
    isPlayerControlSlotActionId,
    type PlayerControlSlotActionId,
} from '../types/playerControlSlots';
import { PLAYER_BOTTOM_BAR_BASE_OFFSET_PX } from '../utils/playerBottomBarLayout';
import { getStoredBoolean, getStoredString, setStoredBoolean, setStoredString } from './storagePrimitives';
import { setStatusMessage } from './useStatusMessageStore';

const PLAYER_BOTTOM_BAR_OFFSET_STORAGE_KEY = 'player_bottom_bar_offset';
const PLAYER_CONTROL_SLOT_PRIMARY_STORAGE_KEY = 'player_control_slot_primary';
const PLAYER_CONTROL_SLOT_SECONDARY_STORAGE_KEY = 'player_control_slot_secondary';
const PLAYER_BAR_PINNED_STORAGE_KEY = 'player_bar_pinned';

/** All platforms default to the right; explicit choices are kept and malformed values ignored. */
const readTitlebarSide = (): 'left' | 'right' => {
    const fallback = 'right';
    const value = getStoredString('window_titlebar_side', fallback);
    return value === 'left' || value === 'right' ? value : fallback;
};
const PLAYER_BAR_STYLE_STORAGE_KEY = 'player_bar_style';
const DOCKED_BAR_APPEARANCE_STORAGE_KEY = 'docked_player_bar_appearance';

/**
 * 底部播放条的两套外观：
 * - `floating`：原来那条可拖动的液态玻璃胶囊（FloatingPlayerControls）；
 * - `docked`：贴着窗口底边的一条完整播放栏（标题 / 封面 / 传输键 / 进度条）。
 */
export type PlayerBarStyle = 'floating' | 'docked';

const PLAYER_BAR_STYLES: readonly PlayerBarStyle[] = ['floating', 'docked'];

/**
 * 停靠控制栏的两套配色（布局、图标、位置都一样，只有颜色不同）：
 * - `dreamcore`：原来那套——底部一层深色渐变、蓝色玻璃播放键，浅色与深色沿用原来的颜色；
 * - `monet`：底部同样是一层往上淡到透明的渐变，只是颜色换成莫奈的：日间底边暖白、往上淡紫，夜间底边黑、往上深靛紫。
 */
export type DockedBarAppearance = 'dreamcore' | 'monet';

const DOCKED_BAR_APPEARANCES: readonly DockedBarAppearance[] = ['dreamcore', 'monet'];

const readStoredPlayerBarStyle = (): PlayerBarStyle => {
    if (typeof window === 'undefined') {
        return 'floating';
    }
    const saved = localStorage.getItem(PLAYER_BAR_STYLE_STORAGE_KEY);
    return PLAYER_BAR_STYLES.includes(saved as PlayerBarStyle) ? saved as PlayerBarStyle : 'floating';
};

const readStoredDockedBarAppearance = (): DockedBarAppearance => {
    const saved = getStoredString(DOCKED_BAR_APPEARANCE_STORAGE_KEY, 'dreamcore');
    return DOCKED_BAR_APPEARANCES.includes(saved as DockedBarAppearance)
        ? saved as DockedBarAppearance
        : 'dreamcore';
};

/** Reads the persisted lower-bounded offset; the viewport-dependent upper bound is applied by consumers. */
const readStoredPlayerBottomBarOffset = (): number => {
    if (typeof window === 'undefined') {
        return PLAYER_BOTTOM_BAR_BASE_OFFSET_PX;
    }

    const parsed = parseFloat(localStorage.getItem(PLAYER_BOTTOM_BAR_OFFSET_STORAGE_KEY) ?? '');
    if (!Number.isFinite(parsed)) {
        return PLAYER_BOTTOM_BAR_BASE_OFFSET_PX;
    }

    return Math.max(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, Math.round(parsed));
};

const readStoredPlayerControlSlot = (
    key: string,
    fallback: PlayerControlSlotActionId,
): PlayerControlSlotActionId => {
    if (typeof window === 'undefined') {
        return fallback;
    }

    const saved = localStorage.getItem(key);
    return isPlayerControlSlotActionId(saved) ? saved : fallback;
};

export type PlayerChromeSettingsState = {
    hidePlayerProgressBar: boolean;
    playerBottomBarOffset: number;
    /** 底部播放条被固定：固定后它不再随鼠标离开而收缩。 */
    playerBarPinned: boolean;
    /** 底部播放条的外观：浮动胶囊还是贴底的停靠栏。 */
    playerBarStyle: PlayerBarStyle;
    /** 停靠栏的配色；浮动胶囊不受它影响。 */
    dockedBarAppearance: DockedBarAppearance;
    playerControlSlotPrimary: PlayerControlSlotActionId;
    playerControlSlotSecondary: PlayerControlSlotActionId;
    hidePlayerRightPanelButton: boolean;
    alwaysShowPlayerBackButton: boolean;
    alwaysShowTrackSwitchButtons: boolean;
    alwaysShowMainWindowTitlebar: boolean;
    /** A frosted bar behind the window titlebar on the player page, so its buttons read over any picture. */
    playerHeaderBlur: boolean;
    titlebarSide: 'left' | 'right';
    handleSetTitlebarSide: (side: 'left' | 'right') => void;
    hideFullscreenButton: boolean;
    useNativeMacFullscreenButton: boolean;
    useNativeMacTrafficLights: boolean;
    transparentPlayerBackground: boolean;
    enablePlayerPageNativeBlur: boolean;
    autoHidePlayerChrome: boolean;
    autoHideCursorWithPlayerChrome: boolean;
    hideCursorWhenIdle: boolean;
    showOpenPanelCloseButton: boolean;
    setTransparentPlayerBackgroundFromSystem: (enabled: boolean) => void;
    handleTogglePlayerPageNativeBlur: (enable: boolean) => void;
    handleToggleHidePlayerProgressBar: (enable: boolean) => void;
    handleSetPlayerBottomBarOffset: (offsetPx: number) => void;
    handleTogglePlayerBarPinned: (enable: boolean) => void;
    handleSetPlayerBarStyle: (style: PlayerBarStyle) => void;
    handleSetDockedBarAppearance: (appearance: DockedBarAppearance) => void;
    handleSetPlayerControlSlot: (slot: 'primary' | 'secondary', actionId: PlayerControlSlotActionId) => void;
    handleToggleHidePlayerRightPanelButton: (enable: boolean) => void;
    handleToggleAlwaysShowPlayerBackButton: (enable: boolean) => void;
    handleToggleAlwaysShowTrackSwitchButtons: (enable: boolean) => void;
    handleToggleAlwaysShowMainWindowTitlebar: (enable: boolean) => void;
    handleTogglePlayerHeaderBlur: (enable: boolean) => void;
    handleToggleHideFullscreenButton: (enable: boolean) => void;
    handleToggleNativeMacFullscreenButton: (enable: boolean) => void;
    handleToggleNativeMacTrafficLights: (enable: boolean) => void;
    handleToggleTransparentPlayerBackground: (enable: boolean) => void;
    handleWallpaperTransparentRefused: () => void;
    handleToggleAutoHidePlayerChrome: (enable: boolean) => void;
    handleToggleAutoHideCursorWithPlayerChrome: (enable: boolean) => void;
    handleToggleHideCursorWhenIdle: (enable: boolean) => void;
    handleToggleOpenPanelCloseButton: (enable: boolean) => void;
};

export const usePlayerChromeSettingsStore = create<PlayerChromeSettingsState>((set, get) => ({
    hidePlayerProgressBar: getStoredBoolean('hide_player_progress_bar', false),
    playerBottomBarOffset: readStoredPlayerBottomBarOffset(),
    playerBarPinned: getStoredBoolean(PLAYER_BAR_PINNED_STORAGE_KEY, false),
    playerBarStyle: readStoredPlayerBarStyle(),
    dockedBarAppearance: readStoredDockedBarAppearance(),
    playerControlSlotPrimary: readStoredPlayerControlSlot(
        PLAYER_CONTROL_SLOT_PRIMARY_STORAGE_KEY,
        DEFAULT_PLAYER_CONTROL_SLOT_PRIMARY,
    ),
    playerControlSlotSecondary: readStoredPlayerControlSlot(
        PLAYER_CONTROL_SLOT_SECONDARY_STORAGE_KEY,
        DEFAULT_PLAYER_CONTROL_SLOT_SECONDARY,
    ),
    hidePlayerRightPanelButton: getStoredBoolean('hide_player_right_panel_button', false),
    alwaysShowPlayerBackButton: getStoredBoolean('always_show_player_back_button', false),
    alwaysShowTrackSwitchButtons: getStoredBoolean('always_show_track_switch_buttons', false),
    alwaysShowMainWindowTitlebar: getStoredBoolean('always_show_main_window_titlebar', false),
    playerHeaderBlur: getStoredBoolean('player_header_blur', false),
    titlebarSide: readTitlebarSide(),
    handleSetTitlebarSide: (side) => {
        setStoredString('window_titlebar_side', side);
        set({ titlebarSide: side });
    },
    hideFullscreenButton: getStoredBoolean('hide_fullscreen_button', false),
    useNativeMacFullscreenButton: getStoredBoolean('use_native_mac_fullscreen_button', false),
    useNativeMacTrafficLights: getStoredBoolean('use_native_mac_traffic_lights', false),
    transparentPlayerBackground: getStoredBoolean('transparent_player_background', false),
    enablePlayerPageNativeBlur: getStoredBoolean('enable_player_page_native_blur', false),
    autoHidePlayerChrome: getStoredBoolean('auto_hide_player_chrome', false),
    // Rides the chrome auto-hide clock rather than owning one: the cursor goes away with the
    // controls it would have clicked. Opt-out, so auto-hide can keep the pointer if wanted.
    autoHideCursorWithPlayerChrome: getStoredBoolean('auto_hide_cursor_with_player_chrome', true),
    hideCursorWhenIdle: getStoredBoolean('hide_cursor_when_idle', false),
    showOpenPanelCloseButton: getStoredBoolean('show_open_panel_close_button', true),
    setTransparentPlayerBackgroundFromSystem: (enabled) => {
        setStoredBoolean('transparent_player_background', enabled);
        set({ transparentPlayerBackground: enabled });
    },
    handleTogglePlayerPageNativeBlur: (enable) => {
        setStoredBoolean('enable_player_page_native_blur', enable);
        set({ enablePlayerPageNativeBlur: enable });
        if (window.electron?.saveSettings) {
            void window.electron.saveSettings('enable_player_page_native_blur', enable);
        }
    },
    handleToggleAutoHidePlayerChrome: (enabled: boolean) => {
        localStorage.setItem('auto_hide_player_chrome', enabled ? 'true' : 'false');
        set({ autoHidePlayerChrome: enabled });
    },
    handleToggleAutoHideCursorWithPlayerChrome: (enable) => {
        setStoredBoolean('auto_hide_cursor_with_player_chrome', enable);
        set({ autoHideCursorWithPlayerChrome: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'cursorAutoHideOn' : 'cursorAutoHideOff')),
        });
    },
    handleToggleHideCursorWhenIdle: (enable) => {
        setStoredBoolean('hide_cursor_when_idle', enable);
        set({ hideCursorWhenIdle: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'cursorIdleHideOn' : 'cursorIdleHideOff')),
        });
    },
    handleToggleHidePlayerProgressBar: (enable) => {
        setStoredBoolean('hide_player_progress_bar', enable);
        set({ hidePlayerProgressBar: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'progressBarHidden' : 'progressBarShown')),
        });
    },
    handleSetPlayerBottomBarOffset: (offsetPx) => {
        const next = Number.isFinite(offsetPx)
            ? Math.max(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, Math.round(offsetPx))
            : PLAYER_BOTTOM_BAR_BASE_OFFSET_PX;
        if (typeof window !== 'undefined') {
            localStorage.setItem(PLAYER_BOTTOM_BAR_OFFSET_STORAGE_KEY, String(next));
        }
        set({ playerBottomBarOffset: next });
    },
    handleTogglePlayerBarPinned: (enable: boolean) => {
        setStoredBoolean(PLAYER_BAR_PINNED_STORAGE_KEY, enable);
        set({ playerBarPinned: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'playerBarPinned' : 'playerBarUnpinned')),
        });
    },
    handleSetPlayerBarStyle: (style) => {
        if (!PLAYER_BAR_STYLES.includes(style) || style === get().playerBarStyle) {
            return;
        }
        if (typeof window !== 'undefined') {
            localStorage.setItem(PLAYER_BAR_STYLE_STORAGE_KEY, style);
        }
        set({ playerBarStyle: style });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (style === 'docked' ? 'playerBarStyleDocked' : 'playerBarStyleFloating')),
        });
    },
    handleSetDockedBarAppearance: (appearance) => {
        if (!DOCKED_BAR_APPEARANCES.includes(appearance) || appearance === get().dockedBarAppearance) {
            return;
        }
        setStoredString(DOCKED_BAR_APPEARANCE_STORAGE_KEY, appearance);
        set({ dockedBarAppearance: appearance });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (appearance === 'monet' ? 'dockedBarAppearanceMonet' : 'dockedBarAppearanceDreamcore')),
        });
    },
    handleSetPlayerControlSlot: (slot, actionId) => {
        if (!isPlayerControlSlotActionId(actionId)) {
            return;
        }
        const key = slot === 'primary'
            ? PLAYER_CONTROL_SLOT_PRIMARY_STORAGE_KEY
            : PLAYER_CONTROL_SLOT_SECONDARY_STORAGE_KEY;
        if (typeof window !== 'undefined') {
            localStorage.setItem(key, actionId);
        }
        set(slot === 'primary'
            ? { playerControlSlotPrimary: actionId }
            : { playerControlSlotSecondary: actionId });
    },
    handleToggleAlwaysShowPlayerBackButton: (enable) => {
        setStoredBoolean('always_show_player_back_button', enable);
        set({ alwaysShowPlayerBackButton: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'playerBackButtonAlwaysShown' : 'playerBackButtonAutoHidden')),
        });
    },
    handleToggleAlwaysShowTrackSwitchButtons: (enable) => {
        setStoredBoolean('always_show_track_switch_buttons', enable);
        set({ alwaysShowTrackSwitchButtons: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'trackSwitchButtonsAlwaysShown' : 'trackSwitchButtonsAutoHidden')),
        });
    },
    handleToggleAlwaysShowMainWindowTitlebar: (enable) => {
        setStoredBoolean('always_show_main_window_titlebar', enable);
        set({ alwaysShowMainWindowTitlebar: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'mainWindowTitlebarAlwaysShown' : 'mainWindowTitlebarAutoHidden')),
        });
    },
    handleTogglePlayerHeaderBlur: (enable) => {
        setStoredBoolean('player_header_blur', enable);
        set({ playerHeaderBlur: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'playerHeaderBlurOn' : 'playerHeaderBlurOff')),
        });
    },
    handleToggleHideFullscreenButton: (enable) => {
        setStoredBoolean('hide_fullscreen_button', enable);
        set({ hideFullscreenButton: enable });
    },
    handleToggleNativeMacFullscreenButton: (enable) => {
        setStoredBoolean('use_native_mac_fullscreen_button', enable);
        set({ useNativeMacFullscreenButton: enable });
    },
    handleToggleNativeMacTrafficLights: (enable) => {
        setStoredBoolean('use_native_mac_traffic_lights', enable);
        set({ useNativeMacTrafficLights: enable });
        // The titlebar style is a window-creation option: the switch lands in the main process
        // store and the new value is read the next time the main window is built.
        if (window.electron?.saveSettings) {
            void window.electron.saveSettings('USE_NATIVE_MAC_TRAFFIC_LIGHTS', enable);
        }
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.restartToApplyWindowChrome'),
        });
    },
    handleToggleHidePlayerRightPanelButton: (enable) => {
        setStoredBoolean('hide_player_right_panel_button', enable);
        set({ hidePlayerRightPanelButton: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'rightBtnHidden' : 'rightBtnShown')),
        });
    },
    handleToggleTransparentPlayerBackground: (enable) => {
        setStoredBoolean('transparent_player_background', enable);
        set({ transparentPlayerBackground: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'transparentBgOn' : 'transparentBgOff')),
        });
    },
    // Main-process guard fired the refusal (classic Windows wallpaper mode cannot present a
    // transparent wallpaper window): surface why the toggle did not take effect.
    handleWallpaperTransparentRefused: () => {
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.transparentBgWallpaperUnsupported'),
        });
    },
    handleToggleOpenPanelCloseButton: (enable) => {
        setStoredBoolean('show_open_panel_close_button', enable);
        set({ showOpenPanelCloseButton: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'panelCloseBtnShown' : 'panelCloseBtnHidden')),
        });
    },
}));

/**
 * The PlayerChromeSettings half of the former settings snapshot, for the surfaces that
 * legitimately edit this whole domain at once. Ordinary consumers select one field instead.
 */
export const selectPlayerChromeSettingsSnapshot = (state: PlayerChromeSettingsState) => ({
    hidePlayerProgressBar: state.hidePlayerProgressBar,
    playerBottomBarOffset: state.playerBottomBarOffset,
    playerBarPinned: state.playerBarPinned,
    playerBarStyle: state.playerBarStyle,
    dockedBarAppearance: state.dockedBarAppearance,
    playerControlSlotPrimary: state.playerControlSlotPrimary,
    playerControlSlotSecondary: state.playerControlSlotSecondary,
    hidePlayerRightPanelButton: state.hidePlayerRightPanelButton,
    alwaysShowPlayerBackButton: state.alwaysShowPlayerBackButton,
    alwaysShowTrackSwitchButtons: state.alwaysShowTrackSwitchButtons,
    alwaysShowMainWindowTitlebar: state.alwaysShowMainWindowTitlebar,
    playerHeaderBlur: state.playerHeaderBlur,
    titlebarSide: state.titlebarSide,
    handleSetTitlebarSide: state.handleSetTitlebarSide,
    hideFullscreenButton: state.hideFullscreenButton,
    useNativeMacFullscreenButton: state.useNativeMacFullscreenButton,
    useNativeMacTrafficLights: state.useNativeMacTrafficLights,
    handleToggleNativeMacTrafficLights: state.handleToggleNativeMacTrafficLights,
    transparentPlayerBackground: state.transparentPlayerBackground,
    enablePlayerPageNativeBlur: state.enablePlayerPageNativeBlur,
    autoHidePlayerChrome: state.autoHidePlayerChrome,
    autoHideCursorWithPlayerChrome: state.autoHideCursorWithPlayerChrome,
    hideCursorWhenIdle: state.hideCursorWhenIdle,
    showOpenPanelCloseButton: state.showOpenPanelCloseButton,
    handleToggleHidePlayerProgressBar: state.handleToggleHidePlayerProgressBar,
    handleSetPlayerBottomBarOffset: state.handleSetPlayerBottomBarOffset,
    handleTogglePlayerBarPinned: state.handleTogglePlayerBarPinned,
    handleSetPlayerBarStyle: state.handleSetPlayerBarStyle,
    handleSetDockedBarAppearance: state.handleSetDockedBarAppearance,
    handleSetPlayerControlSlot: state.handleSetPlayerControlSlot,
    handleToggleHidePlayerRightPanelButton: state.handleToggleHidePlayerRightPanelButton,
    handleToggleAlwaysShowPlayerBackButton: state.handleToggleAlwaysShowPlayerBackButton,
    handleToggleAlwaysShowTrackSwitchButtons: state.handleToggleAlwaysShowTrackSwitchButtons,
    handleToggleAlwaysShowMainWindowTitlebar: state.handleToggleAlwaysShowMainWindowTitlebar,
    handleTogglePlayerHeaderBlur: state.handleTogglePlayerHeaderBlur,
    handleToggleHideFullscreenButton: state.handleToggleHideFullscreenButton,
    handleToggleNativeMacFullscreenButton: state.handleToggleNativeMacFullscreenButton,
    handleToggleTransparentPlayerBackground: state.handleToggleTransparentPlayerBackground,
    setTransparentPlayerBackgroundFromSystem: state.setTransparentPlayerBackgroundFromSystem,
    handleTogglePlayerPageNativeBlur: state.handleTogglePlayerPageNativeBlur,
    handleToggleAutoHidePlayerChrome: state.handleToggleAutoHidePlayerChrome,
    handleToggleAutoHideCursorWithPlayerChrome: state.handleToggleAutoHideCursorWithPlayerChrome,
    handleToggleHideCursorWhenIdle: state.handleToggleHideCursorWhenIdle,
    handleToggleOpenPanelCloseButton: state.handleToggleOpenPanelCloseButton,
    handleWallpaperTransparentRefused: state.handleWallpaperTransparentRefused,
});
