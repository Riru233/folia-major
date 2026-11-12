const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
    await p.goto('http://127.0.0.1:3000/dev-probe.html?probe=bilibiliBv', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const info = await p.evaluate(() => {
        const play = window.probeStore.playback();
        return {
            enabled: window.probeStore.lab().bilibiliMvEnabled,
            currentSong: play.currentSong && play.currentSong.name,
            transition: play.transitionDisplay,
        };
    });
    console.log(JSON.stringify(info));
    await b.close();
})();
