import { describe, expect, it } from 'vitest';
import type { Artist, LocalSong, SongResult } from '@/types';
import type { LocalLibraryAssignment, LocalLibraryEntity } from '@/types/localLibrary';
import type { LocalLibraryCatalogSnapshot } from '@/hooks/useLocalLibraryCatalog';
import { resolveDockedArtistCollection } from '@/components/docked-player/dockedArtistCollection';

// test/unit/components/dockedArtistCollection.test.ts
// 停靠栏上点歌手名要去的那一页：本地歌按目录取这位歌手的全部歌，Navidrome 按歌手 id，
// 解析不出来时返回 null（调用方据此给一句提示）。

const entity = (id: string, kind: 'artist' | 'album', displayName: string): LocalLibraryEntity => ({
    id, kind, displayName, aliases: [displayName], normalizedAliases: [displayName.toLowerCase()], createdAt: 0, updatedAt: 0,
});
const assignment = (songId: string, artistEntityIds: string[], albumEntityId?: string): LocalLibraryAssignment => ({
    songId, artistEntityIds, albumEntityId, artistOrigin: 'import', albumOrigin: 'import', updatedAt: 0,
});
const localSong = (id: string): LocalSong => ({ id, fileName: `${id}.mp3` } as unknown as LocalSong);

const catalog = {
    ready: true,
    failed: false,
    reload: async () => {},
    entities: [entity('ar1', 'artist', 'Artist One'), entity('ar2', 'artist', 'Artist Two'), entity('al1', 'album', 'Alpha')],
    assignments: [
        assignment('s1', ['ar1'], 'al1'),
        assignment('s2', ['ar1', 'ar2'], 'al1'),
    ],
} as LocalLibraryCatalogSnapshot;
const localSongs = ['s1', 's2'].map(localSong);
const artistOne: Artist = { id: 'ar1', entityId: 'ar1', name: 'Artist One' };
const artistTwo: Artist = { id: 'ar2', entityId: 'ar2', name: 'Artist Two' };

const localPlayingSong = { id: 's1', name: 'Song', isLocal: true, localRef: { songId: 's1' } } as unknown as SongResult;

describe('resolveDockedArtistCollection', () => {
    it('opens the local artist page with every song of that artist', async () => {
        const collection = await resolveDockedArtistCollection({
            song: localPlayingSong,
            artist: artistOne,
            localSongs,
            localCatalog: catalog,
        });
        expect(collection).toMatchObject({
            source: 'local',
            id: 'ar1',
            entityId: 'ar1',
            name: 'Artist One',
            type: 'artist',
        });
        expect(collection && 'songIds' in collection ? collection.songIds : null).toEqual(['s1', 's2']);
    });

    it('opens the artist that was clicked, not just the first one', async () => {
        const collection = await resolveDockedArtistCollection({
            song: localPlayingSong,
            artist: artistTwo,
            localSongs,
            localCatalog: catalog,
        });
        expect(collection?.name).toBe('Artist Two');
        expect(collection && 'songIds' in collection ? collection.songIds : null).toEqual(['s2']);
    });

    it('falls back to the song order in the catalog when the artist carries no entity id', async () => {
        const collection = await resolveDockedArtistCollection({
            song: localPlayingSong,
            artist: { id: 'ar1', name: 'Artist One' },
            localSongs,
            localCatalog: catalog,
        });
        expect(collection?.source).toBe('local');
        expect(collection?.name).toBe('Artist One');
    });

    it('opens the Navidrome artist by id', async () => {
        const navidromeSong = {
            id: 'n1',
            name: 'Song',
            isNavidrome: true,
            navidromeData: { id: 'n1', artistId: 'nd-ar7' },
        } as unknown as SongResult;
        const collection = await resolveDockedArtistCollection({
            song: navidromeSong,
            artist: { id: 'nd-ar7', name: 'Navi Artist' },
            localSongs,
            localCatalog: catalog,
        });
        expect(collection).toMatchObject({ source: 'navidrome', id: 'nd-ar7', name: 'Navi Artist', type: 'artist' });
    });

    it('answers null when the song has no catalog to resolve against', async () => {
        const stageSong = { id: 'x1', name: 'Song', sourceRef: { kind: 'stage', mediaId: 'x1' } } as unknown as SongResult;
        const collection = await resolveDockedArtistCollection({
            song: stageSong,
            artist: artistOne,
            localSongs,
            localCatalog: catalog,
        });
        expect(collection).toBeNull();
    });
});
