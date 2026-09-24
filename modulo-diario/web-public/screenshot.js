// Captura screenshots reais da página pública 2026/21 desktop + mobile
const { chromium, devices } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();

  // desktop
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:9200/edicoes/2026/21', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: '/home/ubuntu/sistemaweb/docs/evidencias/homologacao-motor-semantico-20260901/pagina-publica-desktop.png', fullPage: true });
  await ctx.close();

  // mobile (iPhone 12)
  const mobile = await browser.newContext({ ...devices['iPhone 12'] });
  const m = await mobile.newPage();
  await m.goto('http://127.0.0.1:9200/edicoes/2026/21', { waitUntil: 'domcontentloaded' });
  await m.waitForTimeout(8000);
  await m.screenshot({ path: '/home/ubuntu/sistemaweb/docs/evidencias/homologacao-motor-semantico-20260901/pagina-publica-mobile.png', fullPage: true });
  await mobile.close();

  await browser.close();
  console.log('OK');
})();
