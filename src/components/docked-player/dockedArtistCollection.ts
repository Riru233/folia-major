import type { Artist, LocalSong, SongResult, UnifiedSong } from '../../types';
import type { LocalLibraryCatalogSnapshot } from '../../hooks/useLocalLibraryCatalog';
import type { GridViewCollectionDescriptor } from '../app/home/gridViewCollectionAdapters';
import {
    buildLocalCatalogIndex,
    resolveLocalCatalogLink,
    resolveLocalSongEntityId,
} from '../../library/core/shared/localCatalogLinks';
import { isLocalPlaybackSong, isNavidromePlaybackSong } from '../../utils/appPlaybackGuards';
import { getSongCoverUrl } from '../../services/onlineMusic/songMetadata';
import { resolveSongCatalogRef } from '../../services/onlineMusic/catalogRefs';

// src/components/docked-player/dockedArtistCollection.ts
// 停靠栏上点歌手名要打开的那一页：本地歌按当前曲库目录取出这位歌手名下的全部歌（与播放器面板、
// 宿主的嵌套打开同一条规则），Navidrome 按歌手 id 打开，在线歌问 provider 要目录引用。
// 解析不出来时返回 null，由调用方给一句「目录不可用」，不静默吞掉这次点击。

type DockedArtistCollectionInput = {
    /** 正在显示的这首歌（混音过渡时是还在响的那首，与栏上的歌名同一份）。 */
    song: SongResult;
    /** 栏上被点的那位歌手。 */
    artist: Artist;
    localSongs: LocalSong[];
    localCatalog: LocalLibraryCatalogSnapshot;
};

export const resolveDockedArtistCollection = async ({
    song,
    artist,
    localSongs,
    localCatalog,
}: DockedArtistCollectionInput): Promise<GridViewCollectionDescriptor | null> => {
    if (isLocalPlaybackSong(song)) {
        const songId = song.localRef?.songId;
        if (!songId) return null;
        const index = buildLocalCatalogIndex(localCatalog);
        const entityId = artist.entityId || resolveLocalSongEntityId(index, songId, 'artist');
        if (!entityId) return null;
        const link = resolveLocalCatalogLink(localCatalog, localSongs, { kind: 'artist', entityId }, index);
        if (!link || link.songs.length === 0) return null;
        return {
            source: 'local',
            id: link.entity.id,
            entityId: link.entity.id,
            name: link.entity.displayName,
            type: 'artist',
            coverUrl: getSongCoverUrl(song),
            trackCount: link.songs.length,
            songIds: link.songs.map(entry => entry.id),
        };
    }

    if (isNavidromePlaybackSong(song)) {
        const artistId = song.navidromeData?.artistId;
        if (!artistId) return null;
        return {
            source: 'navidrome',
            id: artistId,
            name: artist.name,
            type: 'artist',
            coverUrl: getSongCoverUrl(song),
        };
    }

    try {
        const ref = await resolveSongCatalogRef(song as UnifiedSong, 'artist', artist);
        if (!ref) return null;
        return {
            source: 'online',
            providerId: ref.providerId,
            id: ref.id,
            name: artist.name,
            type: 'artist',
            coverUrl: getSongCoverUrl(song),
        };
    } catch (error) {
        console.warn('[DockedPlayer] Failed to resolve the artist page:', error);
        return null;
    }
};
