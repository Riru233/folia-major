import { test, type Page } from '@playwright/test';

// 临时探针：切到 grid suite 后截图 + 统计页头里平台切换钮 / 页签胶囊 / 搜索钮的位置关系。
// 跑法：npx playwright test -c playwright.probe.config.ts _tmpHeaderPill

const WIDTHS = [560, 640, 720, 760, 800, 1024, 1440];

async function open(page: Page, width: number) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.evaluate(async () => {
        const mod = await import('/src/library/app/librarySuiteChoice.ts');
        mod.chooseLibrarySuite('grid');
    });
    await page.waitForTimeout(2500);
}

test('header pill placement across widths', async ({ page }) => {
    test.setTimeout(300_000);
    for (const width of WIDTHS) {
        await open(page, width);
        const info = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('[data-home-tab]'));
            const pills = Array.from(document.querySelectorAll('[data-testid="online-provider-switcher"]')).map((n) => {
                const r = n.getBoundingClientRect();
                return {
                    variant: n.getAttribute('data-switcher-variant'),
                    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                };
            });
            const rects = tabs.map((n) => n.getBoundingClientRect());
            const tabRow = rects.length
                ? { left: Math.round(Math.min(...rects.map((r) => r.left))), right: Math.round(Math.max(...rects.map((r) => r.right))), top: Math.round(Math.min(...rects.map((r) => r.top))) }
                : null;
            const form = document.querySelector('form[data-glass]');
            const fr = form ? form.getBoundingClientRect() : null;
            return {
                tabCount: tabs.length,
                tabRow,
                pills,
                search: fr ? { x: Math.round(fr.x), y: Math.round(fr.y), w: Math.round(fr.width), h: Math.round(fr.height) } : null,
                compact: document.querySelector('[data-testid="home-search-toggle"]') !== null,
            };
        });
        console.log(`width=${width} ${JSON.stringify(info)}`);
        await page.screenshot({ path: `test-results/header-${width}.png`, clip: { x: 0, y: 0, width, height: 240 } });
    }
});
