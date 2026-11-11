import type { CSSProperties } from 'react';

// src/library/suites/grid/shared/gridGlassChrome.ts
// 网格视图顶部那几颗液态玻璃按钮共用的表面：白天淡白、夜间淡黑，上下各一道高光边 + 一圈暗描边。
// 返回按钮（GridView / ArtistGridView / GridMap）与面板开关圆钮取同一份，改一处两边一起变；
// 标题胶囊在 GridView 里内联了同一组值（它还多一层 backdrop-blur）。
export const gridGlassCircleStyle = (isDaylight: boolean): CSSProperties => ({
    backgroundColor: isDaylight ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    borderTop: isDaylight ? '1px solid rgba(255,255,255,0.32)' : '1px solid rgba(255,255,255,0.22)',
    borderBottom: isDaylight ? '1px solid rgba(255,255,255,0.32)' : '1px solid rgba(255,255,255,0.22)',
    outline: '1px solid rgba(40,40,40,0.2)',
    boxShadow: '2px 2px 8px 2px rgba(40,40,40,0.4)',
});
