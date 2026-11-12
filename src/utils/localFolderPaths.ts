import type { LocalSong } from '../types';

// src/utils/localFolderPaths.ts
// 本地「歌单」其实是导入文件夹后扫描出来的目录卡片：主歌单 = 导入根 `A`，子歌单 = `A/B`、`A/B/C`。
// 这里只放纯路径规则（层级、父子、删除范围），不碰曲库服务与 UI；删除范围按路径前缀算，
// 于是删子歌单不会碰到主歌单，删主歌单会把它的所有子歌单一起算进去。

/**
 * 把 `\` 与重复的 `/` 归一成 `A/B/C`，两端不留分隔符。`.` / `..` 段一律丢掉：
 * 曲库里的 folderName 本来是相对路径，留着它们会让前缀规则越过真实层级（主进程同样拒绝这两段）。
 */
export const normalizeLocalFolderPath = (value: string): string => (
    value.replace(/\\/g, '/').split('/')
        .filter(segment => Boolean(segment) && segment !== '.' && segment !== '..')
        .join('/')
);

/** 导入根的名字（`A/B` → `A`）。 */
export const localFolderRootName = (folderPath: string): string => (
    normalizeLocalFolderPath(folderPath).split('/')[0] || ''
);

/** 相对导入根的子路径（`A/B/C` → `B/C`）；主歌单返回空串。 */
export const localFolderRelativePath = (folderPath: string): string => (
    normalizeLocalFolderPath(folderPath).split('/').slice(1).join('/')
);

/** 上一级歌单（`A/B/C` → `A/B`）；主歌单返回空串。 */
export const localFolderParentPath = (folderPath: string): string => {
    const segments = normalizeLocalFolderPath(folderPath).split('/').filter(Boolean);
    segments.pop();
    return segments.join('/');
};

/** 层级深度：主歌单 0，一级子歌单 1，以此类推。 */
export const localFolderDepth = (folderPath: string): number => (
    Math.max(0, normalizeLocalFolderPath(folderPath).split('/').filter(Boolean).length - 1)
);

export const isLocalRootFolder = (folderPath: string): boolean => (
    localFolderDepth(folderPath) === 0 && Boolean(localFolderRootName(folderPath))
);

/** 这张卡片归属的目录名：优先用分组用的 folderName，旧数据回退到 filePath 的目录部分。 */
export const songFolderPath = (song: Pick<LocalSong, 'folderName' | 'filePath'>): string => {
    if (song.folderName) return normalizeLocalFolderPath(song.folderName);
    const pathLike = normalizeLocalFolderPath(song.filePath || '');
    const segments = pathLike.split('/');
    segments.pop();
    return segments.join('/');
};

/** candidate 是否就是 target 本身，或是它下面某一层子目录。 */
export const isSameOrChildFolder = (candidate: string, target: string): boolean => {
    const normalizedCandidate = normalizeLocalFolderPath(candidate);
    const normalizedTarget = normalizeLocalFolderPath(target);
    if (!normalizedTarget) return false;
    return normalizedCandidate === normalizedTarget
        || normalizedCandidate.startsWith(`${normalizedTarget}/`);
};

/**
 * 删除这张歌单时要清掉的曲库记录：该目录本身 + 它下面所有子目录里的歌。
 * 只返回 id，不动磁盘、不动目录柄与忽略列表（「不影响文件夹」）。
 */
export const collectLocalFolderSongIds = (
    songs: readonly Pick<LocalSong, 'id' | 'folderName' | 'filePath'>[],
    folderPath: string,
): string[] => (
    songs
        .filter(song => isSameOrChildFolder(songFolderPath(song), folderPath))
        .map(song => song.id)
);

/**
 * 把曲目所在目录展开成「它自己 + 每一级祖先」。只有 `A/B/C` 下有歌时，`A/B` 这张子歌单
 * 依然要能在主歌单里整理，所以不能只拿曲目所在的叶子目录当歌单列表。
 */
export const expandLocalFolderPathPrefixes = (folderPaths: readonly string[]): string[] => {
    const prefixes = new Set<string>();
    folderPaths.forEach(candidate => {
        const segments = normalizeLocalFolderPath(candidate).split('/').filter(Boolean);
        for (let length = 1; length <= segments.length; length += 1) {
            prefixes.add(segments.slice(0, length).join('/'));
        }
    });
    return Array.from(prefixes).sort();
};

/** target 的直接子歌单（不含更深的层级），用来在主歌单的右键菜单里下钻整理。 */
export const collectDirectChildFolderPaths = (
    folderPaths: readonly string[],
    folderPath: string,
): string[] => {
    const normalizedTarget = normalizeLocalFolderPath(folderPath);
    if (!normalizedTarget) return [];
    const prefix = `${normalizedTarget}/`;
    const children = new Set<string>();
    folderPaths.forEach(candidate => {
        const normalized = normalizeLocalFolderPath(candidate);
        if (!normalized.startsWith(prefix)) return;
        const rest = normalized.slice(prefix.length);
        const [firstSegment] = rest.split('/');
        if (firstSegment) children.add(`${normalizedTarget}/${firstSegment}`);
    });
    return Array.from(children).sort();
};

/** 这批目录里，属于 target 的直接或间接子歌单（给确认框报数用，不含 target 自己）。 */
export const collectDescendantFolderPaths = (
    folderPaths: readonly string[],
    folderPath: string,
): string[] => {
    const normalizedTarget = normalizeLocalFolderPath(folderPath);
    if (!normalizedTarget) return [];
    const descendants = new Set<string>();
    folderPaths.forEach(candidate => {
        const normalized = normalizeLocalFolderPath(candidate);
        if (normalized && normalized.startsWith(`${normalizedTarget}/`)) descendants.add(normalized);
    });
    return Array.from(descendants).sort();
};
