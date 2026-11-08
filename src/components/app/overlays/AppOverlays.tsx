import React from 'react';
import FloatingPlayerControls from '../../FloatingPlayerControls';
import DockedPlayerBar from '../../docked-player/DockedPlayerBar';
import SearchWorkspace from '../search/SearchWorkspace';
import DevDebugOverlay from '../../DevDebugOverlay';
import MemoryMonitorWindow from '../../debug/MemoryMonitorWindow';
import NowPlayingToast from './NowPlayingToast';
import HifiSignalPathPanel from '../../hifi/HifiSignalPathPanel';
import type { AppOverlaysModel } from './buildAppOverlaysModel';
import { countRender } from '../../../dev/renderCount';
import { useLatticeControlsStore } from '../../../stores/useLatticeControlsStore';
import { usePlayerChromeSettingsStore } from '../../../stores/usePlayerChromeSettingsStore';

// Centralized app-level overlay renderer so App.tsx does not mount leaf overlays directly.
type AppOverlaysProps = {
    model: AppOverlaysModel;
};

const AppOverlays: React.FC<AppOverlaysProps> = ({ model }) => {
    countRender('AppOverlays');
    const isCurrentSongPosterVisible = useLatticeControlsStore(state => state.isCurrentSongPosterVisible);
    // 底部播放条的两套外观互斥：浮动胶囊（可拖动）或贴底的停靠栏，由外观设置决定。
    const playerBarStyle = usePlayerChromeSettingsStore(state => state.playerBarStyle);
    const {
        searchOverlay,
        debugOverlay,
        memoryMonitor,
        floatingControls,
        nowPlayingToast,
    } = model;

    const showPlayerBar = Boolean(floatingControls)
        && (floatingControls!.currentView !== 'lattice' || !isCurrentSongPosterVisible);

    return (
        <>
            {searchOverlay && <SearchWorkspace {...searchOverlay} />}

            {debugOverlay && <DevDebugOverlay {...debugOverlay} />}

            {memoryMonitor && <MemoryMonitorWindow {...memoryMonitor} />}

            {/* 停靠栏只取它自己要的那几项：歌名 / 歌手 / 封面它自己从播放 store 读，
                其余回调与状态来自这份模型（与浮动胶囊同一份来源，两套外观看到的是同一首歌）。 */}
            {showPlayerBar && floatingControls && playerBarStyle === 'docked' && (
                <DockedPlayerBar
                    playerState={floatingControls.playerState}
                    currentTime={floatingControls.currentTime}
                    duration={floatingControls.duration}
                    canTogglePlay={floatingControls.canTogglePlay}
                    loopMode={floatingControls.loopMode}
                    onSeek={floatingControls.onSeek}
                    onTogglePlay={floatingControls.onTogglePlay}
                    onToggleLoop={floatingControls.onToggleLoop}
                    noTrackText={floatingControls.noTrackText}
                    primaryColor={floatingControls.primaryColor}
                    secondaryColor={floatingControls.secondaryColor}
                    isDaylight={floatingControls.isDaylight}
                    hideControlBar={floatingControls.hideControlBar}
                    controlsDisabled={floatingControls.controlsDisabled}
                    trackNavigation={floatingControls.trackNavigation}
                    slotPrimary={floatingControls.slotPrimary}
                    slotSecondary={floatingControls.slotSecondary}
                    slotContext={floatingControls.slotContext}
                    showReturnToPlayer={floatingControls.currentView !== 'player'}
                    onReturnToPlayer={floatingControls.onNavigateToPlayer}
                    isPlayerView={floatingControls.currentView === 'player'}
                />
            )}

            {showPlayerBar && floatingControls && playerBarStyle === 'floating' && (
                <FloatingPlayerControls {...floatingControls} />
            )}

            {/* 「正在播放」那块浮起来的卡片是浮动胶囊的伴生物：停靠栏自己就在屏幕底部把这首歌摆在明面上，
                再弹一块是重复的，所以停靠样式下不画它。 */}
            {nowPlayingToast && playerBarStyle === 'floating' && <NowPlayingToast {...nowPlayingToast} />}

            {/* The one HiFi signal-path sheet: the badge, the controls tab tile and the palette command open it through hifiPanelStore. */}
            <HifiSignalPathPanel />
        </>
    );
};

export default React.memo(AppOverlays);
