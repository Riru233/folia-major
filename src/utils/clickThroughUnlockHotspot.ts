// src/utils/clickThroughUnlockHotspot.ts
// Geometry of the hover hotspot that temporarily lifts `setIgnoreMouseEvents` while click-through is
// on, so the unlock button (AppShell) stays clickable. The main process polls the cursor against the
// same rectangle (`MAIN_WINDOW_CLICK_THROUGH_UNLOCK_HOTSPOT` in electron/main.cjs), so the two
// constants must stay identical.
//
// The unlock button sits at `right-[210px]` normally and at `right-[254px]` while the titlebar shows
// the fullscreen button (AppShell). It is 28px wide (`w-7`). The hotspot has to cover both spots,
// otherwise the button is revealed beside the hotspot and moving onto it drops the unlock again.
// The media buttons to its left (ClickThroughMediaControls, #471) come up with it, so the hotspot
// reaches over them as well: an 86px group at `right-[244px]`, or `right-[288px]` with fullscreen.
// It only grows leftward: its right edge stays 206px in, clear of the caption buttons (about 138px
// on Windows) of a maximized window underneath, which would otherwise land on these buttons.

export const CLICK_THROUGH_UNLOCK_HOTSPOT = {
    width: 172,
    height: 40,
    // 176 (window buttons + gap) + the 30px the lock and the media group are nudged inwards.
    rightInset: 206,
    topInset: 4,
} as const;

// Right-edge offsets (px from the window's right edge) of the unlock button in AppShell.
export const CLICK_THROUGH_UNLOCK_BUTTON_RIGHT_OFFSET = 210;
export const CLICK_THROUGH_UNLOCK_BUTTON_RIGHT_OFFSET_WITH_FULLSCREEN_BUTTON = 254;
export const CLICK_THROUGH_UNLOCK_BUTTON_WIDTH = 28;

// Right-edge offsets and width of the media button group beside the unlock button in AppShell.
export const CLICK_THROUGH_MEDIA_CONTROLS_RIGHT_OFFSET = 244;
export const CLICK_THROUGH_MEDIA_CONTROLS_RIGHT_OFFSET_WITH_FULLSCREEN_BUTTON = 288;
export const CLICK_THROUGH_MEDIA_CONTROLS_WIDTH = 86;

// One window button is 44px wide (`w-11` in WindowControls).
export const WINDOW_CONTROL_BUTTON_WIDTH = 44;
// Room left for the macOS traffic lights when the drawn buttons share the left edge with them.
export const NATIVE_TRAFFIC_LIGHTS_RESERVED_WIDTH = 76;
// The lock and the media group sit this much further in than the window buttons need: the buttons
// keep a clear band of their own at the edge, so their hover reveal never fights the lock.
export const CLICK_THROUGH_UNLOCK_BUTTON_SHIFT = 30;
// The lock starts this far past the window buttons; both layouts add the shift above on top.
export const CLICK_THROUGH_UNLOCK_BUTTON_GAP = 4;
export const CLICK_THROUGH_MEDIA_CONTROLS_GAP = 6;

// How far the window buttons reach in from their edge. With the macOS traffic lights the drawn
// minimize / maximize / close are gone: only remote control and fullscreen are left, and on the
// left they start after the traffic lights. The main process shifts its hotspot by the same
// amounts (`resolveUnlockHotspot` in electron/mainWindowClickThrough.cjs).
export const resolveWindowControlsExtent = ({ hasFullscreenButton, nativeTrafficLights, side }: {
    hasFullscreenButton: boolean;
    nativeTrafficLights: boolean;
    side: 'left' | 'right';
}): number => {
    const optional = hasFullscreenButton ? 1 : 0;
    if (!nativeTrafficLights) return (4 + optional) * WINDOW_CONTROL_BUTTON_WIDTH;
    return (side === 'left' ? NATIVE_TRAFFIC_LIGHTS_RESERVED_WIDTH : 0) + (1 + optional) * WINDOW_CONTROL_BUTTON_WIDTH;
};

// Where the unlock button starts, measured in from its edge: the window buttons, the fixed gap and
// the extra shift. AppShell and the hover hotspot both have to agree on this.
export const resolveUnlockButtonInset = ({ hasFullscreenButton, nativeTrafficLights, side }: {
    hasFullscreenButton: boolean;
    nativeTrafficLights: boolean;
    side: 'left' | 'right';
}): number => resolveWindowControlsExtent({ hasFullscreenButton, nativeTrafficLights, side })
    + CLICK_THROUGH_UNLOCK_BUTTON_GAP
    + CLICK_THROUGH_UNLOCK_BUTTON_SHIFT;

// With the window buttons on the left (`titlebarSide`) the row is mirrored: the same offsets count
// from the left edge, and the hotspot covers 176px to 348px in from the left.
//
// Whether a viewport point lies inside the unlock hotspot of a window `viewportWidth` px wide.
// With the window buttons on the left the whole row is mirrored, so the point is mirrored too.
export const isWithinClickThroughUnlockHotspot = (
    clientX: number,
    clientY: number,
    viewportWidth: number,
    side: 'left' | 'right' = 'right',
): boolean => {
    if (side === 'left') clientX = viewportWidth - clientX;
    const right = viewportWidth - CLICK_THROUGH_UNLOCK_HOTSPOT.rightInset;
    const left = right - CLICK_THROUGH_UNLOCK_HOTSPOT.width;
    const top = CLICK_THROUGH_UNLOCK_HOTSPOT.topInset;
    const bottom = top + CLICK_THROUGH_UNLOCK_HOTSPOT.height;
    return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
};
