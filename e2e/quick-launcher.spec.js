import { test, expect } from '@playwright/test';
import { seedDashboard, stubExternalNavigation, cardWithBookmark } from './helpers.js';

// Core action: the Ctrl/Cmd+K launcher power users rely on to jump straight
// to a saved bookmark (or fall back to a web search) without touching the mouse.

test.describe('quick launcher', () => {
  test.beforeEach(async ({ page, context }) => {
    await stubExternalNavigation(context);
    await seedDashboard(page, {
      workspace: cardWithBookmark({ bookmarkTitle: 'Example Site', bookmarkUrl: 'https://example.com/' }),
      settings: { openInNewTab: true, searchEngine: 'google' }
    });
    await page.goto('/');
  });

  test('Ctrl+K finds a saved bookmark by partial title and opens it', async ({ page }) => {
    await page.keyboard.press('Control+k');

    const dialog = page.getByRole('dialog', { name: 'Quick launcher' });
    await expect(dialog).toBeVisible();

    await page.getByRole('textbox', { name: 'Quick search' }).fill('exam');
    await expect(dialog.getByRole('button', { name: 'Example Site Test Card' })).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.keyboard.press('Enter')
    ]);

    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toBe('https://example.com/');
  });

  test('unhappy: a query matching nothing falls back to a web search instead of crashing', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox', { name: 'Quick search' }).fill('zzzznomatchzzzz');

    await expect(page.getByText('No bookmark matches — press Enter to search the web.')).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.keyboard.press('Enter')
    ]);

    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toBe('https://www.google.com/search?q=zzzznomatchzzzz');
  });
});
