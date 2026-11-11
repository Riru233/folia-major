import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PlayerState } from '../../../types';
import { currentTime } from '../../../stores/motionSignals';
import { selectDisplayPlayerState, selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { ensureVideoLayerFileRestored, useVideoLayerSettingsStore } from '../../../stores/useVideoLayerSettingsStore';
import { releaseLocalSongVideoSource, resolveLocalSongVideoSource, type LocalSongVideoSource } from '../../../services/localSongVideoSource';
import { isLocalPlaybackSong } from '../../../utils/appPlaybackGuards';
import i18n from '../../../i18n/config';
import { useShinoLabStore } from '../../../shinoinject/lab/useShinoLabStore';

// src/components/visualizer/videoLayer/VideoLayer.tsx
// Built-in muted video behind the lyrics (above the background, under the lyrics). The video follows
// playback without any per-frame React work: play/pause follows the player state, a jump in the
// playback clock (seek, song change) re-aligns it, and slow drift is corrected every few seconds.
// The video position is the song position modulo the video length, so a short loop keeps cycling.
//
// 视频曲目（MV）在这里接管：当前这首歌自己的画面压过设置里那条视频层——不看开关、满不透明、铺满，
// 而且不循环（一首歌对应一段画面，放完就停在最后一帧）。声音仍旧由播放链里的 <audio> 负责，
// 这里只是同一个文件的第二个读者，所以两者的进度要一直对得上：它比装饰用的循环视频对得更紧。

const DRIFT_CHECK_MS = 2000;
const DRIFT_TOLERANCE_SEC = 0.35;
// A clock step bigger than this between two ticks is a seek or a song change, not playback.
const CLOCK_JUMP_SEC = 1;
// 曲目自带画面时口型对得上才有意义，容差和检查间隔都收紧一档。
const SONG_VIDEO_DRIFT_CHECK_MS = 1000;
const SONG_VIDEO_DRIFT_TOLERANCE_SEC = 0.12;

interface VideoLayerProps {
    /** The shell's pause signal (window hidden etc.); the video stops even while music plays. */
    paused: boolean;
    /** 静态模式（省资源）只关掉设置里那条装饰视频；曲目自带的画面是这首歌的一部分，照放。 */
    staticMode?: boolean;
}

const VideoLayer: React.FC<VideoLayerProps> = ({ paused, staticMode = false }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const alignRef = useRef<() => void>(() => {});
    const { enabled, url, opacity, fit, localFileUrl } = useVideoLayerSettingsStore(useShallow(state => ({
        enabled: state.videoLayerEnabled,
        url: state.videoLayerUrl,
        opacity: state.videoLayerOpacity,
        fit: state.videoLayerFit,
        localFileUrl: state.localFileUrl,
    })));
    const settingsSource = localFileUrl ?? (url || null);
    // 实验室里的视频播放总开关：关掉时这条视频层和视频曲目的画面一起停下。
    const videoPlaybackEnabled = useShinoLabStore(state => state.videoPlaybackEnabled);

    // 当前这首歌是不是一条视频曲目：是就把它自己的画面取来，设置里那条视频层让位。
    const displaySong = usePlaybackStore(selectDisplaySong);
    const songVideoId = displaySong && isLocalPlaybackSong(displaySong) ? displaySong.localRef.songId : null;
    const [songVideo, setSongVideo] = useState<LocalSongVideoSource | null>(null);
    // 这个运行时不认识的容器（MKV）：报过一次就退回设置里的背景，不再每帧重试。
    const [unplayableUrl, setUnplayableUrl] = useState<string | null>(null);

    useEffect(() => {
        // 换歌先清空：否则新地址还在解析时，屏幕上留着的上一首画面会被新歌的归零时钟 seek 回开头。
        setSongVideo(null);
        setUnplayableUrl(null);
        if (!songVideoId) {
            // 换到在线曲目（或没有歌）了：把上一首 MV 的地址放掉，别攥着一个几百兆的文件。
            releaseLocalSongVideoSource();
            return undefined;
        }
        let cancelled = false;
        void resolveLocalSongVideoSource(songVideoId)
            .then(source => {
                if (!cancelled) setSongVideo(source);
            })
            .catch(error => {
                console.warn('[VideoLayer] Failed to resolve the song video source:', error);
                if (!cancelled) setSongVideo(null);
            });
        return () => {
            cancelled = true;
        };
    }, [songVideoId]);

    // 只认当前这首的地址：解析过程中换过一次歌的话，旧结果不能被拿来画。
    const songVideoSource = songVideo && songVideo.songId === songVideoId && songVideo.url !== unplayableUrl
        ? songVideo
        : null;
    const isSongVideo = Boolean(songVideoSource);
    const source = songVideoSource ? songVideoSource.url : settingsSource;
    const active = videoPlaybackEnabled && (isSongVideo || (!staticMode && enabled && Boolean(settingsSource)));

    /**
     * 这首歌的画面放不出来（容器解不了、或者里面根本没有画面）：提示一次，退回设置里那条合成背景，
     * 顺手把地址放掉。声音不受影响，它走的是 <audio> 那条链，有它自己的转码回退。
     */
    const degradeToSettings = useCallback((reason: string) => {
        if (!source) return;
        setUnplayableUrl(source);
        releaseLocalSongVideoSource();
        console.warn('[VideoLayer] Cannot show the song video; returning to the configured background', { reason, source });
        setStatusMessage({ type: 'info', text: i18n.t('status.songVideoUnsupported') });
    }, [source]);

    useEffect(() => {
        ensureVideoLayerFileRestored();
        // 离开播放页（组件卸载）就把 MV 的地址放掉；下次回到播放页会重新解析。
        return () => releaseLocalSongVideoSource();
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!active || !source || !video) return;

        const align = () => {
            // Held still while music plays (the shell's pause): the clock runs on, so following it would
            // only seek a stopped video over and over. It is aligned when the pause lifts.
            if (pausedRef.current && selectDisplayPlayerState(usePlaybackStore.getState()) === PlayerState.PLAYING) return;
            if (!Number.isFinite(video.duration) || video.duration <= 0 || video.seeking) return;
            const clock = currentTime.get();
            // 装饰视频循环着放，取模对位；曲目自带的画面不循环，超出末尾就停在最后一帧。
            const target = isSongVideo
                ? Math.min(clock, Math.max(0, video.duration - 0.05))
                : clock % video.duration;
            const tolerance = isSongVideo ? SONG_VIDEO_DRIFT_TOLERANCE_SEC : DRIFT_TOLERANCE_SEC;
            if (Math.abs(video.currentTime - target) > tolerance) video.currentTime = target;
        };
        const followState = () => {
            const playing = selectDisplayPlayerState(usePlaybackStore.getState()) === PlayerState.PLAYING;
            // 画面比歌短时已经放到结尾了：play() 会把它带回第一帧，等下一次 align 才拉回来。
            if (playing && !pausedRef.current && !video.ended) void video.play().catch(() => {});
            else if (!playing) video.pause();
        };
        const onMetadata = () => {
            // 容器能解但里面没有画面（纯音轨的 mp4、或视频轨解不了而音轨能放）：此时不会触发 error，
            // 只会得到 videoWidth === 0。不在这里退场，这一层就是一整块黑屏盖住歌词背景。
            if (isSongVideo && video.videoWidth === 0) {
                degradeToSettings('no video track');
                return;
            }
            align();
            followState();
        };
        alignRef.current = align;

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
        const drift = window.setInterval(align, isSongVideo ? SONG_VIDEO_DRIFT_CHECK_MS : DRIFT_CHECK_MS);

        return () => {
            window.clearInterval(drift);
            unsubscribeClock();
            unsubscribeStore();
            video.removeEventListener('loadedmetadata', onMetadata);
            video.pause();
        };
    }, [active, degradeToSettings, isSongVideo, source]);

    // The shell's pause flag changes without touching the source; only play/pause needs to follow.
    useEffect(() => {
        const video = videoRef.current;
        if (!active || !video) return;
        if (paused) {
            video.pause();
        } else if (selectDisplayPlayerState(usePlaybackStore.getState()) === PlayerState.PLAYING) {
            alignRef.current();
            void video.play().catch(() => {});
        }
    }, [active, paused]);

    if (!active || !source) return null;

    return (
        <video
            ref={videoRef}
            key={source}
            src={source}
            muted
            loop={!isSongVideo}
            playsInline
            preload="auto"
            aria-hidden
            className="absolute inset-0 h-full w-full pointer-events-none"
            style={{ opacity: isSongVideo ? 1 : opacity, objectFit: isSongVideo ? 'cover' : fit }}
            onError={() => {
                if (isSongVideo) degradeToSettings('media error');
            }}
        />
    );
};

export default VideoLayer;
