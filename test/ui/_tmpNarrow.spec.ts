import { expect, test, type Page } from '@playwright/test';
import { APP_VERSION, GUIDE_VERSION_STORAGE_KEY, waitForAppMounted } from '../helpers/appState';

const SONGS = [
    { id: 1, name: 'Current Song With A Fairly Long Title For Testing', artists: [{ id: 10, name: 'Alpha' }], album: { id: 20, name: 'Album' }, durationMs: 180_000 },
    { id: 2, name: 'Next', artists: [{ id: 10, name: 'Alpha' }], album: { id: 20, name: 'Album' }, durationMs: 180_000 },
];

const openPlayerWithSong = async (page: Page) => {
  await page.addInitScript(([version, guideKey]) => {
    localStorage.clear();
    localStorage.setItem('library_suite_prompt_seen', 'true');
    localStorage.setItem('folia_app_language', 'zh-CN');
    localStorage.setItem('open_player_on_launch', 'true');
    localStorage.setItem('visualizer_mode', 'classic');
    localStorage.setItem('static_mode', 'true');
    localStorage.setItem(guideKey, version);
  }, [APP_VERSION, GUIDE_VERSION_STORAGE_KEY] as const);
  await page.route('**/__mock_netease__/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto('/');
  await waitForAppMounted(page);
  await expect.poll(async () => page.evaluate(async (songs) => {
    try {
      const { saveToCache } = await import('/src/services/db.ts');
      await saveToCache('last_song', songs[0]);
      await saveToCache('last_queue', songs);
      return true;
    } catch {
      return false;
    }
  }, SONGS)).toBe(true);
  await page.reload();
  await waitForAppMounted(page);
  await expect(page.locator('[data-ponder="player-bar"]')).toBeVisible();
};

for (const width of [900, 720, 520]) {
  test(`narrow ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await openPlayerWithSong(page);
    await page.waitForTimeout(1000);
    const bar = page.locator('[data-ponder="player-bar"]').first();
    console.log(width, 'style', await bar.getAttribute('data-player-bar-style'));
    console.log(width, 'box', JSON.stringify(await bar.boundingBox()));
    console.log(width, 'overflow', JSON.stringify(await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    }))));
    await page.screenshot({ path: `test-results/narrow-${width}.png` });
  });
}
