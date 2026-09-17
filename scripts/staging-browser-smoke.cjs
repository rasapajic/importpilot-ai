const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright-core');

const origin = process.env.STAGING_ORIGIN;
const executablePath = process.env.CHROME;
if (!origin || !executablePath) throw new Error('STAGING_ORIGIN and CHROME are required.');

const googleCopy = {
  en: 'Continue with Google',
  de: 'Mit Google fortfahren',
  sr: 'Nastavi preko Google-a',
};
const dashboardHeading = {
  en: 'Which product are you looking for?',
  de: 'Welches Produkt suchen Sie?',
  sr: 'Koji proizvod tražite?',
};
const htmlLang = { en: 'en', de: 'de', sr: 'sr-Latn' };

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
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  try {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      for (const locale of ['en', 'de', 'sr']) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        await context.addCookies([{ name: 'tradepilot_locale', value: locale, url: origin }]);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
        page.on('response', (response) => {
          if (response.status() >= 500) errors.push(`http${response.status()}:${response.url()}`);
        });
        await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        if (await page.locator('html').getAttribute('lang') !== htmlLang[locale]) {
          throw new Error(`${locale}/${viewport.name}: wrong html lang`);
        }
        if (!await page.getByText(googleCopy[locale], { exact: true }).isVisible()) {
          throw new Error(`${locale}/${viewport.name}: localized Google label missing`);
        }
        const form = page.locator('form.auth-form');
        if (await form.getAttribute('method') !== 'post') throw new Error(`${locale}/${viewport.name}: auth form method is not POST`);
        if (await form.getAttribute('action') !== '/api/auth/login') throw new Error(`${locale}/${viewport.name}: login native action missing`);
        await assertNoHorizontalOverflow(page, `${locale}/${viewport.name}`, viewport.width);
        if (errors.length) throw new Error(`${locale}/${viewport.name}: runtime errors ${errors.join(',')}`);
        console.log(JSON.stringify({ locale, htmlLang: htmlLang[locale], viewport: viewport.name, overflow: false }));
        await context.close();
      }
    }

    // Security regression: JavaScript is completely disabled. This proves the server-rendered
    // registration form cannot degrade to GET or place credentials into URL/history.
    const noJsContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
    });
    await noJsContext.addCookies([{ name: 'tradepilot_locale', value: 'en', url: origin }]);
    const noJsPage = await noJsContext.newPage();
    const serverErrors = [];
    noJsPage.on('response', (response) => {
      if (response.status() >= 500) serverErrors.push(`http${response.status()}:${response.url()}`);
    });

    await noJsPage.goto(`${origin}/register`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const registerForm = noJsPage.locator('form.auth-form');
    if (await registerForm.getAttribute('method') !== 'post') throw new Error('Registration native method is not POST');
    if (await registerForm.getAttribute('action') !== '/api/auth/register') throw new Error('Registration native action missing');

    const email = `browser-native-${Date.now()}@example.test`;
    const password = `Aa1!Native-${randomUUID()}`;
    await noJsPage.locator('input[name="name"]').fill('Browser Native Acceptance');
    await noJsPage.locator('input[name="organizationName"]').fill('Browser Native Acceptance Org');
    await noJsPage.locator('input[name="email"]').fill(email);
    await noJsPage.locator('input[name="password"]').fill(password);

    await Promise.all([
      noJsPage.waitForURL('**/dashboard', { timeout: 30_000 }),
      noJsPage.getByRole('button', { name: 'Create account' }).click(),
    ]);
    await noJsPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });

    const finalUrl = new URL(noJsPage.url());
    if (finalUrl.pathname !== '/dashboard' || finalUrl.search) {
      throw new Error(`Native registration ended at unexpected URL ${noJsPage.url()}`);
    }
    if (noJsPage.url().includes(email) || noJsPage.url().includes(password) || noJsPage.url().includes('password=')) {
      throw new Error('Native registration leaked credentials into the URL');
    }
    const noJsHeading = (await noJsPage.locator('h1').first().textContent())?.trim() ?? '';
    if (noJsHeading !== dashboardHeading.en) {
      throw new Error(`Native dashboard HTML missing expected heading: ${noJsHeading}`);
    }
    const sessionCookies = await noJsContext.cookies(origin);
    const sessionCookie = sessionCookies.find((cookie) => cookie.name === 'tradepilot_session');
    if (!sessionCookie?.value) throw new Error('Native registration did not persist the session cookie');
    if (serverErrors.length) throw new Error(`Native registration server errors ${serverErrors.join(',')}`);
    console.log(JSON.stringify({
      nativeRegistrationWithoutJavaScript: true,
      nativeRegistrationFinalUrl: noJsPage.url(),
      credentialsInUrl: false,
      sessionCookiePresent: true,
      dashboardHtmlHeading: noJsHeading,
    }));
    await noJsContext.close();

    // UX regression: carry the exact native-created session into a normal JavaScript browser
    // and verify the user-visible dashboard across languages and viewports.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(sessionCookies);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) errors.push(`http${response.status()}:${response.url()}`);
    });

    await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const enHeading = page.getByRole('heading', { name: dashboardHeading.en, exact: true });
    await enHeading.waitFor({ state: 'visible', timeout: 10_000 });
    await assertNoHorizontalOverflow(page, 'dashboard/mobile/en', 390);

    for (const locale of ['sr', 'de']) {
      await context.addCookies([{ name: 'tradepilot_locale', value: locale, url: origin }]);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (await page.locator('html').getAttribute('lang') !== htmlLang[locale]) {
        throw new Error(`dashboard: wrong html lang ${locale}`);
      }
      const localizedHeading = page.getByRole('heading', { name: dashboardHeading[locale], exact: true });
      await localizedHeading.waitFor({ state: 'visible', timeout: 10_000 });
      await assertNoHorizontalOverflow(page, `dashboard/mobile/${locale}`, 390);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertNoHorizontalOverflow(page, 'dashboard/desktop/de', 1440);
    if (errors.length) throw new Error(`dashboard runtime errors ${errors.join(',')}`);

    console.log(JSON.stringify({
      nativeRegistrationSecurity: 'PASS',
      normalDashboardUx: 'PASS',
      dashboardLocales: ['en', 'sr-Latn', 'de'],
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
