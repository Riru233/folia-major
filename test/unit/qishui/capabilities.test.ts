import { omni } from '../../../../services/onlineMusic/omni';
import { expect, vi, describe, it, beforeEach, afterEach } from 'vitest';
import { normalizeQishuiSong, track } from '../../../utils/lyrics/qishuiNormalize';
import { buildSongFromMeta, normalizeQishuiTrack } from '../../../../utils/lyrics/lyricSourceBuilder';
import { buildLyricSourceFromMetadata, buildOmniAudioSourceFromMetadata } from '../../../../utils/lyrics/lyricSourceBuilder';

describe('Omni audio clip start metadata', () => {
    it('retains preview metadata through Omni, never applying clip offsets to full songs', async () => {
        const request = vi.fn();
        const playlist = (extra: Partial<ProviderCollection> = {}): ProviderCollection => ({
            providerId: 'qishui', type: 'playlist', id: '99', name: 'List', isOwned: true, ...extra,
        });
        const song = () => normalizeQishuiSong(track());
        beforeEach(() => {
            vi.clearAllMocks();
            request.mockReset().mockResolvedValue({ ok: true, data: null });
            // @ts-ignore
            omni._providerSummaries.set('qishui', { providerId: 'qishui', displayName: 'qishui', availability: { configured: true }, status: 'unknown' } as any);
        });
        afterEach(() => {
            vi.clearAllMocks();
        });

        // Simulate API response with clip metadata
        request.mockResolvedValueOnce({ ok: true, data: { url: 'https://v.example.test/clip', quality: 'standard', fetchedAt: 1, preview: true, clipStartMs: 30000 } })
            .mockResolvedValueOnce({ ok: true, data: { url: 'https://v.example.test/full', quality: 'standard', fetchedAt: 1, preview: false, clipStartMs: 30000 } });
        const preview = await omni.getAudioSource(song(), 'standard');
        expect(preview).toMatchObject({ preview: true, clipStartMs: 30000 });
        expect(omni.isPreviewAudioSource(preview!.url)).toBe(true);
        expect(omni.previewClipStartMsOfAudioSource(preview!.url)).toBe(30000);
        const full = await omni.getAudioSource(song(), 'standard');
        expect(omni.previewClipStartMsOfAudioSource(full!.url)).toBe(0);
        expect(omni.previewClipStartMsOfAudioSource('https://unknown.test/clip')).toBe(0);
    });
});