const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv&searchms=0&apims=400', { waitUntil: 'load' });
    await p.waitForTimeout(150);
    const input = p.locator('input').first();
    await input.click(); await input.fill('BV1yy411c7mE'); await input.press('Enter');
    await p.waitForTimeout(3000);
    const res = await p.evaluate(() => ({ bvid: window.probeStore.mv().resolution?.stream?.bvid, state: window.probeStore.mv().resolution?.state }));
    console.log('RESULT:', JSON.stringify(res));
    console.log(JSON.stringify(await p.evaluate(() => window.probeRequests)));
    await b.close();
})();
