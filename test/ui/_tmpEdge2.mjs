import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 3 });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
for (let i = 0; i < 5; i++) {
  const c = await page.$('[data-folia-sheet] button[aria-label="关闭"]');
  if (!c) break;
  await c.click({ force: true }); await page.waitForTimeout(500);
}
await page.evaluate(() => { for (const el of document.querySelectorAll('div.fixed.inset-0')) { if (getComputedStyle(el).zIndex === '200') el.style.pointerEvents = 'none'; } });
const m = await page.evaluate(() => {
  const rest = document.querySelector('.scratchpad-edge-rest > *');
  const paper = document.querySelector('.scratchpad-handle-paper');
  const r = el => el ? (b => [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)])(el.getBoundingClientRect()) : null;
  return { rest: r(rest), restBg: rest ? getComputedStyle(rest).backgroundColor : null, paper: r(paper), clip: paper ? getComputedStyle(paper).clipPath.slice(0, 80) : null };
});
console.log(JSON.stringify(m));
await page.screenshot({ path: 'test/ui/_tmpEdge2.png', clip: { x: 1240, y: 60, width: 40, height: 130 } });
await browser.close();
