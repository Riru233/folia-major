import React, { useEffect } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import OffsetStepper from '../../shared/OffsetStepper';
import { useGlass } from '../../../shinoinject/useGlass';
import { useOffsetTuningStore } from '../../../shinoinject/lab/videoBackground/useOffsetTuningStore';
import { DOCKED_PLAYER_BAR_HEIGHT_PX } from '../../docked-player/DockedPlayerBar';
import { selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { songKeyOf } from '../../../shinoinject/lab/bilibili/mvMatch';

// src/components/app/overlays/OffsetTuningBar.tsx
// 歌词画报上的音画偏移悬浮窗：左边返回（放弃这次调整），中间是 < - 值 + > 与「秒」，
// 右边确定。常驻在播放条上方，专供「边看画面边对」时用——设置页里那格数字是同一份值。
//
// 和别处的浮层一样挂液态玻璃（data-glass），底色与边框跟着日夜走。

type OffsetTuningBarProps = {
    isDaylight: boolean;
};

const OffsetTuningBar: React.FC<OffsetTuningBarProps> = ({ isDaylight }) => {
    const { t } = useTranslation();
    const isOpen = useOffsetTuningStore(state => state.isOpen);
    const draftSec = useOffsetTuningStore(state => state.draftSec);
    const setDraft = useOffsetTuningStore(state => state.setDraft);
    const cancel = useOffsetTuningStore(state => state.cancel);
    const confirm = useOffsetTuningStore(state => state.confirm);
    const tuningSong = useOffsetTuningStore(state => state.song);
    const displaySong = usePlaybackStore(selectDisplaySong);
    useGlass();

    // 调到一半换歌了：这条偏移已经不属于屏幕上的画面，收掉（并把那首歌的值放回去）。
    useEffect(() => {
        if (!isOpen || !tuningSong) return;
        if (!displaySong || songKeyOf(displaySong) !== songKeyOf(tuningSong)) cancel();
    }, [isOpen, tuningSong, displaySong, cancel]);

    // Esc 等于返回：调歪了想撤掉时不用去瞄准那颗按钮。
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, cancel]);

    if (!isOpen) return null;

    const textColor = isDaylight ? 'rgba(24,24,27,0.92)' : 'rgba(250,250,250,0.94)';
    const buttonClass = 'st-t-fast flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-medium transition-colors';
    const hoverClass = isDaylight ? 'hover:bg-black/10' : 'hover:bg-white/15';

    return (
        <div
            className="pointer-events-none fixed left-1/2 z-[70] -translate-x-1/2 select-none"
            style={{ bottom: DOCKED_PLAYER_BAR_HEIGHT_PX + 16 }}
            data-ponder="offset-tuning"
        >
            <div
                data-glass
                data-glass-jelly
                data-glass-light
                className="pointer-events-auto flex items-center gap-1.5 rounded-full px-2 py-1.5 shadow-2xl"
                style={{
                    backgroundColor: isDaylight ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.42)',
                    border: isDaylight ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.22)',
                    color: textColor,
                }}
            >
                <button
                    type="button"
                    onClick={cancel}
                    className={`${buttonClass} ${hoverClass}`}
                    title={t('options.shinoLabBilibiliOffsetTuningBack')}
                >
                    <ChevronLeft size={15} />
                    <span>{t('options.shinoLabBilibiliOffsetTuningBack')}</span>
                </button>

                <OffsetStepper
                    value={draftSec}
                    onChange={setDraft}
                    label={t('options.shinoLabBilibiliOffset')}
                />
                <span className="pr-1 text-[12px] tabular-nums opacity-70">{t('options.shinoLabBilibiliOffsetUnit')}</span>

                <button
                    type="button"
                    onClick={confirm}
                    className={`${buttonClass} ${hoverClass}`}
                    title={t('options.shinoLabBilibiliOffsetTuningConfirm')}
                >
                    <span>{t('options.shinoLabBilibiliOffsetTuningConfirm')}</span>
                    <Check size={15} />
                </button>
            </div>
        </div>
    );
};

export default OffsetTuningBar;
