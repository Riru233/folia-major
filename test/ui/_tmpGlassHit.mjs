import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto('http://127.0.0.1:5198/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);
await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[200\\]').forEach(el => el.remove()));
await page.locator('button[aria-label="选项"]').first().click();
await page.waitForTimeout(1200);
const hit = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-folia-keyboard-window] aside button')][0];
    const r = btn.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { tag: el.tagName, insideBtn: btn.contains(el), cls: (el.className || '').toString().slice(0, 50) };
});
console.log('hit:', JSON.stringify(hit));
await page.locator('[data-folia-keyboard-window] aside button').first().click();
await page.waitForTimeout(600);
console.log('title after click:', await page.evaluate(() => document.querySelector('[data-folia-keyboard-window] [role="dialog"]')?.textContent?.slice(0, 30)));
await browser.close();
