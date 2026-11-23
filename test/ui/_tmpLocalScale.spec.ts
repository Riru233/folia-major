import { test } from '@playwright/test';
import { installBaseState, localImportFixture, mockNeteaseApi, openApp } from './helpers/appFixtures';

test.use({ screenshot: 'only-on-failure' });

test('local section switch has relay scale layers', async ({ page }) => {
    await installBaseState(page, { neteaseMode: 'guest', localImportFixture });
    await mockNeteaseApi(page, 'guest');
    await openApp(page);
    await page.waitForTimeout(2000);
    // 走固件导入流程：与 localPureMusicMark.spec 一致，先到 Folder 页再点导入。
    await page.getByRole('button', { name: 'Folder' }).last().click();
    await page.getByRole('button', { name: 'Import Folder' }).last().click();
    await page.getByText('All Songs').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);

    const nav = page.locator('[data-testid="grid3d-nav"] button[aria-label="本地"]');
    if (await nav.count()) { await nav.first().click({ force: true }); await page.waitForTimeout(1200); }

    const readLayers = () => page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-grid3d-slider]')].map(slider => {
            let el: HTMLElement | null = slider;
            while (el && !String(el.className || '').includes('absolute inset-0')) el = el.parentElement;
            const style = el ? el.getAttribute('style') || '' : '';
            const title = el?.querySelector('[data-grid3d-slider]')?.getAttribute('data-testid');
            return { cls: el ? String(el.className).slice(0, 40) : null, style: style.slice(0, 160), title };
        });
        return rows;
    });

    console.log('BEFORE', JSON.stringify(await readLayers()));
    const albums = page.locator('[data-grid-view-tab="albums"]');
    console.log('tabs', await page.locator('[data-grid-view-tab]').count());
    if (await albums.count()) await albums.first().click({ force: true });
    await page.waitForTimeout(100);
    console.log('MID', JSON.stringify(await readLayers()));
    await page.waitForTimeout(1400);
    console.log('AFTER', JSON.stringify(await readLayers()));
    await page.screenshot({ path: '/tmp/local-scale-fixture.png' });
});
