const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const dump = async (label) => {
        const info = await p.evaluate(() => {
            const s = window.probeStore.mv();
            const video = document.querySelector('video');
            return {
                state: s.resolution && s.resolution.state,
                streamBvid: s.resolution && s.resolution.stream && s.resolution.stream.bvid,
                videoSrc: video ? video.getAttribute('src') : null,
                tunings: s.tunings,
            };
        });
        console.log(label, JSON.stringify(info));
    };
    await dump('initial');
    const input = p.locator('input').first();
    await input.click();
    await input.fill('BV1xx411c7mD');
    await input.press('Enter');
    await p.waitForTimeout(1200);
    await dump('after first');
    await input.click();
    await input.fill('BV1yy411c7mE');
    await input.press('Enter');
    await p.waitForTimeout(1200);
    await dump('after second');
    console.log('errors:', errs.slice(0, 5));
    await b.close();
})();
