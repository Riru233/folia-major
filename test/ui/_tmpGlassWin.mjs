import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5198/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);
await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[200\\]').forEach(el => el.remove()));
await page.locator('button[aria-label="选项"]').first().click();
await page.waitForTimeout(1400);
const info = await page.evaluate(() => {
    const panel = document.querySelector('[data-folia-keyboard-window] [role="dialog"]');
    const glass = panel.querySelector('[data-glass]');
    const cs = getComputedStyle(glass);
    return {
        bf: cs.backdropFilter,
        inline: panel.getAttribute('style')?.match(/backdrop-filter:[^;]*/)?.[0],
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
        size: [Math.round(panel.offsetWidth), Math.round(panel.offsetHeight)],
        layerBf: getComputedStyle(document.querySelector('[data-folia-keyboard-window] > div[aria-hidden]')).backdropFilter,
        panelZ: getComputedStyle(panel).zIndex + '/' + getComputedStyle(panel).isolation,
        glassZ: getComputedStyle(glass).zIndex,
        filters: [...document.querySelectorAll('#filter-defs filter')].length,
    };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'test/ui/_tmpGlassWin.png' });
const box = await page.locator('[data-folia-keyboard-window] [role="dialog"]').boundingBox();
await page.screenshot({ path: 'test/ui/_tmpGlassWin-zoom.png', clip: { x: box.x - 30, y: box.y - 30, width: 380, height: 340 } });
await browser.close();
