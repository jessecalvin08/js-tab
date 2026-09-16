import { test, expect } from '@playwright/test';
import { seedDashboard, stubExternalNavigation } from './helpers.js';

// Core action: the omnibox-style search bar shown on every new tab. Typing a
// query and submitting should hand the user off to their search engine.

test.describe('search bar', () => {
  test.beforeEach(async ({ page, context }) => {
    await stubExternalNavigation(context);
    await seedDashboard(page, { settings: { openInNewTab: true, searchEngine: 'google' } });
    await page.goto('/');
  });

  test('submitting a query opens the configured search engine in a new tab', async ({ page }) => {
    const searchInput = page.getByRole('searchbox', { name: 'Search Google or open a URL' });
    await searchInput.fill('capybara facts');

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Search with Google' }).click()
    ]);

    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toBe('https://www.google.com/search?q=capybara%20facts');
  });

  test('bad input: submitting an empty query does not navigate anywhere', async ({ page }) => {
    const searchInput = page.getByRole('searchbox', { name: 'Search Google or open a URL' });
    await expect(searchInput).toHaveValue('');

    const startUrl = page.url();
    let popupOpened = false;
    page.once('popup', () => { popupOpened = true; });

    await page.getByRole('button', { name: 'Search with Google' }).click();
    // Give any (incorrect) navigation a moment to happen before asserting it didn't.
    await page.waitForTimeout(300);

    expect(popupOpened).toBe(false);
    expect(page.url()).toBe(startUrl);
    await expect(page.getByRole('searchbox', { name: 'Search Google or open a URL' })).toBeVisible();
  });
});
