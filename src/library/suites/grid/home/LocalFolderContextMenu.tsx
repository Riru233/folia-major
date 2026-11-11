import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, FolderOpen, Layers, MapPin, Trash2 } from 'lucide-react';
import type { LocalSong } from '../../../../types';
import { useGlass } from '@/shinoinject/useGlass';
import {
    collectDescendantFolderPaths,
    collectDirectChildFolderPaths,
    collectLocalFolderSongIds,
    expandLocalFolderPathPrefixes,
    localFolderDepth,
    localFolderParentPath,
    normalizeLocalFolderPath,
    songFolderPath,
} from '../../../../utils/localFolderPaths';

// src/library/suites/grid/home/LocalFolderContextMenu.tsx
// 本地目录卡片的右键菜单：主歌单 = 导入根 `A`，子歌单 = 扫描出来的 `A/B`、`A/B/C`。
// 「子歌单」不是新的持久化模型，只是已有的子文件夹路径：这里把它们列出来供下钻整理。
// 删子歌单时目标路径只落到 `A/B`；删主歌单时前缀规则会把 `A/B`、`A/B/C` 一起算进去。
// 菜单挂 data-glass / data-glass-light，由 useGlass 在挂载后补上流体玻璃滤镜（makeGlass 幂等）。

export interface LocalFolderContextMenuProps {
    /** 右键那张卡片的目录路径（`A` 或 `A/B`）。 */
    folderPath: string;
    x: number;
    y: number;
    /** 当前曲库里的本地歌，用来算曲目数与子歌单列表。 */
    songs: readonly Pick<LocalSong, 'id' | 'folderName' | 'filePath'>[];
    onDelete: (folderPath: string) => void;
    onReveal: (folderPath: string) => void;
    /** 主动重新选择导入根在磁盘上的位置（目录被移动、或之前选错了父目录）。 */
    onRelink: (folderPath: string) => void;
    onClose: () => void;
}

const MENU_WIDTH = 268;
const MENU_MAX_HEIGHT = 340;

const itemClass = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/15';

const LocalFolderContextMenu: React.FC<LocalFolderContextMenuProps> = ({
    folderPath,
    x,
    y,
    songs,
    onDelete,
    onReveal,
    onRelink,
    onClose,
}) => {
    const { t } = useTranslation();
    useGlass();
    // 点子歌单只换菜单的目标，不重新弹一次菜单：下钻整理时位置保持在原来右键的地方。
    const [targetPath, setTargetPath] = useState(() => normalizeLocalFolderPath(folderPath));
    const menuRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState(() => ({
        left: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - MENU_MAX_HEIGHT - 8)),
    }));

    const allPaths = useMemo(
        () => expandLocalFolderPathPrefixes(songs.map(song => songFolderPath(song))),
        [songs],
    );
    const childPaths = useMemo(
        () => collectDirectChildFolderPaths(allPaths, targetPath),
        [allPaths, targetPath],
    );
    const songCount = useMemo(
        () => collectLocalFolderSongIds(songs, targetPath).length,
        [songs, targetPath],
    );
    const descendantCount = useMemo(
        () => collectDescendantFolderPaths(allPaths, targetPath).length,
        [allPaths, targetPath],
    );
    const isRoot = localFolderDepth(targetPath) === 0;
    const parentPath = localFolderParentPath(targetPath);

    // 靠右 / 靠下右键时把菜单收回视口内；下钻后菜单变高，重新量一次。
    useLayoutEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        setCoords({
            left: Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8)),
            top: Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8)),
        });
    }, [x, y, targetPath]);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            onClose();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            data-glass
            data-glass-light
            data-testid="local-folder-context-menu"
            role="menu"
            aria-label={t('localMusic.playlistContextMenu')}
            className="fixed z-[200] rounded-2xl border border-white/20 p-1.5 text-white shadow-2xl backdrop-blur-2xl theme-glass-panel"
            style={{
                left: coords.left,
                top: coords.top,
                width: MENU_WIDTH,
                maxHeight: MENU_MAX_HEIGHT,
                overflowY: 'auto',
                background: 'rgba(28, 30, 38, 0.72)',
                borderTop: '1px solid rgba(255,255,255,0.22)',
                borderBottom: '1px solid rgba(255,255,255,0.22)',
                outline: '1px solid rgba(40,40,40,0.2)',
                color: '#fffa',
            }}
            onClick={event => event.stopPropagation()}
            onContextMenu={event => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            <div className="px-2.5 pb-1.5 pt-1">
                <div className="truncate text-[12px] font-semibold" title={targetPath}>{targetPath}</div>
                <div className="mt-0.5 text-[10px] opacity-60">
                    {isRoot ? t('localMusic.mainPlaylist') : t('localMusic.subPlaylist')}
                    {' · '}{t('localMusic.playlistSongCount', { count: songCount })}
                    {descendantCount > 0 ? ` · ${t('localMusic.subPlaylists')} ${descendantCount}` : ''}
                </div>
            </div>
            <div className="my-1 h-px bg-white/15" />

            {!isRoot && parentPath && (
                <button
                    type="button"
                    role="menuitem"
                    className={itemClass}
                    onClick={() => setTargetPath(parentPath)}
                >
                    <ChevronLeft size={14} className="shrink-0" />
                    {t('localMusic.backToParentPlaylist')}
                </button>
            )}
            <button
                type="button"
                role="menuitem"
                className={`${itemClass} text-red-300 hover:bg-red-500/20`}
                onClick={() => {
                    onDelete(targetPath);
                    onClose();
                }}
            >
                <Trash2 size={14} className="shrink-0" />
                {t('localMusic.deletePlaylistFromLibrary')}
            </button>
            <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                    onReveal(targetPath);
                    onClose();
                }}
            >
                <FolderOpen size={14} className="shrink-0" />
                {t('localMusic.openFolderLocation')}
            </button>
            <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                    onRelink(targetPath);
                    onClose();
                }}
            >
                <MapPin size={14} className="shrink-0" />
                {t('localMusic.relinkFolderLocation')}
            </button>

            {childPaths.length > 0 && (
                <>
                    <div className="my-1 h-px bg-white/15" />
                    <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] opacity-60">
                        <Layers size={12} />
                        {t('localMusic.subPlaylists')} · {childPaths.length}
                    </div>
                    <div className="max-h-[140px] overflow-y-auto">
                        {childPaths.map(child => (
                            <button
                                key={child}
                                type="button"
                                role="menuitem"
                                className={itemClass}
                                onClick={() => setTargetPath(child)}
                                title={child}
                            >
                                <span className="min-w-0 flex-1 truncate">{child.slice(targetPath.length + 1)}</span>
                                <span className="shrink-0 opacity-50">
                                    {collectLocalFolderSongIds(songs, child).length}
                                </span>
                                <ChevronRight size={12} className="shrink-0 opacity-60" />
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default LocalFolderContextMenu;
