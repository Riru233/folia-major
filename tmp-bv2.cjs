const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => errs.push(m.type() + ': ' + m.text()));
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv', { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    console.log('html length', (await p.content()).length);
    console.log(await p.locator('body').innerText());
    console.log('logs:', errs.slice(0, 20));
    await p.screenshot({ path: 'tmp-bv.png' });
    await b.close();
})();
