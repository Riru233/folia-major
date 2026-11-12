const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    p.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const input = p.locator('input').first();
    await input.click();
    await input.fill('BV1xx411c7mD');
    await input.press('Enter');
    await p.waitForTimeout(1500);
    const info = await p.evaluate(() => {
        const s = window.probeStore.mv();
        const host = document.querySelector('.relative.mb-6');
        return {
            resolution: s.resolution,
            enabled: s.resolution != null,
            hostHtml: host ? host.innerHTML.slice(0, 600) : null,
            videos: document.querySelectorAll('video').length,
        };
    });
    console.log(JSON.stringify(info, null, 1));
    await b.close();
})();
