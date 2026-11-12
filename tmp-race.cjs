const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv&slowsearch=1', { waitUntil: 'load' });
    await p.waitForTimeout(300);           // 搜索还在飞
    const input = p.locator('input').first();
    await input.click();
    await input.fill('BV1yy411c7mE');
    await input.press('Enter');
    await p.waitForTimeout(1000);
    const mid = await p.evaluate(() => window.probeStore.mv().resolution);
    console.log('right after commit:', JSON.stringify(mid));
    await p.waitForTimeout(5000);          // 等慢搜索回来
    const end = await p.evaluate(() => window.probeStore.mv().resolution);
    console.log('after slow search lands:', JSON.stringify(end));
    await b.close();
})();
