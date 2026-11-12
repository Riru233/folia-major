import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listLibrarySuites } from '../registry';
import { useActiveLibrarySuiteId } from './librarySuiteChoice';
import { switchLibrarySuite } from './switchLibrarySuite';
import { useGlass } from '@/shinoinject/useGlass';
import { resolveReducedMotion, useMotionSettingsStore } from '../../stores/useMotionSettingsStore';
import { usePlayerChromeSettingsStore } from '../../stores/usePlayerChromeSettingsStore';
import { DOCKED_PLAYER_BAR_HEIGHT_PX } from '../../components/docked-player/DockedPlayerBar';
import { useIsBottomLayoutCompact } from '../../stores/useBottomDockStore';

// src/library/app/DevLibraryRendererSwitch.tsx
// 开发验证浮层：在各套 UI suite 之间切换当前打开的集合，
// 用来验收 Library Core（换 UI 不重新请求、不丢筛选与焦点）。保留作开发验证入口，默认关闭；
// 只有开发版显式启用额外 suite 时才装配（TUI 使用 VITE_LIBRARY_TUI=true），不作为正式设置项。
// 按钮列表来自 registry（R3 之前是写死的 grid / tui）；data-renderer 沿用旧名，e2e 用它定位。
// P3.4 起首页上也出现（切换首页 surface）：首页上贴着左下角（bottom-2）——稍高一点的位置是 GridMap 批量面板的
// 按钮，右下角是在线 provider 切换器，顶上是桌面版的标题栏与首页页头；集合层上仍在原来的位置。
// P4.3 起歌手页上也出现：贴着底边居中——左边是网格歌手页的信息面板（编辑歌手的按钮在它底部），右边是专辑列表按钮。
// B0 起和设置项写同一个 store；按下的按钮是实际生效的 suite（store 里的选择可能在这个构建里不可用）。

const PLACEMENT_CLASS = {
    collection: 'bottom-12 left-4',
    artist: 'bottom-2 left-1/2 -translate-x-1/2',
    home: 'bottom-2 left-2',
} as const;

const DevLibraryRendererSwitch: React.FC<{ sessionKey: string; placement?: keyof typeof PLACEMENT_CLASS }> = ({
    sessionKey,
    placement = 'collection',
}) => {
    const { t } = useTranslation();
    const activeSuite = useActiveLibrarySuiteId();
    useGlass();
    const reduceMotion = useMotionSettingsStore(state => resolveReducedMotion(state, 'uiMicroMotion'));
    // 底部播放器是停靠栏时它通栏压在最底下，这条浮层就得整体抬到栏上面去，否则两者叠在一起。
    const isDockedPlayerBar = usePlayerChromeSettingsStore(state => state.playerBarStyle) === 'docked';
    const dockedClearance = DOCKED_PLAYER_BAR_HEIGHT_PX + 8;
    // 紧凑档（窗口窄于 960，progress-bar v3）底部只留进度条胶囊，这条挪到左上角（标题栏和墙的返回按钮下面）。
    const isCompact = useIsBottomLayoutCompact();

    // 固定尺寸且不使用 flex/grid：position: fixed + width: max-content 让宽度只由内容决定，
    // 与视口宽度无关；whitespace-nowrap 保证窗口再窄也不折行（宁可溢出也不收缩），
    // h-[32px] 锁死高度。内部改成 inline-block 的常规行内排版，用 align-middle 垂直居中、
    // mr-1 代替原来的 gap-1，于是布局完全不依赖 flex/grid，玻璃层读到的 offsetWidth/Height 也稳定。
    return (
        <div
            data-glass
            data-testid="dev-library-renderer-switch"
            data-placement={placement}
            className={`fixed h-[32px] w-max whitespace-nowrap ${isCompact ? 'bottom-[48px] left-2' : PLACEMENT_CLASS[placement]} z-[120] rounded-full border-current/30 px-2 py-1 text-[11px] leading-[22px]`}
                    style={{
                        backgroundColor: "rgba(40, 40, 40, 0.42)",
                        borderTop:  "1px solid rgba(255,255,255,0.22)",
                        borderBottom: "1px solid rgba(255,255,255,0.22)",
                        outline: "1px solid rgba(40,40,40,0.2)",
                        color: '#fffa',
                        // 内联值盖掉上面那套 bottom-* 位置类：停靠样式下统一贴着停靠栏的上沿。
                        ...(isDockedPlayerBar ? { bottom: dockedClearance } : null),
                    }}
        >
            <span className="mr-1 inline-block px-1 align-middle opacity-50">{`Dev · ${t('libraryTui.rendererSwitch')}`}</span>
            {listLibrarySuites().map(suite => (
                <button
                    key={suite.id}
                    type="button"
                    data-renderer={suite.id}
                    data-suite={suite.id}
                    aria-pressed={activeSuite === suite.id}
                    onClick={() => switchLibrarySuite(sessionKey, suite.id)}
                    className={`mr-1 inline-block rounded-full px-2 py-0.5 align-middle leading-none last:mr-0 ${reduceMotion ? 'transition-none' : 'transition-[background-color,opacity] duration-150'} ${activeSuite === suite.id ? 'bg-current/15 font-bold' : 'opacity-60 hover:opacity-100'}`}
                >
                    {t(suite.labelKey)}
                </button>
            ))}
        </div>
    );
};

export default DevLibraryRendererSwitch;
