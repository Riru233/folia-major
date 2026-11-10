import React from 'react';
import { motionValue } from 'framer-motion';
import DockedPlayerBar from '../../src/components/docked-player/DockedPlayerBar';
import { PlayerState } from '../../src/types';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { usePlayerChromeSettingsStore } from '../../src/stores/usePlayerChromeSettingsStore';
import { useAppChromeStore } from '../../src/stores/useAppChromeStore';
import DevLibraryRendererSwitch from '../../src/library/app/DevLibraryRendererSwitch';
import type { ProbeDefinition } from './definition';

// dev/probes/dockedPlayerBar.probe.tsx
// 「停靠」样式的底部播放条（DockedPlayerBar）单独摆一次，看不见运行时也能对着设计稿量：
// 左块是不是 64px 正方形封面 + 两行文字、中间三颗传输键加音量、右边只有两个槽位（没有固定按钮）、
// 最底下一整条进度条。歌名 / 歌手 / 封面它自己从播放 store 读，所以这里先往 store 里放一首假歌。

const currentTime = motionValue(83);

const setProbeSong = () => {
    usePlayerChromeSettingsStore.getState().handleSetPlayerBarStyle('docked');
    usePlaybackStore.getState().setCurrentSong({
        id: 'probe-docked-song',
        name: 'A Longer Song Title That Should Truncate',
        ar: [{ id: 'probe-artist', name: 'Probe Artist' }],
        al: { id: 'probe-album', name: 'Probe Album', picUrl: 'https://p1.music.126.net/probe.jpg' },
        dt: 214000,
    } as never);
};

const DockedPlayerBarProbe: React.FC = () => {
    React.useMemo(setProbeSong, []);
    // `?chrome=hidden` 摆出「自动隐藏控制栏」收下去的那一帧，便于核对它确实整条滑下窗口底边。
    React.useMemo(() => {
        if (new URLSearchParams(window.location.search).get('chrome') === 'hidden') {
            useAppChromeStore.getState().setIsPlayerChromeHidden(true);
        }
    }, []);

    return (
        <div className="relative h-screen" data-probe-host>
            <DockedPlayerBar
                playerState={PlayerState.PLAYING}
                currentTime={currentTime}
                duration={214}
                canTogglePlay
                loopMode="all"
                onSeek={() => { }}
                onTogglePlay={() => { }}
                onToggleLoop={() => { }}
                isDaylight={false}
                showReturnToPlayer={false}
                onReturnToPlayer={() => { }}
                isPlayerView
                trackNavigation={{
                    currentTrackKey: 'probe-docked-song',
                    onPrev: () => { },
                    onNext: () => { },
                    canPrev: true,
                    canNext: true,
                    prevTitle: 'Previous Song',
                    nextTitle: 'Next Song',
                    prevLabel: 'Previous track',
                    nextLabel: 'Next track',
                }}
                slotPrimary="loop"
                slotSecondary="lyrics-timeline"
                slotContext={{
                    onShuffle: () => { },
                    canShuffle: true,
                    onLike: () => { },
                    isLiked: false,
                    likeDisabled: false,
                    invokeCommandById: () => { },
                    canInvokeCommandById: () => true,
                }}
            />
            {/* 首页左下角那条 dev 浮层：停靠样式下它应该整体落在栏的上沿之上。 */}
            <DevLibraryRendererSwitch sessionKey="probe" placement="home" />
        </div>
    );
};

export default {
    id: 'dockedPlayerBar',
    title: 'Docked bottom player bar',
    description: '停靠样式的底部播放条：左侧封面与歌曲信息 + 中间传输键与音量 + 右侧槽位 + 底部进度条。',
    Component: DockedPlayerBarProbe,
} satisfies ProbeDefinition;
