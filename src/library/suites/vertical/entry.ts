import React from 'react';
import type { LibraryHomeActionId, LibrarySuiteManifest } from '../../core/suite/suite.contract';

// src/library/suites/vertical/entry.ts
// 垂直 suite：一级页签竖排成 Media Center 那样的一列大标题，选中的那一项右侧就地展开该页签原本的网格内容。
// 只做首页——集合页、歌手页与账户没声明，registry 照常回退默认 suite（grid）；内容层复用 grid 的
// DesktopGrid3DSurface / LocalGrid3DView / NavidromeGrid3DView 与应用的探索页，垂直自己的只有导航这一层。
// 本文件只能静态 import react（test/unit/library/suiteEntries.test.ts）：组件一律 React.lazy。

const VerticalHome = React.lazy(() => import('./VerticalHome'));

// 首页动作与 grid 同一份：右侧内容就是 grid 的几个列表与目录树，目录面（GridMap）与本地列表上的导入 / 刷新都还在。
const HOME_ACTIONS: readonly LibraryHomeActionId[] = [
    'directory-filter',
    'directory-select',
    'directory-play-selection',
    'directory-enqueue-selection',
    'directory-create-playlist',
    'directory-remove-selection',
    'directory-rescan-root',
    'directory-remove-root',
    'directory-clear-ignore',
    'directory-manage-hidden',
    'directory-toggle-hidden',
    'home-import-folder',
    'home-refresh-folders',
    'home-import-playlist',
    'home-refresh-navidrome',
];

const vertical: LibrarySuiteManifest = {
    id: 'vertical',
    labelKey: 'libraryVertical.suiteName',
    // 测试阶段：设置项与命令面板的界面列表里先不出现（DEV 浮层与构建变量照常能选到）。
    preview: true,
    surfaces: {
        home: { component: VerticalHome, actions: HOME_ACTIONS },
    },
};

export default vertical;
