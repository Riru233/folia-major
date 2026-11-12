import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../../../../components/shared/ConfirmDialog';
import { setStatusMessage } from '../../../../stores/useStatusMessageStore';
import { deleteLocalFolderSongRecords } from '../../../../services/localMusicService';
import { revealLocalFolderInSystem } from '../../../../services/localFolderSystemOpen';
import type { LocalSong } from '../../../../types';
import {
    collectDescendantFolderPaths,
    collectLocalFolderSongIds,
    expandLocalFolderPathPrefixes,
    normalizeLocalFolderPath,
    songFolderPath,
} from '../../../../utils/localFolderPaths';
import LocalFolderContextMenu from './LocalFolderContextMenu';

// src/library/suites/grid/home/useLocalFolderContextMenu.tsx
// 把本地目录卡片的右键菜单、删除确认与提示收在一个 hook 里，suite 只需把 onFolderContextMenu
// 挂到卡片上、把 menu 挂在自己的树里。删除只清曲库记录（服务层派发 LOCAL_MUSIC_UPDATED_EVENT，
// 宿主会重读 localSongs），不动磁盘文件与导入根，所以不需要额外的刷新回调。

export interface LocalFolderContextMenuController {
    /** 挂到本地「文件夹」卡片的 onContextMenu；folderPath 是 `A` 或 `A/B` 这样的相对路径。 */
    onFolderContextMenu: (event: React.MouseEvent, folderPath: string) => void;
    /** 菜单 + 删除确认框，由调用方挂在自己的 JSX 里。 */
    menu: React.ReactNode;
}

interface MenuTarget {
    folderPath: string;
    x: number;
    y: number;
}

export const useLocalFolderContextMenu = (
    songs: readonly LocalSong[],
    isDaylight: boolean,
): LocalFolderContextMenuController => {
    const { t } = useTranslation();
    const [target, setTarget] = useState<MenuTarget | null>(null);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const onFolderContextMenu = useCallback((event: React.MouseEvent, folderPath: string) => {
        const normalized = normalizeLocalFolderPath(folderPath);
        if (!normalized) return;
        event.preventDefault();
        event.stopPropagation();
        setTarget({ folderPath: normalized, x: event.clientX, y: event.clientY });
    }, []);
    const closeMenu = useCallback(() => setTarget(null), []);

    const runReveal = useCallback(async (folderPath: string, forceRebind = false) => {
        let result = await revealLocalFolderInSystem(folderPath, forceRebind);
        // 记住的导入根被移走 / 换了盘：重新请用户指一次，再打开。
        // 用户主动「重新指定位置」时不要再弹第二次选择框。
        if (!result.ok && !forceRebind && !result.prompted && result.reason === 'missing') {
            result = await revealLocalFolderInSystem(folderPath, true);
        }
        if (result.ok || result.reason === 'cancelled') return;
        const messageKey = result.reason === 'desktop-only'
            ? 'localMusic.folderLocationDesktopOnly'
            : result.reason === 'missing'
                ? 'localMusic.folderLocationMissing'
                : 'localMusic.folderLocationFailed';
        setStatusMessage({ type: 'error', text: t(messageKey) });
    }, [t]);

    const confirmDelete = useCallback(async () => {
        const folderPath = pendingDelete;
        // 同一帧连点确认时只执行一次（第二次会读到锁，不会再删一遍并弹「0 首」）。
        if (!folderPath || isDeleting) return;
        setIsDeleting(true);
        setPendingDelete(null);
        setTarget(null);
        try {
            const count = await deleteLocalFolderSongRecords(folderPath);
            setStatusMessage({
                type: 'success',
                text: t(count > 0 ? 'localMusic.deletePlaylistDone' : 'localMusic.deletePlaylistEmpty', { count }),
            });
        } catch (error) {
            console.warn('[LocalMusic] failed to delete playlist records', error);
            setStatusMessage({ type: 'error', text: t('localMusic.deletePlaylistFailed') });
        } finally {
            setIsDeleting(false);
        }
    }, [pendingDelete, isDeleting, t]);

    const deleteDescription = useMemo(() => {
        if (!pendingDelete) return undefined;
        const normalized = normalizeLocalFolderPath(pendingDelete);
        const count = collectLocalFolderSongIds(songs, normalized).length;
        const allPaths = expandLocalFolderPathPrefixes(songs.map(song => songFolderPath(song)));
        const subCount = collectDescendantFolderPaths(allPaths, normalized).length;
        return (
            <div className="space-y-1 text-sm">
                <p>{t('localMusic.deletePlaylistMessage', { name: normalized, count })}</p>
                {subCount > 0 && <p>{t('localMusic.deletePlaylistSubPlaylists', { count: subCount })}</p>}
                <p className="opacity-70">{t('localMusic.deletePlaylistNote')}</p>
            </div>
        );
    }, [pendingDelete, songs, t]);

    const menu = (
        <>
            {target && (
                <LocalFolderContextMenu
                    folderPath={target.folderPath}
                    x={target.x}
                    y={target.y}
                    songs={songs}
                    onDelete={setPendingDelete}
                    onReveal={folderPath => { void runReveal(folderPath); }}
                    onRelink={folderPath => { void runReveal(folderPath, true); }}
                    onClose={closeMenu}
                />
            )}
            <ConfirmDialog
                isOpen={Boolean(pendingDelete)}
                title={t('localMusic.deletePlaylistTitle')}
                description={deleteDescription}
                confirmText={t('localMusic.deletePlaylistFromLibrary')}
                confirmVariant="danger"
                isDaylight={isDaylight}
                onConfirm={() => { void confirmDelete(); }}
                onClose={() => setPendingDelete(null)}
            />
        </>
    );

    return { onFolderContextMenu, menu };
};
