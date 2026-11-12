const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:3000/dev-probe.html?probe=karaokeJitter&speed=1&start=0';
const DURATION = Number(process.argv[3] || 12000);

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        args: ['--force-device-scale-factor=1'],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const samples = await page.evaluate(async (duration) => {
        const shell = document.querySelector('.visualizer-karaoke');
        if (!shell) return { error: 'shell not found' };
        const root = shell.querySelector('div[style*="bottom"]');
        if (!root) return { error: 'root not found' };
        const clip = root.lastElementChild;
        const wrap = clip.firstElementChild;
        const out = [];
        const t0 = performance.now();
        return await new Promise((resolve) => {
            const tick = () => {
                const rows = Array.from(wrap.children).map((row) => {
                    const inner = row.firstElementChild;
                    const rect = inner.getBoundingClientRect();
                    return {
                        top: Math.round(rect.top * 10) / 10,
                        h: Math.round(rect.height * 10) / 10,
                        tf: getComputedStyle(inner).transform,
                        txt: (inner.textContent || '').slice(0, 14),
                    };
                });
                out.push({
                    t: Math.round(performance.now() - t0),
                    clipTop: Math.round(clip.getBoundingClientRect().top * 10) / 10,
                    clipH: Math.round(clip.getBoundingClientRect().height * 10) / 10,
                    wrapTf: getComputedStyle(wrap).transform,
                    rows,
                });
                if (performance.now() - t0 > duration) resolve(out);
                else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }, DURATION);

    if (samples.error) { console.log(samples.error); await browser.close(); return; }
    console.log('samples:', samples.length);
    for (const index of [0, 1]) {
        const map = new Map();
        for (const s of samples) {
            const row = s.rows[index];
            if (!row) continue;
            map.set(row.top, (map.get(row.top) || 0) + 1);
        }
        console.log(`row${index} top 取值:`, [...map.entries()].sort((a, b) => b[1] - a[1]));
    }
    let last = '';
    const changes = [];
    for (const s of samples) {
        const row = s.rows[1];
        if (!row) continue;
        const key = `${row.top}|${row.h}|${row.tf}|${s.wrapTf}|${s.clipTop}`;
        if (key !== last) {
            changes.push({ t: s.t, top: row.top, h: row.h, tf: row.tf, wrap: s.wrapTf, clipTop: s.clipTop, txt: row.txt });
            last = key;
        }
    }
    console.log('row1 变化次数:', changes.length);
    for (const c of changes.slice(0, 80)) console.log(JSON.stringify(c));
    if (logs.length) console.log('logs:', logs.slice(0, 10));
    await browser.close();
})();
