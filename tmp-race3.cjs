const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv&slowsearch=1', { waitUntil: 'load' });
    await p.evaluate(() => {
        window.trace = [];
        window.probeStore.mv().constructor; // noop
    });
    await p.waitForTimeout(300);
    const input = p.locator('input').first();
    await input.click(); await input.fill('BV1yy411c7mE'); await input.press('Enter');
    await p.waitForTimeout(6000);
    console.log(JSON.stringify(await p.evaluate(() => window.probeRequests), null, 1));
    console.log('final:', JSON.stringify(await p.evaluate(() => window.probeStore.mv().resolution?.stream?.bvid)));
    await b.close();
})();
