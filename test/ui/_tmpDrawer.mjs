import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
for (let i = 0; i < 5; i++) {
  const c = await page.$('[data-folia-sheet] button[aria-label="关闭"]');
  if (!c) break;
  await c.click({ force: true }); await page.waitForTimeout(500);
}
await page.evaluate(() => { for (const el of document.querySelectorAll('div.fixed.inset-0')) { if (getComputedStyle(el).zIndex === '200') el.style.pointerEvents = 'none'; } });
const edge = await page.$('.scratchpad-edge');
const eb = await edge.boundingBox();
await page.mouse.move(eb.x + 20, eb.y + eb.height / 2);
await page.waitForTimeout(400);
const handle = await page.$('[data-testid="scratchpad-handle"]');
console.log('handle box', await handle.boundingBox());
await handle.click({ force: true });
await page.waitForTimeout(900);
const m = await page.evaluate(() => {
  const r = el => el ? (b => [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)])(el.getBoundingClientRect()) : null;
  const drawer = document.querySelector('[data-testid="scratchpad-drawer"]');
  const paper = document.querySelector('.scratchpad-panel-paper.is-band');
  const fold = document.querySelector('.scratchpad-band-fold');
  const expand = document.querySelector('.scratchpad-band-expand');
  const head = document.querySelector('.scratchpad-band.is-panel .scratchpad-band-head');
  const slim = document.querySelector('.scratchpad-slim');
  const slimHead = document.querySelector('.scratchpad-slim-head');
  return {
    drawer: r(drawer), paper: r(paper), fold: r(fold), expand: r(expand), head: r(head),
    slim: r(slim), slimHead: r(slimHead),
    overflow: drawer ? getComputedStyle(drawer).overflow : null,
  };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: 'test/ui/_tmpDrawer.png' });
await browser.close();
