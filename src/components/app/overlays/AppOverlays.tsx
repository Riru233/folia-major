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
import { useBottomDockStore } from '../../../stores/useBottomDockStore';
import { useBottomLayoutTracking } from '../../../hooks/useBottomLayoutTracking';
import { useNowPlayingCardLayoutStore } from './now-playing-toast/nowPlayingCardLayoutStore';
import { useTransitionBorderCue } from './now-playing-toast/useTransitionBorderCue';
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
    // 主窗口按宽度在紧凑档和桌面档之间切换（progress-bar v3）。紧凑档里卡片收进胶囊左端，这里不再单独画它；
    // 拖卡片位置的时候例外（那是给宽屏用的位置，得让人看见卡片才能拖）。
    useBottomLayoutTracking();
    const isCompact = useBottomDockStore(state => state.layout === 'compact');
    const isPositioningCard = useNowPlayingCardLayoutStore(state => state.isPositioning);
    const {
        searchOverlay,
        debugOverlay,
        memoryMonitor,
        floatingControls,
        nowPlayingToast,
    } = model;

    const showPlayerBar = Boolean(floatingControls)
        && (floatingControls!.currentView !== 'lattice' || !isCurrentSongPosterVisible);

    const showsCapsule = Boolean(floatingControls)
        && (floatingControls?.currentView !== 'lattice' || !isCurrentSongPosterVisible);
    // 紧凑档里卡片在胶囊左端；胶囊不在（播放页关掉了进度条、Lattice 上当前歌海报盖着）时卡片退回宽屏的样子，
    // 不能两边都不画。胶囊在但隐身了（播放页控件自动隐藏、纯歌词页）时，卡片必须在场的几种情况（常驻、
    // 预告下一首、混音描边）也退回宽屏的样子；限时显示的那次报幕不退，否则每次控件一隐藏卡片就重新弹一次。
    const transitionCue = useTransitionBorderCue();
    const cardMustStay = nowPlayingToast !== null && nowPlayingToast !== undefined
        && (nowPlayingToast.mode === 'always' || nowPlayingToast.isNextUp === true || transitionCue !== null);
    const capsuleCarriesCard = isCompact && showsCapsule && !floatingControls?.hideControlBar
        && !(floatingControls?.isHidden && cardMustStay);

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
            {nowPlayingToast && playerBarStyle === 'floating' && (!capsuleCarriesCard || isPositioningCard) && <NowPlayingToast {...nowPlayingToast} />}

            {/* The one HiFi signal-path sheet: the badge, the controls tab tile and the palette command open it through hifiPanelStore. */}
            <HifiSignalPathPanel />
        </>
    );
};

export default React.memo(AppOverlays);
