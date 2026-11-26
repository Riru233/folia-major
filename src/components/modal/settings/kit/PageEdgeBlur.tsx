// src/components/modal/settings/kit/PageEdgeBlur.tsx
// 设置页顶边的渐进模糊：三层同高遮罩，各带一档 blur，样式全在 pageEdgeBlur.css 里，这里只负责摆出来。
// 高度读 --st-page-head（SettingsModal 量页头写在这右列上），组件里不另算高度。
//
// 挂载位置有讲究：它要盖在正文上面、顶部栏下面（顶部栏 z-30，这一层 z-20），并且必须是
// 滚动区的**兄弟、排在它后面**。backdrop-filter 只采样「它下面已经画完的东西」，
// 放进滚动区当第一个孩子，正文反而画在它上面，一点都糊不了。

import React from 'react';
import './pageEdgeBlur.css';

export const SettingsPageEdgeBlur: React.FC = () => (
    <div aria-hidden className="st-edge-blur">
        <div className="st-edge-blur__layer mask-b-from-20-to-55" />
        <div className="st-edge-blur__layer mask-b-from-50-to-75" />
        <div className="st-edge-blur__layer mask-b-from-70-to-100" />
    </div>
);

export default SettingsPageEdgeBlur;
