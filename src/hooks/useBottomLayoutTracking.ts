import { useLayoutEffect } from 'react';
import { useBottomDockStore } from '../stores/useBottomDockStore';
import { useDeviceSimulationStore } from '../stores/useDeviceSimulationStore';
import { resolveBottomLayout, type BottomLayout } from '../utils/playerBottomBarLayout';

// src/hooks/useBottomLayoutTracking.ts
// 主窗口按窗口宽度在紧凑档和桌面档之间切换（progress-bar v3）。只听 resize、只在跨档时写一次 store，
// 不量任何元素。挂在主窗口的覆盖层上，OBS 之类的独立页面不挂，它们的底部组件一直是桌面档。
//
// Dev 浮层的「设备模拟」（stores/useDeviceSimulationStore）优先于窗口宽度：选移动就一直是紧凑档、
// 选 PC 就一直是桌面档，取消模拟后按当前窗口宽度重新定档。

export const useBottomLayoutTracking = (): void => {
    // layout effect：第一次判断在首帧绘制之前做完，窄窗口打开时不会先闪一下桌面布局。
    useLayoutEffect(() => {
        const store = useBottomDockStore.getState();
        let current: BottomLayout = resolveBottomLayout(window.innerWidth, null);
        // 模拟开着时档位由它定；关着才用窗口宽度算出来的那一档。
        const apply = () => {
            const device = useDeviceSimulationStore.getState().device;
            if (device === 'mobile') {
                useBottomDockStore.getState().setLayout('compact');
                return;
            }
            if (device === 'pc') {
                useBottomDockStore.getState().setLayout('desktop');
                return;
            }
            useBottomDockStore.getState().setLayout(current);
        };
        apply();
        store.setTracking(true);
        const onResize = () => {
            const next = resolveBottomLayout(window.innerWidth, current);
            if (next === current) return;
            current = next;
            apply();
        };
        window.addEventListener('resize', onResize);
        // 模拟开关一变就重算，不用等窗口尺寸变化。
        const unsubscribe = useDeviceSimulationStore.subscribe(apply);
        return () => {
            window.removeEventListener('resize', onResize);
            unsubscribe();
            useBottomDockStore.getState().setTracking(false);
        };
    }, []);
};
