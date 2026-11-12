const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    p.on('pageerror', (e) => console.log('ERR', String(e)));
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv', { waitUntil: 'load' });
    await p.waitForTimeout(1000);
    const read = async (label) => {
        const info = await p.evaluate(() => {
            const v = document.querySelector('video');
            return { src: v && v.currentSrc, state: window.probeStore.mv().resolution?.state };
        });
        console.log(label, JSON.stringify(info));
    };
    const input = p.locator('input').first();
    await input.click(); await input.fill('BV1xx411c7mD'); await input.press('Enter');
    await p.waitForTimeout(1500);
    await read('after A');
    await input.click(); await input.fill('BV1yy411c7mE'); await input.press('Enter');
    await p.waitForTimeout(1500);
    await read('after B');
    await b.close();
})();
