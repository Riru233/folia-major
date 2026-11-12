import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { VisualizerBackdropContext } from './VisualizerBackdrop';
import { usePlayerOverlayReservation } from '../../hooks/usePlayerOverlayLayout';
import { useIsPlayerBottomBarHost } from '../floating-player/PlayerBottomBarLayoutContext';
import { isMainAppSurface } from '../../utils/appSurface';
import type { FoliumLayoutRect } from '../../mods/folium/contract';

// src/components/visualizer/VisualizerBackKey.tsx
// 实验室的「视频播放时隐藏歌词样式」会把整条歌词样式层卸载（只留画面与字幕），样式里的返回键
// 也跟着没了。这一层只画那个返回键，挂在 VisualizerBackdrop 内部，复用它的 pointerArea 做悬停揭示，
// 这样视频播放、歌词样式被隐藏时，用户依然能退回主页。普通模式下样式自己的 shell 仍负责返回键，
// 这里只在隐藏歌词时才渲染，避免重复。

const BACK_HOTSPOT_SIZE = 120;

const backRevealArea = (bounds: FoliumLayoutRect): FoliumLayoutRect => ({
    left: bounds.left, top: bounds.top,
    width: BACK_HOTSPOT_SIZE, height: BACK_HOTSPOT_SIZE,
});

interface VisualizerBackKeyProps {
    onBack: () => void;
    isDaylight: boolean;
    alwaysShow?: boolean;
}

const VisualizerBackKey: React.FC<VisualizerBackKeyProps> = ({ onBack, isDaylight, alwaysShow = false }) => {
    const { t } = useTranslation();
    const backdrop = useContext(VisualizerBackdropContext);
    const pointerArea = backdrop?.pointerArea ?? null;
    const [show, setShow] = useState(alwaysShow);
    const showRef = useRef(show);
    const update = useCallback((visible: boolean) => {
        if (showRef.current === visible) return;
        showRef.current = visible;
        setShow(visible);
    }, []);

    useEffect(() => {
        if (alwaysShow) {
            update(true);
            return undefined;
        }
        if (!pointerArea) return undefined;
        const move = (event: MouseEvent) => update(event.clientX <= BACK_HOTSPOT_SIZE && event.clientY <= BACK_HOTSPOT_SIZE);
        const leave = () => update(false);
        pointerArea.addEventListener('mousemove', move, true);
        pointerArea.addEventListener('mouseleave', leave);
        return () => {
            pointerArea.removeEventListener('mousemove', move, true);
            pointerArea.removeEventListener('mouseleave', leave);
        };
    }, [pointerArea, alwaysShow, update]);

    // 原生叠层揭示（触控）：和 VisualizerShell 一样，标注返回键的触控热区，方便触屏发现。
    const isPlayerPage = useIsPlayerBottomBarHost();
    const publishLayout = isPlayerPage && isMainAppSurface;
    usePlayerOverlayReservation('back-reveal', 'navigation', backRevealArea, publishLayout);

    const visible = alwaysShow || show;

    return (
        <motion.button
            data-glass data-glass-light
            type="button"
            aria-label={t('ui.backToHome')}
            initial={false}
            animate={{
                opacity: visible ? 1 : 0,
                scale: visible ? 1 : 0.92,
                x: visible ? 0 : -6,
            }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(event) => {
                event.stopPropagation();
                onBack();
            }}
            style={{
                backgroundColor: isDaylight ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
                color: isDaylight ? "#333a" : "#fffa",
                borderTop: isDaylight ? "1px solid rgba(255,255,255,0.32)" : "1px solid rgba(255,255,255,0.22)",
                borderBottom: isDaylight ? "1px solid rgba(255,255,255,0.32)" : "1px solid rgba(255,255,255,0.22)",
                outline: "1px solid rgba(40,40,40,0.2)",
                boxShadow: "2px 2px 8px 2px rgba(40,40,40,0.4)",
            }}
            className="absolute top-6 left-6 z-30 h-12 w-12 rounded-full flex items-center justify-center transition-colors backdrop-blur-md bg-black/20 hover:bg-white/10 text-white/60 pointer-events-auto"
        >
            <ChevronLeft size={20} />
        </motion.button>
    );
};

export default VisualizerBackKey;
