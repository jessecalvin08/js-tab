import { test, expect } from '@playwright/test';
import { seedDashboard } from './helpers.js';

// The weather widget is the one piece of the dashboard that depends on a
// live third-party API on every load, making it the natural place to test
// a real network failure instead of a scripted "bad input".

test.describe('weather widget', () => {
  test('loads and displays the current conditions for the configured city', async ({ page, context }) => {
    await context.route('https://geocoding-api.open-meteo.com/**', (route) => (
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [{ latitude: 13.08, longitude: 80.27, name: 'Chennai' }] })
      })
    ));
    await context.route('https://api.open-meteo.com/**', (route) => (
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ current: { temperature_2m: 31, weather_code: 1 } })
      })
    ));

    await seedDashboard(page, { settings: { location: 'Chennai' } });
    await page.goto('/');

    const widget = page.getByTitle('Mainly clear');
    await expect(widget).toBeVisible();
    await expect(widget).toContainText('Chennai');
    await expect(widget).toContainText('31°C');
  });

  test('network failure: geocoding outage falls back gracefully instead of crashing', async ({ page, context }) => {
    await context.route('https://geocoding-api.open-meteo.com/**', (route) => route.abort('failed'));
    await context.route('https://api.open-meteo.com/**', (route) => route.abort('failed'));

    await seedDashboard(page, { settings: { location: 'Chennai' } });
    await page.goto('/');

    const widget = page.getByTitle('Weather unavailable');
    await expect(widget).toBeVisible();
    await expect(widget).toContainText('--');

    // The rest of the dashboard must still be usable — a failed widget should
    // never take down the whole new tab page.
    await expect(page.getByRole('button', { name: 'Select workspace' })).toBeVisible();
  });
});
