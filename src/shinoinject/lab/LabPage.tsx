import React, { useEffect, useMemo, useState } from 'react';
import { LogIn, LogOut, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { selectDisplaySong, usePlaybackStore } from '../../stores/usePlaybackStore';
import { useBilibiliMvStore } from './useBilibiliMvStore';
import { useShinoLabStore, type BilibiliMvQuality } from './useShinoLabStore';
import { setStatusMessage } from '../../stores/useStatusMessageStore';
import { ensureVideoLayerFileRestored, useVideoLayerSettingsStore, VIDEO_LAYER_OPACITY_BOUNDS } from '../../stores/useVideoLayerSettingsStore';
import { buildSearchKeyword, songKeyOf } from './bilibili/mvMatch';
import { Button, Group, Reveal, Row, Segmented, Slider, TextField, Toggle, Value, option, type SettingsGroupDef, type SettingsOptionDef } from '../../components/modal/settings/kit';
import { useSettingsPage } from '../../components/modal/settings/pages/settingsPageContext';

// src/shinoinject/lab/LabPage.tsx
// 实验室：还没打算放进正式设置的功能。这里现在住着两件事——
//
//   视频播放：曲目自带的 MV、以及设置里那条垫在歌词底下的装饰视频。原来它在播放页里，跟着
//   「实验室」这块牌子一起搬了过来；关掉这个总开关，它下面所有设置都不再出现，视频也不再播。
//   视频背景（bilibili）：背景类型里多出一个「视频」，换歌时去 bilibili 找这首歌的 MV，只取画面，
//   声音还是这首歌自己的。登录 bilibili 是全局的一次性动作，登录后所有歌都用同一个账号。
//
// 这一页只在开关打开时才画出下一层，搜索定位（SETTINGS_PAGE_OPTIONS）也按同一条规则判断，
// 免得搜到一个屏幕上根本没有的开关。

const VIDEO: SettingsGroupDef = { id: 'videoLayerSettings', titleKey: 'options.shinoLabVideoSection' };
const BILIBILI: SettingsGroupDef = { id: 'shinoLabBilibili', titleKey: 'options.shinoLabBilibiliSection' };

const O = {
    videoPlayback: option(VIDEO, 'shinoLabVideoPlayback', 'options.shinoLabVideoPlayback'),
    hideLyrics: option(VIDEO, 'shinoLabHideLyrics', 'options.shinoLabHideLyrics', { available: () => useShinoLabStore.getState().videoPlaybackEnabled }),
    videoEnabled: option(VIDEO, 'videoLayerEnabled', 'options.videoLayerEnabled', { available: () => useShinoLabStore.getState().videoPlaybackEnabled }),
    videoFile: option(VIDEO, 'videoLayerLocalFile', 'options.videoLayerLocalFile', { available: () => useShinoLabStore.getState().videoPlaybackEnabled }),
    videoUrl: option(VIDEO, 'videoLayerUrl', 'options.videoLayerUrl', { available: () => useShinoLabStore.getState().videoPlaybackEnabled }),
    videoOpacity: option(VIDEO, 'videoLayerOpacity', 'options.videoLayerOpacity', { available: () => useShinoLabStore.getState().videoPlaybackEnabled }),
    videoFit: option(VIDEO, 'videoLayerFit', 'options.videoLayerFit', { available: () => useShinoLabStore.getState().videoPlaybackEnabled }),
    bilibiliMv: option(BILIBILI, 'shinoLabBilibiliMv', 'options.shinoLabBilibiliMv'),
    bilibiliAccount: option(BILIBILI, 'shinoLabBilibiliAccount', 'options.shinoLabBilibiliAccount', { available: () => useShinoLabStore.getState().bilibiliMvEnabled }),
    bilibiliAutoMatch: option(BILIBILI, 'shinoLabBilibiliAutoMatch', 'options.shinoLabBilibiliAutoMatch', { available: () => useShinoLabStore.getState().bilibiliMvEnabled }),
    bilibiliQuality: option(BILIBILI, 'shinoLabBilibiliQuality', 'options.shinoLabBilibiliQuality', { available: () => useShinoLabStore.getState().bilibiliMvEnabled }),
    bilibiliBv: option(BILIBILI, 'shinoLabBilibiliBv', 'options.shinoLabBilibiliBv', { available: () => useShinoLabStore.getState().bilibiliMvEnabled }),
};

export const OPTIONS: SettingsOptionDef[] = Object.values(O);

const QUALITY_OPTIONS: BilibiliMvQuality[] = [32, 64, 80];

const percent = (value: number) => `${Math.round(value * 100)}%`;

const LabPage: React.FC = () => {
    const { t } = useTranslation();
    const { isElectron } = useSettingsPage();
    const lab = useShinoLabStore(useShallow(state => ({
        videoPlayback: state.videoPlaybackEnabled,
        hideLyrics: state.hideLyricStyleDuringVideo,
        bilibiliMv: state.bilibiliMvEnabled,
        autoMatch: state.bilibiliAutoMatch,
        quality: state.bilibiliMvQuality,
        setVideoPlayback: state.handleToggleVideoPlayback,
        setHideLyrics: state.handleToggleHideLyricStyleDuringVideo,
        setBilibiliMv: state.handleToggleBilibiliMv,
        setAutoMatch: state.handleToggleBilibiliAutoMatch,
        setQuality: state.handleSetBilibiliMvQuality,
    })));
    const video = useVideoLayerSettingsStore(useShallow(state => ({
        enabled: state.videoLayerEnabled,
        url: state.videoLayerUrl,
        opacity: state.videoLayerOpacity,
        fit: state.videoLayerFit,
        localFileName: state.localFileName,
        localFileStatus: state.localFileStatus,
        canPersistLocalFile: state.canPersistLocalFile,
        setEnabled: state.setVideoLayerEnabled,
        setUrl: state.setVideoLayerUrl,
        setOpacity: state.setVideoLayerOpacity,
        setFit: state.setVideoLayerFit,
        pickLocalFile: state.pickLocalFile,
        clearLocalFile: state.clearLocalFile,
        regrantLocalFile: state.regrantLocalFile,
    })));
    const song = usePlaybackStore(selectDisplaySong);
    const mv = useBilibiliMvStore(useShallow(state => ({
        auth: state.auth,
        resolution: state.resolution,
        overrides: state.overrides,
        refreshAuth: state.refreshAuth,
        signIn: state.signIn,
        signOut: state.signOut,
        setManualBv: state.setManualBv,
        resolveForSong: state.resolveForSong,
    })));

    useEffect(() => {
        ensureVideoLayerFileRestored();
    }, []);

    useEffect(() => {
        if (lab.bilibiliMv) void mv.refreshAuth();
    }, [lab.bilibiliMv, mv.refreshAuth]);

    // The URL commits on blur/Enter, so a half-typed address never reaches the <video>.
    const [urlDraft, setUrlDraft] = useState(video.url);
    useEffect(() => {
        setUrlDraft(video.url);
    }, [video.url]);

    const pickVideo = async () => {
        try {
            await video.pickLocalFile();
        } catch (error) {
            console.error('[VideoLayer] Failed to pick a video:', error);
            setStatusMessage({ type: 'error', text: t('options.videoLayerPickFailed') });
        }
    };

    const songKey = song ? songKeyOf(song) : null;
    const manualBv = songKey ? mv.overrides[songKey] ?? '' : '';
    const [bvDraft, setBvDraft] = useState(manualBv);
    useEffect(() => {
        setBvDraft(manualBv);
    }, [manualBv, songKey]);

    const commitBv = () => {
        void mv.setManualBv(song, bvDraft);
    };

    const accountLabel = useMemo(() => {
        if (mv.auth.state === 'signed-in' && mv.auth.account) return mv.auth.account.uname;
        return t(mv.auth.state === 'signed-in' ? 'options.shinoLabBilibiliSignedIn' : 'options.shinoLabBilibiliNotSignedIn');
    }, [mv.auth, t]);

    const mvStatus = useMemo(() => {
        if (!lab.bilibiliMv) return null;
        // 网页版没有可解析的东西，这一行只说这一句；「仅桌面版」的标签已经挂在账号那一行上了。
        if (!isElectron) return null;
        if (!song) return t('options.shinoLabBilibiliNoSong');
        if (!mv.resolution) return null;
        if (mv.resolution.state === 'resolving') return t('options.shinoLabBilibiliResolving');
        if (mv.resolution.state === 'ready' && mv.resolution.stream) {
            const quality = mv.resolution.stream.quality;
            return t('options.shinoLabBilibiliReady', {
                title: mv.resolution.stream.title,
                quality: quality > 0 ? `${quality}P` : t('options.shinoLabBilibiliQualityUnknown'),
            });
        }
        if (mv.resolution.state === 'missing') return mv.resolution.message ?? t('options.shinoLabBilibiliNoMatch');
        if (mv.resolution.state === 'error') return t('options.shinoLabBilibiliFailed', { message: mv.resolution.message ?? '' });
        return null;
    }, [lab.bilibiliMv, isElectron, song, mv.resolution, t]);

    return (
        <>
            <Group def={VIDEO}>
                <Row
                    option={O.videoPlayback}
                    note={(
                        <>
                            {t('options.shinoLabVideoPlaybackDesc')}
                            <br />
                            {t('options.videoLayerNotInExport')}
                        </>
                    )}
                >
                    <Toggle checked={lab.videoPlayback} onChange={lab.setVideoPlayback} />
                </Row>
                <Reveal when={lab.videoPlayback}>
                    <Row option={O.hideLyrics} note={t('options.shinoLabHideLyricsDesc')}>
                        <Toggle checked={lab.hideLyrics} onChange={lab.setHideLyrics} />
                    </Row>
                    <Row option={O.videoEnabled} note={t('options.videoLayerDesc')}>
                        <Toggle checked={video.enabled} onChange={video.setEnabled} />
                    </Row>
                    <Reveal when={video.enabled || video.localFileStatus !== 'none'}>
                        <Row
                            sub
                            option={O.videoFile}
                            note={t(video.canPersistLocalFile ? 'options.videoLayerLocalFileDesc' : 'options.videoLayerLocalFileSessionDesc')}
                        >
                            {video.localFileStatus !== 'none' && (
                                <>
                                    <Value tip={video.localFileName ?? undefined}>{video.localFileName}</Value>
                                    <Button icon={X} tip={t('options.videoLayerClearFile')} onClick={() => void video.clearLocalFile()} />
                                </>
                            )}
                            {video.localFileStatus === 'needs-permission' && (
                                <Button onClick={() => void video.regrantLocalFile()}>{t('options.videoLayerRegrant')}</Button>
                            )}
                            <Button onClick={() => void pickVideo()}>{t('options.videoLayerPickFile')}</Button>
                        </Row>
                    </Reveal>
                    <Reveal when={video.enabled}>
                        <Row sub option={O.videoUrl} hint={t('options.videoLayerUrlDesc')}>
                            <TextField
                                type="url"
                                value={urlDraft}
                                onChange={setUrlDraft}
                                onCommit={() => video.setUrl(urlDraft)}
                                placeholder="https://example.com/loop.mp4"
                            />
                        </Row>
                        <Row sub option={O.videoOpacity}>
                            <Slider
                                value={video.opacity}
                                min={VIDEO_LAYER_OPACITY_BOUNDS.min}
                                max={VIDEO_LAYER_OPACITY_BOUNDS.max}
                                step={0.05}
                                onChange={video.setOpacity}
                                format={percent}
                            />
                        </Row>
                        <Row sub option={O.videoFit}>
                            <Segmented
                                value={video.fit}
                                options={[
                                    { value: 'cover', label: t('options.videoLayerFitCover') },
                                    { value: 'contain', label: t('options.videoLayerFitContain') },
                                ]}
                                onChange={video.setFit}
                            />
                        </Row>
                    </Reveal>
                </Reveal>
            </Group>

            <Group def={BILIBILI}>
                <Row option={O.bilibiliMv} note={t('options.shinoLabBilibiliMvDesc')}>
                    <Toggle checked={lab.bilibiliMv} onChange={lab.setBilibiliMv} />
                </Row>
                <Reveal when={lab.bilibiliMv}>
                    <Row option={O.bilibiliAccount} note={t('options.shinoLabBilibiliAccountDesc')} desktopOnly={!isElectron}>
                        {mv.auth.state === 'signed-in' ? (
                            <>
                                <Value tip={mv.auth.account?.mid ? String(mv.auth.account.mid) : undefined}>{accountLabel}</Value>
                                <Button icon={LogOut} tip={t('options.shinoLabBilibiliSignOut')} onClick={() => void mv.signOut()} />
                            </>
                        ) : (
                            <Button icon={LogIn} onClick={() => void mv.signIn()}>
                                {t('options.shinoLabBilibiliSignIn')}
                            </Button>
                        )}
                    </Row>
                    <Row option={O.bilibiliAutoMatch} note={t('options.shinoLabBilibiliAutoMatchDesc')}>
                        <Toggle checked={lab.autoMatch} onChange={lab.setAutoMatch} />
                    </Row>
                    <Row option={O.bilibiliQuality} note={t('options.shinoLabBilibiliQualityDesc')}>
                        <Segmented
                            value={String(lab.quality)}
                            options={QUALITY_OPTIONS.map(quality => ({ value: String(quality), label: `${quality <= 32 ? 360 : quality <= 64 ? 720 : 1080}P` }))}
                            onChange={next => lab.setQuality(Number(next) as BilibiliMvQuality)}
                        />
                    </Row>
                    <Row
                        option={O.bilibiliBv}
                        hint={mvStatus ?? undefined}
                        note={t('options.shinoLabBilibiliBvDesc')}
                    >
                        <Button
                            icon={RotateCcw}
                            tip={manualBv ? t('options.shinoLabBilibiliClearBv') : t('options.shinoLabBilibiliReroll')}
                            onClick={() => (manualBv ? void mv.setManualBv(song, '') : void mv.resolveForSong(song, { force: true }))}
                        />
                        <TextField
                            value={bvDraft}
                            onChange={setBvDraft}
                            onCommit={commitBv}
                            placeholder={t('options.shinoLabBilibiliBvPlaceholder')}
                            disabled={!song}
                        />
                    </Row>
                    <Row sub label={t('options.shinoLabBilibiliKeyword')} disabled={!song}>
                        <Value>{song ? buildSearchKeyword(song) : '—'}</Value>
                    </Row>
                </Reveal>
            </Group>
        </>
    );
};

export default LabPage;
