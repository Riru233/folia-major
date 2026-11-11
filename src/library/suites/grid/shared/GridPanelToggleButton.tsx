import { AnimatePresence, motion } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOneTimeHint } from '../../../../hooks/useOneTimeHint';
import { useReducedMotionFor } from '../../../../hooks/useReducedMotionFor';
import { PANEL_TOGGLE_HINT_STORAGE_KEY } from './GridPanelToggleIndicator';
import { gridGlassCircleStyle } from './gridGlassChrome';

// src/library/suites/grid/shared/GridPanelToggleButton.tsx
// 网格视图顶部返回按钮旁边的面板开关：与返回同款的液态玻璃圆钮（40×40）。面板从左侧切入，所以图标是方向性的
// ——收起时朝左合上、展开时朝右打开——并且随状态淡入旋转着换掉，静止时也能读出「点一下这边会合上 / 打开」。
// 文字版提示（标题里的 GridPanelToggleIndicator）仍然保留在标题上，两者共用同一次「首次自我提示」。

type GridPanelToggleButtonProps = {
    isOpen: boolean;
    isDaylight: boolean;
    onToggle: () => void;
};

const GridPanelToggleButton = ({ isOpen, isDaylight, onToggle }: GridPanelToggleButtonProps) => {
    const { t } = useTranslation();
    const calm = useReducedMotionFor('uiMicroMotion');
    // 与标题上的文字版共用存储键：任一入口用掉这次提示，另一个也不再抖。
    const shouldHint = useOneTimeHint(PANEL_TOGGLE_HINT_STORAGE_KEY);
    const Icon = isOpen ? PanelLeftClose : PanelLeftOpen;
    const label = t(isOpen ? 'ui.panelCollapse' : 'ui.panelExpand');
    const swap = calm ? 0 : 0.16;

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={label}
            title={t('ui.panelHint')}
            data-testid="grid-panel-toggle"
            data-glass
            data-glass-jelly
            data-glass-light
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-105 active:scale-95 ${shouldHint ? 'grid-panel-toggle-hint' : ''}`}
            style={gridGlassCircleStyle(isDaylight)}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={isOpen ? 'open' : 'closed'}
                    initial={calm ? { opacity: 0 } : { opacity: 0, rotate: -60, scale: 0.75 }}
                    animate={calm ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
                    exit={calm ? { opacity: 0 } : { opacity: 0, rotate: 60, scale: 0.75 }}
                    transition={{ duration: swap, ease: 'easeOut' }}
                    className="flex items-center justify-center"
                >
                    <Icon size={20} />
                </motion.span>
            </AnimatePresence>
        </button>
    );
};

export default GridPanelToggleButton;
