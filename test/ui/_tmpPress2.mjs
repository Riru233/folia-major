import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const out = await page.evaluate(async () => {
    const btn = document.querySelector('[data-glass]');
    const box = btn.getBoundingClientRect();
    const report = { tag: btn.tagName, rect: [box.x, box.y, box.width, box.height] };
    // WAAPI 对独立属性 scale 的支持
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const a = probe.animate([{ scale: '0.5' }], { duration: 10, fill: 'forwards' });
    await new Promise(r => setTimeout(r, 40));
    report.waapiScale = getComputedStyle(probe).scale;
    a.cancel();
    probe.remove();

    // 合成 pointerdown 到真实玻璃按钮
    const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    report.target = target ? `${target.tagName}.${(target.className || '').toString().slice(0, 30)}` : 'null';
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: 'mouse' }));
    await new Promise(r => setTimeout(r, 30));
    report.scaleAfterDown = getComputedStyle(btn).scale;
    await new Promise(r => setTimeout(r, 100));
    report.scaleHeld = getComputedStyle(btn).scale;
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse' }));
    await new Promise(r => setTimeout(r, 300));
    report.scaleAfterUp = getComputedStyle(btn).scale;
    return report;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
