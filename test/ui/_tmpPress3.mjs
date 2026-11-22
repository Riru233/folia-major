import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
// 关掉首次引导之类盖住全屏的遮罩（只是测试时清场）
await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[200\\]').forEach(el => el.remove()));
await page.waitForTimeout(300);

const info = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-glass]')].find(el => el.tagName === 'BUTTON');
    if (!btn) return { missing: true };
    const r = btn.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
        rect: [r.x, r.y, r.width, r.height], cx, cy,
        hit: hit ? `${hit.tagName}.${(hit.className || '').toString().slice(0, 40)}` : 'null',
        contains: hit ? btn.contains(hit) : false,
    };
});
console.log('target info', JSON.stringify(info));

if (!info.missing) {
    await page.mouse.move(info.cx, info.cy);
    await page.waitForTimeout(150);
    const sample = () => page.evaluate(() => {
        const btn = [...document.querySelectorAll('[data-glass]')].find(el => el.tagName === 'BUTTON');
        return getComputedStyle(btn).scale;
    });
    console.log('before   ', await sample());
    await page.mouse.down();
    await page.waitForTimeout(40);
    console.log('down 40ms', await sample());
    await page.waitForTimeout(120);
    console.log('held     ', await sample());
    await page.mouse.up();
    await page.waitForTimeout(80);
    console.log('up 80ms  ', await sample());
    await page.waitForTimeout(300);
    console.log('settled  ', await sample());
}
await browser.close();
