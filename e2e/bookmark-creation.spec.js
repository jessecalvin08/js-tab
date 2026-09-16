import { test, expect } from '@playwright/test';

// Core action: turning a fresh new-tab page into a home page by creating a
// card and saving a link into it. This is the primary value of the extension.
//
// No seeding here: each test gets a brand-new, isolated browser context (no
// localStorage entry at all), which is exactly what "fresh install" looks
// like for this app — and it leaves localStorage free for the app's own
// writes, so page.reload() below reflects real persistence instead of a
// seed script stomping it back to empty on every navigation.

test.describe('bookmark card creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('creates a card and a bookmark, and both survive a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Add your first card' }).click();

    const cardModal = page.getByRole('heading', { name: 'Add card' });
    await expect(cardModal).toBeVisible();
    await page.getByLabel('Card name').fill('Reading List');
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    const cardHeading = page.getByRole('heading', { name: 'Reading List' });
    await expect(cardHeading).toBeVisible();

    await page.getByRole('button', { name: 'Add bookmark to Reading List' }).click();
    await page.getByPlaceholder('Paste URL...').fill('example.com/articles');
    await page.getByRole('button', { name: 'Add Link' }).click();

    // Second step of the popover: title is pre-filled from the hostname.
    await expect(page.getByLabel('Link title')).toHaveValue('example.com');
    await page.getByRole('button', { name: 'Add Link' }).click();

    const savedLink = page.getByRole('link', { name: 'example.com' });
    await expect(savedLink).toBeVisible();
    await expect(savedLink).toHaveAttribute('href', 'https://example.com/articles');

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Reading List' })).toBeVisible();
    const savedLinkAfterReload = page.getByRole('link', { name: 'example.com' });
    await expect(savedLinkAfterReload).toBeVisible();
    await expect(savedLinkAfterReload).toHaveAttribute('href', 'https://example.com/articles');
  });

  test('bad input: blank card name is rejected and no card is created', async ({ page }) => {
    await page.getByRole('button', { name: 'Add your first card' }).click();

    const cardModal = page.getByRole('heading', { name: 'Add card' });
    await expect(cardModal).toBeVisible();

    // Leave the name empty and submit anyway.
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // The app rejects the empty submission client-side: the modal stays open
    // and no card is added to the (still-empty) board.
    await expect(cardModal).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Add your first card' })).toBeVisible();
    await expect(page.getByText('Make this tab yours')).toBeVisible();
  });
});
