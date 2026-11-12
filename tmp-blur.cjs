const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv', { waitUntil: 'load' });
    await p.waitForTimeout(800);
    const input = p.locator('input').first();
    await input.click();
    await input.type('BV1xx411c7mD', { delay: 20 });   // 真键盘输入
    await p.locator('body').click({ position: { x: 5, y: 5 } });  // 失焦
    await p.waitForTimeout(1200);
    const st = await p.evaluate(() => ({ tunings: window.probeStore.mv().tunings, res: window.probeStore.mv().resolution }));
    console.log('blur commit:', JSON.stringify(st));
    await b.close();
})();
