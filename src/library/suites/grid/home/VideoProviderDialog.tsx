import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard, X } from 'lucide-react';
import { useGlass } from '@/shinoinject/useGlass';

// src/library/suites/grid/home/VideoProviderDialog.tsx
// 视频平台弹窗的界面骨架，打开方式对齐音乐平台的切换器（页头搜索栏左边的圆钮）。
// 现在只列出 bilibili 一项且不可选：登录、视频源与搜索都等用户允许后再接。
// 遮罩与面板是兄弟层，不给共同祖先加 opacity——那样会把面板的 backdrop-filter 取样根截断。

interface VideoProviderDialogProps {
    open: boolean;
    onClose: () => void;
    isDaylight: boolean;
}

const VideoProviderDialog: React.FC<VideoProviderDialogProps> = ({ open, onClose, isDaylight }) => {
    const { t } = useTranslation();
    useGlass();

    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, open]);

    if (!open) return null;

    const panelStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(238,238,238,0.62)' : 'rgba(30,30,30,0.62)',
        borderTop: isDaylight ? '1px solid #fff8' : '1px solid #fff5',
        borderBottom: isDaylight ? '1px solid #fff8' : '1px solid #fff5',
        outline: '1px solid rgba(35,35,35,0.28)',
        boxShadow: '0 18px 48px rgba(0,0,0,0.32)',
    };
    const itemStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.06)',
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" role="presentation">
            <div className="absolute inset-0 bg-black/35" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t('home.videoSwitchPlatform')}
                data-testid="video-provider-dialog"
                className="relative w-[min(92vw,420px)] rounded-2xl p-5"
                style={panelStyle}
            >
                <div data-glass data-glass-light className="pointer-events-none absolute inset-0 rounded-2xl" />
                <div className="relative z-10">
                    <div className="mb-1 flex items-center justify-between">
                        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {t('home.videoSwitchPlatform')}
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('home.videoClose')}
                            title={t('home.videoClose')}
                            className="grid h-7 w-7 place-items-center rounded-full transition-opacity hover:opacity-70"
                        >
                            <X size={15} style={{ color: 'var(--text-primary)' }} />
                        </button>
                    </div>
                    <p className="mb-4 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                        {t('options.videoAddPlatformDesc')}
                    </p>
                    <div className="rounded-xl p-3" style={itemStyle}>
                        <div className="flex items-center gap-3">
                            <Clapperboard size={18} style={{ color: 'var(--text-accent)' }} />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {t('options.videoPlatformBilibili')}
                                </div>
                                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.videoPlatformBilibiliDesc')}
                                </div>
                            </div>
                            <span className="rounded-full px-2 py-0.5 text-[10px]" style={itemStyle}>
                                {t('options.videoPlatformSoon')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoProviderDialog;
