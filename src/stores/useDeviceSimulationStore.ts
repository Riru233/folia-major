import { create } from 'zustand';

// src/stores/useDeviceSimulationStore.ts
// Dev 浮层里的「设备模拟」：强制把底部布局当成 PC 或移动档，用来看窄窗口下才会出现的紧凑布局，
// 不用真的去缩窗口。`off` 是默认值，按窗口宽度走（见 hooks/useBottomLayoutTracking）。
// 只影响档位判定，不改视口尺寸；刷新即回到 off（不给开发开关留持久化状态）。

export type DeviceSimulation = 'off' | 'pc' | 'mobile';

type DeviceSimulationState = {
    device: DeviceSimulation;
    /** 再点一次当前项就回到 off。 */
    toggleDevice: (device: Exclude<DeviceSimulation, 'off'>) => void;
};

export const useDeviceSimulationStore = create<DeviceSimulationState>(set => ({
    device: 'off',
    toggleDevice: device => set(state => ({ device: state.device === device ? 'off' : device })),
}));
