import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
for (let i = 0; i < 5; i++) {
  const c = await page.$('[data-folia-sheet] button[aria-label="关闭"]');
  if (!c) break;
  await c.click({ force: true }); await page.waitForTimeout(600);
}
await page.evaluate(() => { for (const el of document.querySelectorAll('div.fixed.inset-0')) { if (getComputedStyle(el).zIndex === '200') el.style.pointerEvents = 'none'; } });
const info = await page.evaluate(() => {
  const r = el => el ? (b => [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)])(el.getBoundingClientRect()) : null;
  const nav = document.querySelector('[data-testid="grid3d-nav"]');
  return {
    viewport: [innerWidth, innerHeight],
    edge: r(document.querySelector('.scratchpad-edge')),
    account: r(document.querySelector('[data-testid="grid3d-nav-account"]')),
    lattice: r(document.querySelector('[data-testid="home-lattice-pill"]')),
    track: r(nav?.querySelector('[role="navigation"]')),
    settings: r(document.querySelector('[data-grid3d-settings]')),
    text: document.body.innerText.slice(0, 100),
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'test/ui/_tmpRight0.png' });
await browser.close();
