import React, { useEffect } from 'react';
import { motionValue } from 'framer-motion';
import type { ProbeDefinition } from './definition';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { useBilibiliMvStore } from '../../src/shinoinject/lab/useBilibiliMvStore';
import { useShinoLabStore } from '../../src/shinoinject/lab/useShinoLabStore';
import VideoBackgroundSettingsCard from '../../src/shinoinject/lab/videoBackground/VideoBackgroundSettingsCard';
import BilibiliMvBackground from '../../src/shinoinject/lab/videoBackground/BilibiliMvBackground';
import i18n from '../../src/i18n/config';
import { PlayerState, type SongResult } from '../../src/types';

// dev/probes/bilibiliBv.probe.tsx
// 「改 BV 号」这一条路：面板里填一条 BV，回车之后 store 是不是真的按新 BV 重新解析了。
// bilibili 的请求全被下面的假桥接接住，不联网；歌是编的，播放器状态只需要有个歌名和歌手。

const FAKE_SONG = {
    id: 'probe-song',
    name: 'Neon River',
    artists: [{ id: 'probe-artist', name: 'Hana' }],
    album: { id: 'probe-album', name: 'Probe Album' },
    durationMs: 200_000,
    source: 'local',
} as unknown as SongResult;

/** 把 window.electron.bilibili 接通，返回假数据；调用一次就够。 */
const installFakeBridge = () => {
    const query = new URLSearchParams(location.search);
    const searchMs = Number(query.get('searchms') ?? (query.has('slowsearch') ? 4000 : 0));
    const apiMs = Number(query.get('apims') ?? 0);
    const log: string[] = [];
    (window as unknown as { probeRequests?: string[] }).probeRequests = log;
    const request = async ({ url }: { url: string }) => {
        log.push(new URL(url, 'https://api.bilibili.com').pathname + new URL(url, 'https://api.bilibili.com').search.slice(0, 40));
        if (url.includes('/wbi/search/type')) {
            if (searchMs > 0) await new Promise(resolve => setTimeout(resolve, searchMs));
            return {
                ok: true,
                status: 200,
                bodyText: JSON.stringify({
                    code: 0,
                    data: {
                        result: [{
                            bvid: 'BV1aa411c7mZ',
                            title: 'Neon River <em class="keyword">Hana</em> Official MV',
                            author: 'Hana',
                            duration: '3:20',
                            pic: '//example.invalid/cover.jpg',
                            play: 1000,
                        }],
                    },
                }),
            };
        }
        const bvid = /bvid=([^&]+)/.exec(url)?.[1] ?? 'unknown';
        if (apiMs > 0 && !url.includes('/wbi/search/type')) await new Promise(resolve => setTimeout(resolve, apiMs));
        if (url.includes('/x/web-interface/view')) {
            return {
                ok: true,
                status: 200,
                bodyText: JSON.stringify({
                    code: 0,
                    data: {
                        bvid,
                        cid: 42,
                        title: `MV ${bvid}`,
                        duration: 200,
                        pic: '',
                        owner: { name: 'probe uploader' },
                    },
                }),
            };
        }
        if (url.includes('/x/web-interface/nav')) {
            return {
                ok: true,
                status: 200,
                bodyText: JSON.stringify({
                    code: 0,
                    data: {
                        isLogin: false,
                        wbi_img: {
                            img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
                            sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
                        },
                    },
                }),
            };
        }
        if (url.includes('/x/player/wbi/playurl')) {
            return {
                ok: true,
                status: 200,
                bodyText: JSON.stringify({
                    code: 0,
                    data: {
                        quality: 64,
                        timelength: 200000,
                        dash: { video: [{ id: 64, codecid: 7, baseUrl: `/probe-${bvid.endsWith('mD') ? 'a' : 'b'}.mp4?bv=${bvid}` }] },
                    },
                }),
            };
        }
        return { ok: true, status: 200, bodyText: JSON.stringify({ code: 0, data: {} }) };
    };

    (window as unknown as { electron?: unknown }).electron = {
        bilibili: {
            request,
            getStatus: async () => ({ state: 'signed-out', account: null, available: true }),
            openLogin: async () => ({ state: 'signed-out', account: null, available: true }),
            signOut: async () => ({ state: 'signed-out', account: null, available: true }),
        },
    };
    localStorage.setItem('shino_lab_bilibili_mv', '1');
    useShinoLabStore.setState({ bilibiliMvEnabled: true, videoPlaybackEnabled: true });
    usePlaybackStore.setState({ currentSong: FAKE_SONG, playerState: PlayerState.PLAYING });
};

installFakeBridge();

const Probe: React.FC = () => {
    useEffect(() => {
        void useBilibiliMvStore.getState().refreshAuth();
    }, []);

    // 把 store 挂到 window 上，Playwright 直接读，不必从屏幕上猜。
    useEffect(() => {
        (window as unknown as { probeStore?: unknown }).probeStore = {
            mv: () => useBilibiliMvStore.getState(),
            lab: () => useShinoLabStore.getState(),
            playback: () => usePlaybackStore.getState(),
        };
    }, []);

    return (
        <div className="mx-auto max-w-3xl p-6 text-zinc-100">
            <div className="relative mb-6 h-[220px] w-full overflow-hidden rounded-xl bg-black">
                <BilibiliMvBackground
                    theme={{} as never}
                    isDaylight={false}
                    coverUrl={null}
                    audioPower={motionValue(0)}
                    audioBands={{
                        bass: motionValue(0),
                        lowMid: motionValue(0),
                        mid: motionValue(0),
                        vocal: motionValue(0),
                        treble: motionValue(0),
                    }}
                    staticMode={false}
                    paused={false}
                />
            </div>
            <VideoBackgroundSettingsCard
                t={(key: string) => i18n.t(key)}
                isDaylight={false}
                theme={{} as never}
                controlCardBg=""
                rangeInputClass=""
            />
        </div>
    );
};

const definition: ProbeDefinition = {
    id: 'bilibiliBv',
    title: 'Bilibili MV: 改 BV 号',
    description: '在面板里填一条 BV 并回车，看 store 是否按新 BV 重新解析（请求全被假桥接接住）。',
    Component: Probe,
};

export default definition;
