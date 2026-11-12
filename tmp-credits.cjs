const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=karaokeJitter&speed=0&credits=1&start=14.95', { waitUntil: 'load' });
    await p.waitForTimeout(800);
    const op = await p.evaluate(() => {
        const h1 = document.querySelector('h1');
        return h1 ? getComputedStyle(h1.parentElement).opacity : null;
    });
    console.log('opacity at 14.95:', op);
    await p.screenshot({ path: 'tmp-fade.png' });
    await b.close();
})();
