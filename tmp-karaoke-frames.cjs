const { chromium } = require('playwright');
const { PNG } = require('pngjs');

// 逐帧定格：同一个探针，不同 start（speed=0 冻结），量蓝字/白字像素的包围盒，看上下是否漂移。
const BASE = 'http://127.0.0.1:3000/dev-probe.html?probe=karaokeJitter&speed=0';

const bbox = (png, predicate) => {
    let minX = 1e9; let minY = 1e9; let maxX = -1; let maxY = -1; let count = 0;
    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const i = (png.width * y + x) << 2;
            if (predicate(png.data[i], png.data[i + 1], png.data[i + 2])) {
                count += 1;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    return count === 0 ? null : { minX, minY, maxX, maxY, count };
};

(async () => {
    const extra = process.argv[2] || '';
    const from = Number(process.argv[3] || 5.2);
    const to = Number(process.argv[4] || 9.6);
    const step = Number(process.argv[5] || 0.2);
    const browser = await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        args: ['--force-device-scale-factor=1'],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });

    for (let t = from; t <= to + 1e-9; t += step) {
        await page.goto(`${BASE}&start=${t.toFixed(2)}${extra}`, { waitUntil: 'load' });
        await page.waitForTimeout(700);
        const info = await page.evaluate(() => {
            const shell = document.querySelector('.visualizer-karaoke');
            const root = shell && shell.querySelector('div[style*="bottom"]');
            if (!root) return null;
            const clip = root.lastElementChild;
            const wrap = clip.firstElementChild;
            const rows = Array.from(wrap.children).map((row) => {
                const inner = row.firstElementChild;
                const r = inner.getBoundingClientRect();
                return { top: Math.round(r.top), bottom: Math.round(r.bottom), tf: getComputedStyle(inner).transform, txt: inner.textContent.slice(0, 12) };
            });
            return { rows, clipTop: Math.round(clip.getBoundingClientRect().top), clipH: Math.round(clip.getBoundingClientRect().height), wrapTf: getComputedStyle(wrap).transform };
        });
        const buf = await page.screenshot();
        const png = PNG.sync.read(buf);
        const blue = bbox(png, (r, g, b) => r < 90 && g < 90 && b > 140);
        const white = bbox(png, (r, g, b) => r > 235 && g > 235 && b > 235);
        console.log(JSON.stringify({
            t: t.toFixed(2),
            rows: info && info.rows.map((r) => `${r.top}-${r.bottom} ${r.tf}`),
            wrapTf: info && info.wrapTf,
            blue: blue && { y: `${blue.minY}-${blue.maxY}`, x: `${blue.minX}-${blue.maxX}`, n: blue.count },
            white: white && { y: `${white.minY}-${white.maxY}`, x: `${white.minX}-${white.maxX}`, n: white.count },
        }));
    }
    await browser.close();
})();
