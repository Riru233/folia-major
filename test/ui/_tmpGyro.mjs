import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5199/?probe=playerBottomBar', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// 让播放条出现：先把指针放到屏幕底部中间
await page.mouse.move(640, 760);
await page.waitForTimeout(1200);

await page.screenshot({ path: 'test/ui/_tmpGyro-page.png' });
const buttons = await page.locator('button.h-12.w-12').all();
console.log('play buttons:', buttons.length);
const playSvg = await page.locator('svg.lucide-play').count();
const allButtons = await page.locator('button').count();
console.log('play svgs:', playSvg, 'buttons:', allButtons);

const button = page.locator('button.h-12.w-12').first();
const rect = await button.boundingBox();
console.log('rect', rect);
if (!rect) {
    await page.screenshot({ path: 'test/ui/_tmpGyro-page.png' });
    await browser.close();
    process.exit(0);
}

const read = async label => {
    const info = await button.evaluate(el => {
        const span = el.querySelector('span');
        const svg = el.querySelector('svg');
        return {
            spanTransform: span ? getComputedStyle(span).transform : 'no-span',
            svgRect: svg ? (() => { const r = svg.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(v => +v.toFixed(2)); })() : null,
            disabled: el.disabled,
        };
    });
    console.log(label.padEnd(12), JSON.stringify(info));
    return info;
};

const cx = rect.x + rect.width / 2;
const cy = rect.y + rect.height / 2;

await page.mouse.move(cx, cy);
await page.waitForTimeout(450);
const center = await read('center');

await page.mouse.move(rect.x + rect.width - 1, rect.y + 1, { steps: 8 });
await page.waitForTimeout(500);
const topRight = await read('topRight');

await page.mouse.move(rect.x + 1, rect.y + rect.height - 1, { steps: 10 });
await page.waitForTimeout(500);
const bottomLeft = await read('bottomLeft');

await page.mouse.move(rect.x + rect.width / 2, rect.y - 60, { steps: 6 });
await page.waitForTimeout(600);
const away = await read('away');

// 局部截图：抓住放大镜一样看图标有没有歪
await page.mouse.move(rect.x + rect.width - 2, rect.y + 2, { steps: 5 });
await page.waitForTimeout(400);
await page.screenshot({
    path: 'test/ui/_tmpGyro-zoom.png',
    clip: { x: rect.x - 30, y: rect.y - 30, width: rect.width + 60, height: rect.height + 60 },
});

await browser.close();
