import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[200\\]').forEach(el => el.remove()));
await page.waitForTimeout(300);

const state = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-glass]')];
    const pick = (fn) => all.find(fn);
    const bg = pick(el => el.tagName === 'DIV' && Math.round(el.getBoundingClientRect().width) === 40);
    const form = pick(el => el.tagName === 'FORM');
    return {
        bg: bg ? getComputedStyle(bg).scale : 'no-bg',
        form: form ? getComputedStyle(form).scale : 'no-form',
    };
});

// 点导航竖栏里的一项：底板不该缩
const navTab = await page.evaluate(() => {
    const tab = document.querySelector('[data-home-tab]');
    const r = tab.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: tab.tagName };
});
await page.mouse.move(navTab.x, navTab.y);
await page.mouse.down();
await page.waitForTimeout(140);
console.log('nav tab pressed ->', JSON.stringify(await state()));
await page.mouse.up();
await page.waitForTimeout(300);
console.log('nav tab released->', JSON.stringify(await state()));

// 点搜索框：FORM 不该缩
const input = await page.evaluate(() => {
    const el = document.querySelector('[data-glass] form, form[data-glass]') || document.querySelector('form[data-glass]');
    const inp = el && el.querySelector('input');
    if (!inp) return null;
    const r = inp.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
console.log('input found:', !!input);
if (input) {
    await page.mouse.move(input.x, input.y);
    await page.mouse.down();
    await page.waitForTimeout(140);
    console.log('input pressed ->', JSON.stringify(await state()));
    await page.mouse.up();
    await page.waitForTimeout(250);
}

// 按住后拖动超过 8px：应立刻回弹
const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-glass]')].find(el => el.tagName === 'BUTTON');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const btnScale = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-glass]')].find(el => el.tagName === 'BUTTON');
    return getComputedStyle(b).scale;
});
await page.mouse.move(btn.x, btn.y);
await page.mouse.down();
await page.waitForTimeout(130);
console.log('btn held      ', await btnScale());
await page.mouse.move(btn.x + 30, btn.y, { steps: 5 });
await page.waitForTimeout(260);
console.log('after drag 30 ', await btnScale());
await page.mouse.up();
await page.waitForTimeout(250);
await browser.close();
