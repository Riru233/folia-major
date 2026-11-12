import React, { useEffect, useRef, useState } from 'react';
import { PlayerState } from '../../../types';
import { currentTime } from '../../../stores/motionSignals';
import { selectDisplayPlayerState, selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { useBilibiliMvStore, selectMvOffsetSec } from '../useBilibiliMvStore';
import { useShinoLabStore } from '../useShinoLabStore';
import { songKeyOf } from '../bilibili/mvMatch';
import { mvTargetTime } from '../bilibili/avSync';
import LatentBackground from '../../../components/visualizer/backgrounds/latent/LatentBackground';
import type { VisualizerBackgroundRenderProps } from '../../../components/visualizer/backgrounds/definition';

// src/shinoinject/lab/videoBackground/BilibiliMvBackground.tsx
// 实验性背景「视频」：把这首歌在 bilibili 上的 MV 画面当作背景（只取画面，声音还是歌曲自己的）。
//
// 画面跟着播放时钟走，但不像装饰视频层那样需要每帧算：播放/暂停跟着播放器状态，时钟跳动
// （跳转、换歌）时重新对位，平时每两秒纠一次缓慢漂移。MV 比歌短的时候循环，比歌长的时候停在
// 最后一帧——两种情况都不该出现一块黑屏。
//
// 音画偏移（面板里按毫秒调，存在匹配缓存里）只改「MV 该停在第几秒」：正数让画面落后于声音，
// 负数让画面提前。改完当场强制对一次，不必等那两秒的漂移检查。
//
// 拿不到画面（没匹配到、BV 失效、CDN 拒绝、解码不了）时什么都不画：底下那层主题背景还在，
// 比画一块黑色好。

const DRIFT_CHECK_MS = 2000;
const DRIFT_TOLERANCE_SEC = 0.4;
const CLOCK_JUMP_SEC = 1;

const BilibiliMvBackground: React.FC<VisualizerBackgroundRenderProps> = ({
    theme, coverUrl, audioPower, audioBands, paused, staticMode, blendMs, blendProgress,
}) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    /** 主 effect 装好的对位函数：面板里改偏移时立刻重新对一次，不等下一次漂移检查。 */
    const alignRef = useRef<(force?: boolean) => void>(() => { });

    const enabled = useShinoLabStore(state => state.bilibiliMvEnabled);
    const autoMatch = useShinoLabStore(state => state.bilibiliAutoMatch);
    const quality = useShinoLabStore(state => state.bilibiliMvQuality);
    const resolution = useBilibiliMvStore(state => state.resolution);
    const resolveForSong = useBilibiliMvStore(state => state.resolveForSong);

    const song = usePlaybackStore(selectDisplaySong);
    const songDuration = usePlaybackStore(state => state.duration);
    const songKey = song ? songKeyOf(song) : null;
    // 音画偏移（秒，可带小数）：正数让画面比声音晚。它是这首歌 + 这条 BV 的调校，存在匹配缓存里。
    const offsetSec = useBilibiliMvStore(state => selectMvOffsetSec(
        state,
        songKey,
        state.resolution && state.resolution.songKey === songKey ? state.resolution.stream?.bvid : null,
    ));
    const offsetRef = useRef(offsetSec);
    offsetRef.current = offsetSec;
    const [failedUrl, setFailedUrl] = useState<string | null>(null);

    // 换歌、改画质、手动改 BV 都从这里重新解析一次；同一首歌在缓存期内不会重复请求。
    useEffect(() => {
        if (!enabled || !song) return;
        void resolveForSong(song);
    }, [enabled, song, songKey, autoMatch, quality, resolveForSong]);

    useEffect(() => {
        setFailedUrl(null);
    }, [songKey]);

    const stream = resolution && resolution.songKey === songKey && resolution.state === 'ready'
        ? resolution.stream
        : null;
    const source = stream && stream.videoUrl !== failedUrl ? stream.videoUrl : null;
    // 静音视频没有需要跟拍的东西；静态模式下也不必占一块 GPU。
    const active = enabled && Boolean(source) && !staticMode;
    const loop = Boolean(stream) && stream!.durationSec > 0 && stream!.durationSec + 15 < songDuration;

    useEffect(() => {
        const video = videoRef.current;
        if (!active || !video) return;

        // force：用户刚在面板里改过偏移，几十毫秒的差别也要按上去，不能等漂移检查的那 0.4 秒阈值。
        const align = (force = false) => {
            if (!Number.isFinite(video.duration) || video.duration <= 0 || video.seeking) return;
            const target = mvTargetTime(currentTime.get(), {
                durationSec: video.duration,
                loop,
                offsetSec: offsetRef.current,
            });
            if (target === null) return;
            if (force || Math.abs(video.currentTime - target) > DRIFT_TOLERANCE_SEC) video.currentTime = target;
        };
        alignRef.current = align;
        const followState = () => {
            const playing = selectDisplayPlayerState(usePlaybackStore.getState()) === PlayerState.PLAYING;
            if (playing && !pausedRef.current) void video.play().catch(() => {});
            else video.pause();
        };
        const onMetadata = () => {
            // 容器能解但里面没有画面：这一层会变成一整块黑，不如退回去。
            if (video.videoWidth === 0) {
                setFailedUrl(video.currentSrc || source);
                return;
            }
            align();
            followState();
        };

        video.addEventListener('loadedmetadata', onMetadata);
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onMetadata();

        const unsubscribeStore = usePlaybackStore.subscribe((state, previous) => {
            if (selectDisplayPlayerState(state) !== selectDisplayPlayerState(previous)) followState();
            if (selectDisplaySong(state) !== selectDisplaySong(previous)) align();
        });
        let lastClock = currentTime.get();
        const unsubscribeClock = currentTime.on('change', (value) => {
            if (Math.abs(value - lastClock) > CLOCK_JUMP_SEC) align();
            lastClock = value;
        });
        const drift = window.setInterval(align, DRIFT_CHECK_MS);

        return () => {
            window.clearInterval(drift);
            unsubscribeClock();
            unsubscribeStore();
            video.removeEventListener('loadedmetadata', onMetadata);
            video.pause();
        };
    }, [active, loop, source]);

    useEffect(() => {
        const video = videoRef.current;
        if (!active || !video) return;
        if (paused) {
            video.pause();
        } else if (selectDisplayPlayerState(usePlaybackStore.getState()) === PlayerState.PLAYING) {
            void video.play().catch(() => {});
        }
    }, [active, paused]);

    // 面板里调了偏移：立刻按新值对一次（force），画面不会等下一次漂移检查才跟上。
    useEffect(() => {
        if (!active) return;
        alignRef.current(true);
    }, [offsetSec, active]);

    // 没有画面可放时退回默认的隐现背景，而不是留一块黑：歌词还要在这上面看得清。
    if (!active || !source) {
        return (
            <LatentBackground
                theme={theme}
                coverUrl={coverUrl}
                audioPower={audioPower}
                audioBands={audioBands}
                staticMode={staticMode}
                paused={paused}
                blendMs={blendMs}
                blendProgress={blendProgress}
            />
        );
    }

    return (
        <video
            ref={videoRef}
            key={source}
            src={source}
            muted
            loop={loop}
            playsInline
            preload="auto"
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailedUrl(source)}
        />
    );
};

export default BilibiliMvBackground;
