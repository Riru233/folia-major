const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv&slowsearch=1', { waitUntil: 'load' });
    await p.waitForTimeout(300);
    console.log('requests at 300ms:', await p.evaluate(() => window.probeRequests));
    const input = p.locator('input').first();
    await input.click(); await input.fill('BV1yy411c7mE'); await input.press('Enter');
    await p.waitForTimeout(1000);
    console.log('right after:', JSON.stringify(await p.evaluate(() => window.probeStore.mv().resolution?.stream?.bvid)));
    await p.waitForTimeout(5000);
    console.log('after search lands:', JSON.stringify(await p.evaluate(() => window.probeStore.mv().resolution?.stream?.bvid)));
    console.log('requests end:', await p.evaluate(() => window.probeRequests));
    await b.close();
})();
