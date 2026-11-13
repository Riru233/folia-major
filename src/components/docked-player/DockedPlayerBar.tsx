import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValueEvent } from 'framer-motion';
import { ChevronRight, Disc, Pause, Play, Settings2, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProgressBar from '../ProgressBar';
import LyricsTimelineModal from '../modal/LyricsTimelineModal';
import PlayerControlSlotButton from '../floating-player/PlayerControlSlotButton';
import PlayerControlSlotPicker from '../floating-player/PlayerControlSlotPicker';
import { usePlayerControlSlotCustomization } from '../floating-player/usePlayerControlSlotCustomization';
import type { PlayerControlSlotActionId } from '../floating-player/playerControlSlotActions';
import type { SlotContextFromApp, TrackNavigation } from '../FloatingPlayerControls';
import { PlayerState } from '../../types';
import type { Artist } from '../../types';
import { usePlaybackStore, selectDisplayCoverUrl, selectDisplayLyrics, selectDisplaySong } from '../../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { useAppViewStore } from '../../stores/useAppViewStore';
import { useAppChromeStore } from '../../stores/useAppChromeStore';
import { usePlayerChromeSettingsStore } from '../../stores/usePlayerChromeSettingsStore';
import { getProviderSongMetadata, getSongArtistLabel } from '../../services/onlineMusic/songMetadata';
import { openSettings } from '../../stores/useSettingsModalStore';
import type { MotionValue } from 'framer-motion';
import { useGlass } from '@/shinoinject/useGlass';
import { resolveDockedBarColors } from './dockedBarTheme';

// src/components/docked-player/DockedPlayerBar.tsx
// 贴底的「停靠」样式底部播放条，可在外观设置里与浮动胶囊（FloatingPlayerControls）互斥切换。
//
// 结构就是设计稿那条：上面一行是水平 grid（左：封面 + 歌名/歌手 + 进度时间；中：上一曲 / 播放 / 下一曲 / 音量；
// 右：两个可自定义槽位按钮），下面一行是整条宽度的进度条；两行之间是垂直 flex。
//
// 与浮动胶囊刻意不同的几处：
// - 不参与拖动 / 定位 / 果冻 / 悬停展开，它是一条固定的栏；
// - 没有「固定」按钮（那是胶囊「不再收缩」的开关，停靠栏一直就是展开的）；
// - 进度条上的两个时间读数藏起来，时间只在左侧文字块里出现一次。

/**
 * 停靠栏在窗口底边占掉的高度（1440 / 760 两个宽度上实测都是 94）：
 * 贴在底边上的其它浮层要知道该让多少，才能不压在它身上。
 */
export const DOCKED_PLAYER_BAR_HEIGHT_PX = 94;

const timeText = (value: number): string => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    const minutes = Math.floor(safe / 60);
    const seconds = Math.floor(safe % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * 左侧第二行的 `当前 / 总时长`。每帧重渲染整条播放栏代价太大，这里只改两个文本节点，
 * 和 ProgressBar 读同一个 MotionValue，跨过整秒才写一次。
 */
const DockedTimeReadout: React.FC<{
    currentTime: MotionValue<number>;
    duration: number;
}> = ({ currentTime, duration }) => {
    const elapsedRef = useRef<HTMLSpanElement>(null);
    const lastSecondRef = useRef<number | null>(null);

    useEffect(() => {
        const elapsed = elapsedRef.current;
        if (elapsed) {
            elapsed.textContent = timeText(currentTime.get());
        }
        lastSecondRef.current = Math.floor(currentTime.get());
    }, [currentTime, duration]);

    useMotionValueEvent(currentTime, 'change', (latest: number) => {
        const second = Math.floor(Number.isFinite(latest) ? Math.max(0, latest) : 0);
        if (second === lastSecondRef.current) {
            return;
        }
        lastSecondRef.current = second;
        if (elapsedRef.current) {
            elapsedRef.current.textContent = timeText(second);
        }
    });

    return (
        <span className="tabular-nums">
            <span ref={elapsedRef}>00:00</span>
            <span className="opacity-60">{` / ${timeText(duration)}`}</span>
        </span>
    );
};

export interface DockedPlayerBarProps {
    playerState: PlayerState;
    currentTime: MotionValue<number>;
    duration: number;
    canTogglePlay?: boolean;
    loopMode: 'off' | 'all' | 'one';
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
    onToggleLoop: () => void;
    noTrackText?: string;
    primaryColor?: string;
    secondaryColor?: string;
    isDaylight: boolean;
    hideControlBar?: boolean;
    controlsDisabled?: boolean;
    trackNavigation?: TrackNavigation | null;
    slotPrimary: PlayerControlSlotActionId;
    slotSecondary: PlayerControlSlotActionId;
    /** 槽位动作的上下文；上一首 / 下一首那几项由本组件自己按 trackNavigation 补齐。 */
    slotContext: SlotContextFromApp;
    /** 不在播放页时才给「回歌词画报」的箭头（在播放页上它没有去处）。 */
    showReturnToPlayer?: boolean;
    onReturnToPlayer?: () => void;
    /**
     * 当前是歌词画报页。停靠栏在所有页面上都在，但「侧边面板开关」和「自动隐藏控制栏」
     * 这两件只属于歌词画报：别的页面上齿轮还在，栏也不该跟着鼠标闲下来就消失。
     */
    isPlayerView?: boolean;
    /** 点歌名去队列拼贴（Lattice）；不给就只是一个不动的歌名。 */
    onOpenLattice?: () => void;
    /** 点歌手名去这位歌手的页面；不给就只是不动的歌手名。 */
    onOpenArtist?: (artist: Artist) => void;
}

const DockedPlayerBar: React.FC<DockedPlayerBarProps> = ({
    playerState,
    currentTime,
    duration,
    canTogglePlay = false,
    loopMode,
    onSeek,
    onTogglePlay,
    onToggleLoop,
    noTrackText = 'No Track',
    primaryColor = '#fff',
    secondaryColor = '#fffa',
    isDaylight,
    hideControlBar = false,
    controlsDisabled = false,
    trackNavigation = null,
    slotPrimary,
    slotSecondary,
    slotContext,
    showReturnToPlayer = false,
    onReturnToPlayer,
    isPlayerView = false,
    onOpenLattice,
    onOpenArtist,
}) => {
    const { t } = useTranslation();
    // 歌名 / 歌手 / 封面直接从播放 store 读「当前该显示的那一层」：混音过渡时它仍然指着还在响的那首，
    // 和胶囊、now-playing 卡片看到的是同一份。
    const displaySong = usePlaybackStore(selectDisplaySong);
    const displayCoverUrl = usePlaybackStore(selectDisplayCoverUrl);
    const volume = useAudioSettingsStore(state => state.volume);
    const isMuted = useAudioSettingsStore(state => state.isMuted);
    const setVolume = useAudioSettingsStore(state => state.handleSetVolume);
    const toggleMute = useAudioSettingsStore(state => state.handleToggleMute);
    const slotCustomization = usePlayerControlSlotCustomization(slotPrimary, slotSecondary);
    // 停靠样式下侧边面板的入口就在这条栏的右端：底部那颗浮动齿轮不再出现（见 usePlayerPanelModel）。
    const isPanelOpen = useAppViewStore(state => state.isPanelOpen);
    const setIsPanelOpen = useAppViewStore(state => state.setIsPanelOpen);
    const hidePanelButton = usePlayerChromeSettingsStore(state => state.hidePlayerRightPanelButton);
    const showOpenPanelCloseButton = usePlayerChromeSettingsStore(state => state.showOpenPanelCloseButton);
    // 停靠栏的配色：Dreamcore 是原来那套，莫奈是另一套色晕。布局与图标不动，见 dockedBarTheme。
    const dockedBarAppearance = usePlayerChromeSettingsStore(state => state.dockedBarAppearance);
    // 同一个自动隐藏时钟：设置里开了「自动隐藏控制栏」时，停靠栏和播放页那套控制件一起收下去，
    // 鼠标一动就回来（时钟在 usePlayerChromeAutoHide 里，这里只读结果）。
    const isPlayerChromeHidden = useAppChromeStore(state => state.isPlayerChromeHidden);
    const displayLyrics = usePlaybackStore(selectDisplayLyrics);
    const [isTimelineOpen, setIsTimelineOpen] = useState(false);
    const [sliderVolume, setSliderVolume] = useState(volume);
    const isDraggingVolumeRef = useRef(false);

    useEffect(() => {
        if (!isDraggingVolumeRef.current) {
            setSliderVolume(volume);
        }
    }, [volume]);

    const songName = displaySong?.name || noTrackText;
    const artistName = displaySong ? getSongArtistLabel(displaySong) : '';
    // 歌手名要能点着去歌手页，所以按位拆开（与搜索结果行同一套元数据）；空的时候退回拼好的那一串。
    const songArtists = useMemo(
        () => (displaySong ? getProviderSongMetadata(displaySong).artists.filter(artist => artist.name.trim()) : []),
        [displaySong],
    );
    const openLatticeLabel = t('ui.openLattice');
    const shownVolume = isMuted ? 0 : sliderVolume;
    const VolumeIcon = shownVolume === 0 ? VolumeX : shownVolume < 0.5 ? Volume1 : Volume2;
    const muteLabel = t(isMuted ? 'commandPalette.volumeUnmute' : 'commandPalette.volumeMute');
    const returnToPlayerLabel = t('home.backToPlayer');
    const panelLabel = t('ui.panelHint');
    const prevLabel = trackNavigation?.prevLabel ?? t('ui.previousTrack');
    const nextLabel = trackNavigation?.nextLabel ?? t('ui.nextTrack');
    const prevDisabled = controlsDisabled || !trackNavigation || !trackNavigation.canPrev;
    const nextDisabled = controlsDisabled || !trackNavigation || !trackNavigation.canNext;
    const isPlaying = playerState === PlayerState.PLAYING;
    // 封面和右侧那颗箭头同一个去处：不在播放页时点封面也能回歌词画报。
    const canReturnToPlayer = showReturnToPlayer && Boolean(onReturnToPlayer);
    // 槽位动作的上下文：App 给的那份，加上停靠栏自己掌握的循环模式、歌词时间轴和相邻曲目。
    const resolvedSlotContext = useMemo(() => ({
        ...slotContext,
        loopMode,
        onToggleLoop,
        onToggleTimeline: () => setIsTimelineOpen(true),
        hasLyrics: Boolean(displayLyrics),
        canPrev: Boolean(trackNavigation?.canPrev),
        canNext: Boolean(trackNavigation?.canNext),
        onPrev: trackNavigation?.onPrev ?? (() => { }),
        onNext: trackNavigation?.onNext ?? (() => { }),
    }), [displayLyrics, loopMode, onToggleLoop, slotContext, trackNavigation]);

    // 配色全在 dockedBarTheme 里：两套外观结构一致（底部一笔颜色、往上淡到全透明），
    // 只是那笔颜色不同；Dreamcore 不另铺底，莫奈的底色就画在栏自己那层渐变上。
    const colors = resolveDockedBarColors(dockedBarAppearance, isDaylight, primaryColor, secondaryColor);

    const iconButtonClass = `flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
        controlsDisabled
            ? 'cursor-not-allowed opacity-30'
            : `opacity-60 ${colors.iconButtonHoverClass} hover:opacity-100`
    }`;

    // 封面本体：有没有 artwork 两种情况都一样，可点 / 不可点只是外面那层壳的区别。
    const coverContent = displayCoverUrl ? (
        <img
            src={displayCoverUrl}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
        />
    ) : (
        <div className="flex h-full w-full items-center justify-center opacity-40">
            <Disc size={22} />
        </div>
    );
    useGlass();

    // 「隐藏进度条」把整条栏收走。这一句必须留在所有 hook 之后：之前它写在 useMemo / useGlass 前面，
    // 于是播放页（开隐藏进度条时这里返回 null）与首页之间来回切一次，hook 数量就变了，React 直接抛
    // 「Rendered more/fewer hooks than expected」——停靠栏在真机上「不生效」多半是这一步炸掉的。
    if (hideControlBar) {
        return null;
    }

    return (
        <>
            <div
                className={`fixed inset-x-0 bottom-0 z-[60] select-none transition-[translate,opacity] duration-300 ease-out ${
                    isPlayerView && isPlayerChromeHidden ? 'pointer-events-none translate-y-full opacity-0' : 'translate-y-0 opacity-100'
                }`}
                data-ponder="player-bar"
                data-player-bar-style="docked"
                data-chrome-hidden={isPlayerView && isPlayerChromeHidden ? 'true' : 'false'}
            >
                {/* 垂直 flex：上一行是信息 / 传输 / 槽位，下一行是进度条。 */}
                <div
                    className={`flex flex-col gap-1 p-1 ${colors.surfaceClassName}`}
                    style={{ ...colors.surfaceStyle, color: colors.textPrimary }}
                >
                    {/* 水平 grid：左信息、中播放键、右传输与按钮。
                        播放键自己就是中间那一列（auto），左右两侧是等宽的 1fr——不论右边挂了多少颗按钮、
                        左边歌名多长，它永远落在整条栏的正中。上一曲贴在左列末尾、下一曲贴在右列开头，
                        所以传输键看上去仍是一簇，只是不再把播放键往一侧挤。 */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-[5px]">
                        {/* 左：封面 + 文字信息（左右排布，文字靠左），末尾挂上一曲 */}
                        <div
                            className="flex min-w-0 items-center gap-3"
                            style={{ textShadow: colors.titleTextShadow }}
                        >
                            {/* 封面：不在播放页时它本身就是回歌词画报的入口（悬停浮一层淡膜 + 箭头提示）。 */}
                            {canReturnToPlayer ? (
                                <button
                                    type="button"
                                    onClick={onReturnToPlayer}
                                    aria-label={returnToPlayerLabel}
                                    title={returnToPlayerLabel}
                                    className="group/cover relative h-[48px] w-[48px] shrink-0 overflow-hidden rounded-[5px] transition-transform hover:scale-[1.03] active:scale-95"
                                    style={colors.coverStyle}
                                >
                                    {coverContent}
                                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover/cover:opacity-100 group-focus-visible/cover:opacity-100">
                                        <ChevronRight size={20} className="text-white" />
                                    </span>
                                </button>
                            ) : (
                                <div
                                    className="h-[48px] w-[48px] shrink-0 overflow-hidden rounded-[5px]"
                                    style={colors.coverStyle}
                                >
                                    {coverContent}
                                </div>
                            )}
                            <div className="flex min-w-0 flex-col justify-center gap-1 text-left">
                                {/* 第一行：歌名（点了去队列拼贴）+ 歌手（每位单独可点，去了歌手页） */}
                                <div className="flex min-w-0 items-baseline gap-2">
                                    {displaySong && onOpenLattice ? (
                                        <button
                                            type="button"
                                            onClick={onOpenLattice}
                                            aria-label={openLatticeLabel}
                                            title={openLatticeLabel}
                                            className="min-w-0 truncate text-left text-sm font-medium leading-tight hover:underline"
                                        >
                                            {songName}
                                        </button>
                                    ) : (
                                        <span className="truncate text-sm font-medium leading-tight">{songName}</span>
                                    )}
                                    {songArtists.length > 0 ? (
                                        <span className={`min-w-0 shrink truncate text-xs leading-tight ${colors.artistFadeClass}`} style={{ color: colors.textSecondary }}>
                                            {songArtists.map((artist, artistIndex) => (
                                                <React.Fragment key={`${artist.entityId || artist.id}-${artistIndex}`}>
                                                    {artistIndex > 0 && ', '}
                                                    {onOpenArtist ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => onOpenArtist(artist)}
                                                            aria-label={t('libraryBravaisAlbum.openArtist', { name: artist.name })}
                                                            title={t('libraryBravaisAlbum.openArtist', { name: artist.name })}
                                                            className="hover:underline"
                                                        >
                                                            {artist.name}
                                                        </button>
                                                    ) : artist.name}
                                                </React.Fragment>
                                            ))}
                                        </span>
                                    ) : artistName && (
                                        <span className={`shrink-0 truncate text-xs leading-tight ${colors.artistFadeClass}`} style={{ color: colors.textSecondary }}>
                                            {artistName}
                                        </span>
                                    )}
                                </div>
                                {/* 第二行：进度时间 */}
                                <div className={`text-[11px] leading-tight ${colors.timeFadeClass}`} style={{ color: colors.textSecondary }}>
                                    <DockedTimeReadout currentTime={currentTime} duration={duration} />
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => trackNavigation?.onPrev()}
                                disabled={prevDisabled}
                                aria-label={prevLabel}
                                title={prevLabel}
                                className={`${iconButtonClass} ml-auto shrink-0`}
                            >
                                <SkipBack size={18} fill={colors.iconFill} style={colors.iconStyle} />
                            </button>
                        </div>

                        {/* 中：播放 / 暂停——单独占一列，永远踩在中线上 */}
                        <button
                            data-glass data-glass-jelly
                            type="button"
                            onClick={onTogglePlay}
                            disabled={!canTogglePlay || controlsDisabled}
                            aria-label={t(isPlaying ? 'ui.pause' : 'ui.play')}
                            title={t(isPlaying ? 'ui.pause' : 'ui.play')}
                            className={`mx-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full z-[20] shadow-lg transition-transform ${
                                controlsDisabled || !canTogglePlay ? 'cursor-not-allowed opacity-45' : 'hover:scale-105'
                            }`}
                            style={colors.playButtonStyle}
                        >
                            {isPlaying
                                ? <Pause style={colors.playIconStyle} size={18} fill="currentColor" />
                                : <Play style={colors.playIconStyle} size={18} fill="currentColor" className="ml-0.5" />}
                        </button>

                        {/* 右：下一曲 + 音量，最右端是槽位按钮（推到列尾） */}
                        <div className="flex min-w-0 items-center gap-1">
                            <button
                                type="button"
                                onClick={() => trackNavigation?.onNext()}
                                disabled={nextDisabled}
                                aria-label={nextLabel}
                                title={nextLabel}
                                className={`${iconButtonClass} shrink-0`}
                            >
                                <SkipForward size={18} fill={colors.iconFill} style={colors.iconStyle} />
                            </button>

                            {/* 音量：图标是静音开关，右边一条细滑杆。拖动时先只改本地值，松手才落盘。 */}
                            <div className="ml-2 flex shrink-0 items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={toggleMute}
                                    aria-label={muteLabel}
                                    title={muteLabel}
                                    aria-pressed={isMuted}
                                    className={iconButtonClass}
                                >
                                    <VolumeIcon style={colors.iconStyle} fill={colors.iconFill} size={18} />
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={shownVolume}
                                    disabled={isMuted}
                                    aria-label={t('ui.volume')}
                                    onPointerDown={() => { isDraggingVolumeRef.current = true; }}
                                    onPointerUp={() => { isDraggingVolumeRef.current = false; }}
                                    onChange={event => {
                                        const next = Number(event.currentTarget.value);
                                        setSliderVolume(next);
                                        setVolume(next);
                                    }}
                                    className="w-20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                    style={{ accentColor: colors.accent }}
                                />
                            </div>

                            {/* 右：悬浮样式右侧那两个可自定义槽位（没有「固定」按钮） */}
                            <div className="ml-auto flex items-center gap-1 pl-2" data-ponder-slots>
                                <PlayerControlSlotButton
                                    actionId={slotPrimary}
                                    context={resolvedSlotContext}
                                    primaryColor={colors.textPrimary}
                                    isDaylight={isDaylight}
                                    controlsDisabled={controlsDisabled}
                                    onCustomize={slotCustomization.openPrimaryPicker}
                                />
                                <PlayerControlSlotButton
                                    actionId={slotSecondary}
                                    context={resolvedSlotContext}
                                    primaryColor={colors.textPrimary}
                                    isDaylight={isDaylight}
                                    controlsDisabled={controlsDisabled}
                                    onCustomize={slotCustomization.openSecondaryPicker}
                                />
                                {/* 回歌词画报：和浮动胶囊右侧那颗箭头同一个去处，播放页上不画。 */}
                                {showReturnToPlayer && onReturnToPlayer && (
                                    <button
                                        type="button"
                                        onClick={onReturnToPlayer}
                                        disabled={controlsDisabled}
                                        aria-label={returnToPlayerLabel}
                                        title={returnToPlayerLabel}
                                        className={iconButtonClass}
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                )}
                                {/* 侧边面板：停靠样式下播放页的那颗浮动齿轮收起来了，开关落在栏的最右端。
                                    和齿轮同一套语义——合上时是齿轮，展开时是叉。 */}
                                {isPlayerView && !hidePanelButton && (!isPanelOpen || showOpenPanelCloseButton) && (
                                    <button
                                        type="button"
                                        onClick={() => setIsPanelOpen(!isPanelOpen)}
                                        aria-label={panelLabel}
                                        title={panelLabel}
                                        aria-expanded={isPanelOpen}
                                        data-testid="docked-panel-toggle"
                                        className={`${iconButtonClass} ${isPanelOpen ? 'opacity-100' : ''}`}
                                        style={isPanelOpen ? { backgroundColor: colors.panelToggleActiveColor } : undefined}
                                    >
                                        {isPanelOpen ? <X size={18} /> : <Settings2 size={18} />}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 最底部：整条宽度的进度条。两侧的时间读数藏掉——时间已经在左侧文字块里了。 */}
                    <div className="w-full [&_[data-folium-part='progress.time']]:hidden [&_[data-folium-part='progress.duration']]:hidden">
                        <ProgressBar
                            currentTime={currentTime}
                            duration={duration}
                            onSeek={onSeek}
                            primaryColor={colors.progressFill}
                            secondaryColor={colors.textSecondary}
                            trackColor={colors.progressTrack}
                            disabled={controlsDisabled}
                            edgeStyle="square"
                        />
                    </div>
                </div>
            </div>

            {slotCustomization.slotPicker && (
                <PlayerControlSlotPicker
                    anchorRect={slotCustomization.slotPicker.anchorRect}
                    side={slotCustomization.slotPicker.side}
                    current={slotCustomization.slotPicker.side === 'primary' ? slotPrimary : slotSecondary}
                    other={slotCustomization.slotPicker.side === 'primary' ? slotSecondary : slotPrimary}
                    onSelect={(actionId) => {
                        slotCustomization.assignSlot(slotCustomization.slotPicker!.side, actionId);
                        slotCustomization.closeSlotPicker();
                    }}
                    onOpenSettings={() => {
                        slotCustomization.closeSlotPicker();
                        openSettings('options', 'player', null, 'bottomUiSettings', 'playerControlSlots');
                    }}
                    onClose={slotCustomization.closeSlotPicker}
                    isDaylight={isDaylight}
                />
            )}

            {/* 槽位里放「歌词时间轴」时，和胶囊用同一个模态。 */}
            <LyricsTimelineModal
                isOpen={isTimelineOpen}
                onClose={() => setIsTimelineOpen(false)}
                lyrics={displayLyrics}
                duration={duration}
                currentTime={currentTime}
                onSeek={onSeek}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                accentColor="var(--text-accent)"
                isDaylight={isDaylight}
                disabled={controlsDisabled}
            />
        </>
    );
};

export default DockedPlayerBar;
