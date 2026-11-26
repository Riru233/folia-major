import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useGlass } from '@/shinoinject/useGlass';

// src/library/suites/grid/home/HomeNoticePanel.tsx
// 网格首页上一页没有卡片可铺时居中的说明：一个图标、一句标题、一段话，下面最多一个按钮。
// Folia 组的占位（聚合歌单的页面还没做，先给打开速记簿的入口）与「一个在线音源都没启用」用它；
// 样子跟在线页的「无账户」面板（OnlineProviderAccountlessPanel）一致。

type HomeNoticePanelProps = {
    icon: LucideIcon;
    title: string;
    body: string;
    isDaylight: boolean;
    action?: { label: string; icon: LucideIcon; run: () => void };
    testId?: string;
};

const HomeNoticePanel: React.FC<HomeNoticePanelProps> = ({ icon: Icon, title, body, isDaylight, action, testId }) => {
    useGlass();
    return (
        <div className="flex flex-1 w-full flex-col items-center justify-center space-y-6 px-4" data-testid={testId}>
            <div className={`w-20 h-20 rounded-3xl ${isDaylight ? 'bg-white/40 shadow-sm border border-black/5' : 'bg-white/5 border border-white/5'} flex items-center justify-center backdrop-blur-md`}>
                <Icon size={36} className="opacity-25" />
            </div>
            <div className="text-center max-w-md space-y-2">
                <h2 className="text-2xl font-bold opacity-90">{title}</h2>
                <p className="opacity-50 text-sm leading-6 whitespace-pre-line">{body}</p>
            </div>
            {action && (
                <button
                    type="button"
                    onClick={action.run}
                    data-glass
                    data-glass-light
                    data-glass-jelly
                    style={{
                        borderTop: isDaylight
                            ? '1px solid rgba(0,0,0,0.08)'
                            : '1px solid rgba(255,255,255,0.12)',
                        borderBottom: isDaylight
                            ? '1px solid rgba(0,0,0,0.08)'
                            : '1px solid rgba(255,255,255,0.12)',
                        outline: '1px solid rgba(35,35,35,0.3)',
                        color: isDaylight ? '#111' : '#fffa',
                    }}
                    className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-colors cursor-pointer ${isDaylight ? 'bg-[#fff4] hover:bg-[#fff8]' : 'bg-[#0004] hover:bg-[#0008]'}`}
                >
                    <action.icon size={16} />
                    <span>{action.label}</span>
                </button>
            )}
        </div>
    );
};

export default HomeNoticePanel;
