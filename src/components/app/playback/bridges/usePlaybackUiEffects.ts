import { useEffect } from 'react';
import type React from 'react';
import type { StatusMessage } from '../../../../types';
import { runStatusMessageTime, setStatusMessage as setStatusMsg } from '../../../../stores/useStatusMessageStore';
import { LAB_VIDEO_GATE_CHANGED_EVENT } from '../../../../shinoinject/lab/labVideoGate';

// App-level UI side effects that do not own playback business logic.
type UsePlaybackUiEffectsOptions = {

    statusMsg: StatusMessage | null;
    loadLocalSongs: () => void | Promise<void>;
    loadLocalPlaylists: () => Promise<void>;
    localMusicUpdatedEvent: string;
    blobUrlRef: React.RefObject<string | null>;
    volumePreviewFrameRef: React.RefObject<number | null>;
    onClearPendingUnavailableSkip?: () => void;
};

export const usePlaybackUiEffects = ({
    statusMsg,
    loadLocalSongs,
    loadLocalPlaylists,
    localMusicUpdatedEvent,
    blobUrlRef,
    volumePreviewFrameRef,
    onClearPendingUnavailableSkip,
}: UsePlaybackUiEffectsOptions) => {
    useEffect(() => {
        const handleLocalMusicUpdated = () => {
            void loadLocalSongs();
            void loadLocalPlaylists();
        };

        window.addEventListener(localMusicUpdatedEvent, handleLocalMusicUpdated);
        return () => window.removeEventListener(localMusicUpdatedEvent, handleLocalMusicUpdated);
    }, [loadLocalPlaylists, loadLocalSongs, localMusicUpdatedEvent]);

    // The video experiment's switch moved: the list is read again, so its videos leave or come back at
    // once. Only the list — the local-music event would start a rescan of the folders on disk.
    useEffect(() => {
        const handleVideoGateChanged = () => {
            void loadLocalSongs();
        };

        window.addEventListener(LAB_VIDEO_GATE_CHANGED_EVENT, handleVideoGateChanged);
        return () => window.removeEventListener(LAB_VIDEO_GATE_CHANGED_EVENT, handleVideoGateChanged);
    }, [loadLocalSongs]);

    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
            if (volumePreviewFrameRef.current !== null) {
                cancelAnimationFrame(volumePreviewFrameRef.current);
            }
        };
    }, [blobUrlRef, volumePreviewFrameRef]);

    useEffect(() => {
        if (!statusMsg || statusMsg.persistent) {
            return;
        }

        // Stands still while the pointer rests on the toast.
        return runStatusMessageTime(statusMsg.durationMs ?? 3000, () => setStatusMsg(null));
    }, [setStatusMsg, statusMsg]);

    useEffect(() => {
        return () => onClearPendingUnavailableSkip?.();
    }, [onClearPendingUnavailableSkip]);
};
