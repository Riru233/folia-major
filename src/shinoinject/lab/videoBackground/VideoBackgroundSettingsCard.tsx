import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Crosshair, LogIn, LogOut, RotateCcw } from 'lucide-react';
import { selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { useBilibiliMvStore, selectMvOffsetSec } from '../useBilibiliMvStore';
import { useShinoLabStore, type BilibiliMvQuality } from '../useShinoLabStore';
import { buildSearchKeyword, songKeyOf } from '../bilibili/mvMatch';
import i18n from '../../../i18n/config';
import { Button, Group, Row, Segmented, TextField, Toggle, Value, type SettingsGroupDef } from '../../../components/modal/settings/kit';
import OffsetStepper from '../../../components/shared/OffsetStepper';
import { useOffsetTuningStore } from './useOffsetTuningStore';
import { closeSettings } from '../../../stores/useSettingsModalStore';
import type { VisualizerBackgroundSettingsProps } from '../../../components/visualizer/backgrounds/definition';

// src/shinoinject/lab/videoBackground/VideoBackgroundSettingsCard.tsx
// 控制面板里「视频」背景的那几行：bilibili 账号、自动匹配、画质、这首歌的 BV 号与音画偏移。
//
// 面板是唯一能改 BV、能对音画的地方：自动匹配挑错的时候（同名曲、翻唱、另一个版本），在这里
// 粘一条正确的 bilibili 链接就够了；MV 的片头比歌曲长（或短）的时候，在这里按秒把画面前后挪
// 一点（外层按钮 ±1s、内层 ±10ms，也可以直接填数字）。两件事都和这首歌一起记进匹配缓存，
// 下一次换回这首歌不用再改、再对。

const VIDEO_GROUP: SettingsGroupDef = { id: 'bg-video', titleKey: 'options.videoBackgroundSettings' };

const QUALITY_OPTIONS: BilibiliMvQuality[] = [32, 64, 80];
const qualityLabel = (quality: BilibiliMvQuality) => `${quality <= 32 ? 360 : quality <= 64 ? 720 : 1080}P`;

const VideoBackgroundSettingsCard: React.FC<VisualizerBackgroundSettingsProps> = ({ t }) => {
    const lab = useShinoLabStore(useShallow(state => ({
        autoMatch: state.bilibiliAutoMatch,
        quality: state.bilibiliMvQuality,
        setAutoMatch: state.handleToggleBilibiliAutoMatch,
        setQuality: state.handleSetBilibiliMvQuality,
    })));
    const mv = useBilibiliMvStore(useShallow(state => ({
        auth: state.auth,
        resolution: state.resolution,
        tunings: state.tunings,
        refreshAuth: state.refreshAuth,
        signIn: state.signIn,
        signOut: state.signOut,
        setManualBv: state.setManualBv,
        setOffsetSec: state.setOffsetSec,
        resolveForSong: state.resolveForSong,
    })));
    const song = usePlaybackStore(selectDisplaySong);

    useEffect(() => {
        void mv.refreshAuth();
    }, [mv.refreshAuth]);

    const songKey = song ? songKeyOf(song) : null;
    const manualBv = songKey ? mv.tunings[songKey]?.pinnedBvid ?? '' : '';
    const offsetSec = selectMvOffsetSec(
        { tunings: mv.tunings },
        songKey,
        mv.resolution && mv.resolution.songKey === songKey ? mv.resolution.stream?.bvid : null,
    );
    const [bvDraft, setBvDraft] = useState(manualBv);
    useEffect(() => {
        setBvDraft(manualBv);
    }, [manualBv, songKey]);

    const status = (() => {
        if (!song) return t('options.shinoLabBilibiliNoSong');
        if (!mv.resolution) return t('options.shinoLabBilibiliResolving');
        if (mv.resolution.state === 'resolving') return t('options.shinoLabBilibiliResolving');
        if (mv.resolution.state === 'ready' && mv.resolution.stream) {
            const quality = mv.resolution.stream.quality;
            return i18n.t('options.shinoLabBilibiliReady', {
                title: mv.resolution.stream.title,
                quality: quality > 0 ? `${quality}P` : t('options.shinoLabBilibiliQualityUnknown'),
                bvid: mv.resolution.stream.bvid,
            });
        }
        if (mv.resolution.state === 'missing') return mv.resolution.message ?? t('options.shinoLabBilibiliNoMatch');
        if (mv.resolution.state === 'error') return i18n.t('options.shinoLabBilibiliFailed', { message: mv.resolution.message ?? '' });
        return t('options.shinoLabBilibiliNoSong');
    })();

    return (
        <Group def={VIDEO_GROUP}>
            <Row label={t('options.shinoLabBilibiliAccount')} desktopOnly={mv.auth.available === false}>
                {mv.auth.state === 'signed-in' ? (
                    <>
                        <Value>{mv.auth.account?.uname ?? t('options.shinoLabBilibiliSignedIn')}</Value>
                        <Button icon={LogOut} tip={t('options.shinoLabBilibiliSignOut')} onClick={() => void mv.signOut()} />
                    </>
                ) : (
                    <Button icon={LogIn} onClick={() => void mv.signIn()}>
                        {t('options.shinoLabBilibiliSignIn')}
                    </Button>
                )}
            </Row>
            <Row label={t('options.shinoLabBilibiliAutoMatch')} hint={t('options.shinoLabBilibiliAutoMatchDesc')}>
                <Toggle checked={lab.autoMatch} onChange={lab.setAutoMatch} />
            </Row>
            <Row label={t('options.shinoLabBilibiliQuality')}>
                <Segmented
                    value={String(lab.quality)}
                    options={QUALITY_OPTIONS.map(quality => ({ value: String(quality), label: qualityLabel(quality) }))}
                    onChange={next => lab.setQuality(Number(next) as BilibiliMvQuality)}
                />
            </Row>
            <Row label={t('options.shinoLabBilibiliBv')} hint={song ? buildSearchKeyword(song) : undefined} note={t('options.shinoLabBilibiliBvDesc')} disabled={!song}>
                <Button
                    icon={RotateCcw}
                    tip={manualBv ? t('options.shinoLabBilibiliClearBv') : t('options.shinoLabBilibiliReroll')}
                    onClick={() => (manualBv ? void mv.setManualBv(song, '') : void mv.resolveForSong(song, { force: true }))}
                />
                <TextField
                    value={bvDraft}
                    onChange={setBvDraft}
                    onCommit={() => void mv.setManualBv(song, bvDraft)}
                    placeholder={t('options.shinoLabBilibiliBvPlaceholder')}
                    disabled={!song}
                />
            </Row>
            {/* 音画偏移：画面比声音晚就是正数，单位秒，可以大调也可以填小数细调。改完立刻生效，
                也随这首歌的 BV 一起记进匹配缓存。 */}
            <Row
                label={t('options.shinoLabBilibiliOffset')}
                hint={t('options.shinoLabBilibiliOffsetDesc')}
                note={t('options.shinoLabBilibiliOffsetNote')}
                disabled={!song}
            >
                <Button
                    icon={RotateCcw}
                    tip={t('options.shinoLabBilibiliOffsetReset')}
                    disabled={!song || offsetSec === 0}
                    onClick={() => mv.setOffsetSec(song, 0)}
                />
                <OffsetStepper
                    value={offsetSec}
                    onChange={next => mv.setOffsetSec(song, next)}
                    disabled={!song}
                    label={t('options.shinoLabBilibiliOffset')}
                />
                <Value>{t('options.shinoLabBilibiliOffsetUnit')}</Value>
                {/* 数到毫秒也未必对得准：把调节搬到画面上，边看口型边按，这里只是入口。 */}
                <Button
                    icon={Crosshair}
                    onClick={() => {
                        useOffsetTuningStore.getState().begin(song);
                        closeSettings();
                    }}
                >
                    {t('options.shinoLabBilibiliOffsetInPicture')}
                </Button>
            </Row>
            <Row label={t('options.shinoLabBilibiliStatus')} hint={status} />
        </Group>
    );
};

export default VideoBackgroundSettingsCard;
