import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PlayerState } from '../../../types';
import { currentTime } from '../../../stores/motionSignals';
import { selectDisplayPlayerState, selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { ensureVideoLayerFileRestored, useVideoLayerSettingsStore } from '../../../stores/useVideoLayerSettingsStore';
import { releaseLocalSongVideoSource, resolveLocalSongVideoSource, type LocalSongVideoSource } from '../../../services/localSongVideoSource';
import { isLocalPlaybackSong } from '../../../utils/appPlaybackGuards';
import i18n from '../../../i18n/config';

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
}

const VideoLayer: React.FC<VideoLayerProps> = ({ paused }) => {
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

    // 当前这首歌是不是一条视频曲目：是就把它自己的画面取来，设置里那条视频层让位。
    const displaySong = usePlaybackStore(selectDisplaySong);
    const songVideoId = displaySong && isLocalPlaybackSong(displaySong) ? displaySong.localRef.songId : null;
    const [songVideo, setSongVideo] = useState<LocalSongVideoSource | null>(null);
    // 这个运行时不认识的容器（MKV）：报过一次就退回设置里的背景，不再每帧重试。
    const [unplayableUrl, setUnplayableUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!songVideoId) {
            // 换到在线曲目（或没有歌）了：把上一首 MV 的地址放掉，别攥着一个几百兆的文件。
            setSongVideo(null);
            releaseLocalSongVideoSource();
            return undefined;
        }
        let cancelled = false;
        void resolveLocalSongVideoSource(songVideoId).then(source => {
            if (!cancelled) setSongVideo(source);
        });
        return () => {
            cancelled = true;
        };
    }, [songVideoId]);

    const songVideoSource = songVideo && songVideo.url !== unplayableUrl ? songVideo : null;
    const isSongVideo = Boolean(songVideoSource);
    const source = songVideoSource ? songVideoSource.url : settingsSource;
    const active = isSongVideo || (enabled && Boolean(settingsSource));

    useEffect(() => {
        ensureVideoLayerFileRestored();
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
            if (playing && !pausedRef.current) void video.play().catch(() => {});
            else video.pause();
        };
        const onMetadata = () => {
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
    }, [active, isSongVideo, source]);

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
                // 曲目自带的画面解不开（多半是 MKV 容器）：报一次，然后老老实实回到原来的背景。
                // 声音不受影响——<audio> 那边有它自己的转码回退。
                if (!isSongVideo) return;
                setUnplayableUrl(source);
                console.warn('[VideoLayer] This runtime cannot decode the song video; playing the audio only', { source });
                setStatusMessage({ type: 'info', text: i18n.t('status.songVideoUnsupported') });
            }}
        />
    );
};

export default VideoLayer;
