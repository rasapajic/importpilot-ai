const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright-core');

const origin = process.env.STAGING_ORIGIN;
const executablePath = process.env.CHROME;

if (!origin || !executablePath) {
  throw new Error('STAGING_ORIGIN and CHROME are required.');
}

const googleCopy = {
  en: 'Continue with Google',
  de: 'Mit Google fortfahren',
  sr: 'Nastavi preko Google-a',
};

const dashboardCopy = {
  en: 'New search',
  de: 'Neue Suche',
  sr: 'Nova pretraga',
};

async function assertNoHorizontalOverflow(page, label, viewportWidth) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  if (metrics.scrollWidth > metrics.clientWidth + 1 || metrics.bodyWidth > metrics.clientWidth + 1) {
    throw new Error(`${label}: horizontal overflow ${JSON.stringify(metrics)}`);
  }

  const authCard = await page.locator('.auth-card').first().boundingBox().catch(() => null);
  if (authCard && (authCard.x < 0 || authCard.x + authCard.width > viewportWidth + 1)) {
    throw new Error(`${label}: auth card outside viewport ${JSON.stringify(authCard)}`);
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox'],
  });

  try {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      for (const locale of ['en', 'de', 'sr']) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        await context.addCookies([{ name: 'tradepilot_locale', value: locale, url: origin }]);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
        page.on('response', (response) => {
          if (response.status() >= 500) errors.push(`http${response.status()}:${response.url()}`);
        });

        await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

        if (await page.locator('html').getAttribute('lang') !== locale) {
          throw new Error(`${locale}/${viewport.name}: wrong html lang`);
        }
        if (!await page.getByText(googleCopy[locale], { exact: true }).isVisible()) {
          throw new Error(`${locale}/${viewport.name}: localized Google label missing`);
        }
        await assertNoHorizontalOverflow(page, `${locale}/${viewport.name}`, viewport.width);
        if (errors.length) {
          throw new Error(`${locale}/${viewport.name}: runtime errors ${errors.join(',')}`);
        }

        const googleControl = page.locator('.auth-google-button').first();
        console.log(JSON.stringify({
          locale,
          viewport: viewport.name,
          googleText: googleCopy[locale],
          googleTag: await googleControl.evaluate((element) => element.tagName),
          overflow: false,
        }));
        await context.close();
      }
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: 'tradepilot_locale', value: 'en', url: origin }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) errors.push(`http${response.status()}:${response.url()}`);
    });

    await page.goto(`${origin}/register`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('input[name="name"]').fill('Browser Acceptance');
    await page.locator('input[name="organizationName"]').fill('Browser Acceptance Org');
    await page.locator('input[name="email"]').fill(`browser-${Date.now()}@example.test`);
    await page.locator('input[name="password"]').fill(`Aa1!Browser-${randomUUID()}`);

    await Promise.all([
      page.waitForURL('**/dashboard', { timeout: 30_000 }),
      page.getByRole('button', { name: 'Create account' }).click(),
    ]);

    if (!await page.getByText(dashboardCopy.en, { exact: true }).first().isVisible()) {
      throw new Error('EN dashboard primary action missing');
    }
    await assertNoHorizontalOverflow(page, 'dashboard/mobile/en', 390);

    for (const locale of ['sr', 'de']) {
      await context.addCookies([{ name: 'tradepilot_locale', value: locale, url: origin }]);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (await page.locator('html').getAttribute('lang') !== locale) {
        throw new Error(`dashboard: wrong html lang ${locale}`);
      }
      if (!await page.getByText(dashboardCopy[locale], { exact: true }).first().isVisible()) {
        throw new Error(`dashboard: primary action missing ${locale}`);
      }
      await assertNoHorizontalOverflow(page, `dashboard/mobile/${locale}`, 390);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertNoHorizontalOverflow(page, 'dashboard/desktop/de', 1440);

    if (errors.length) {
      throw new Error(`dashboard runtime errors ${errors.join(',')}`);
    }

    console.log(JSON.stringify({
      authenticatedRegistrationFlow: true,
      dashboardLocales: ['en', 'sr', 'de'],
      mobileViewport: true,
      desktopViewport: true,
      overflow: false,
    }));
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
