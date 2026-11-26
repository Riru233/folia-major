import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const glassScale = i => page.evaluate(index => {
    const el = document.querySelectorAll('[data-glass]')[index];
    return el ? getComputedStyle(el).scale : 'missing';
}, i);

const rect = async i => page.evaluate(index => {
    const el = document.querySelectorAll('[data-glass]')[index];
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, i);

// 1) data-glass 按钮（自身就是控件）
const btn = await rect(1);
await page.mouse.move(btn.x, btn.y);
await page.waitForTimeout(120);
console.log('button before ', await glassScale(1));
await page.mouse.down();
await page.waitForTimeout(30);
console.log('button down30 ', await glassScale(1));
await page.waitForTimeout(120);
console.log('button held   ', await glassScale(1));
await page.mouse.up();
await page.waitForTimeout(60);
console.log('button up60   ', await glassScale(1));
await page.waitForTimeout(260);
console.log('button settled', await glassScale(1));

// 2) 导航竖栏背景板：点里面的按钮，底板不该缩
const navBtn = await page.evaluate(() => {
    const bg = [...document.querySelectorAll('[data-glass]')].find(el => el.tagName === 'DIV' && el.getBoundingClientRect().width === 40);
    if (!bg) return null;
    const r = bg.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 20 };
});
console.log('nav bg exists:', !!navBtn);
if (navBtn) {
    console.log('nav bg before ', await page.evaluate(() => {
        const bg = [...document.querySelectorAll('[data-glass]')].find(el => el.tagName === 'DIV' && el.getBoundingClientRect().width === 40);
        return getComputedStyle(bg).scale;
    }));
}
await browser.close();
