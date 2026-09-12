// Run with Node and Playwright available: node tests/linkedin-frames.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const extension = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    // All website responses are local fixtures; no LinkedIn account or network is used.
    await context.route('https://**/*', route => {
      const url = new URL(route.request().url());
      const body = url.pathname === '/feed/'
        ? '<main>Jobs <button>Messaging</button></main>'
        : '<nav>Messaging</nav><main>Inbox Conversation</main>';
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html>${body}` });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(() => chrome.storage.local.set({ highlightToggle: true }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const hasWord = (frame, word) => frame.waitForFunction(word =>
      [...(CSS.highlights.get('wh-unknown') || [])].some(range => range.toString() === word),
      word, { timeout: 5000 });

    await page.goto('https://www.linkedin.com/feed/');
    await hasWord(page, 'Jobs');
    await page.evaluate(() => {
      document.querySelector('button').onclick = () => {
        history.pushState({}, '', '/messaging/thread/test');
        document.querySelector('main').hidden = true;
        const frame = document.createElement('iframe');
        frame.src = '/preload/';
        frame.style.cssText = 'width:100%;height:600px;border:0';
        document.body.append(frame);
      };
    });
    const messagingNavigation = page.waitForEvent('framenavigated', {
      predicate: frame => frame.url().endsWith('/preload/'), timeout: 5000
    });
    await page.getByRole('button', { name: 'Messaging' }).click();
    const messaging = await messagingNavigation;
    await hasWord(messaging, 'Conversation');
    assert.match(await messaging.evaluate(() =>
      getComputedStyle(document.querySelector('nav'), '::highlight(wh-unknown)').color),
      /^rgba?\(242, 95, 22(?:,|\))/);
    assert.equal(await messaging.locator('.hlw-word-sidebar-host').count(), 0);
    await messaging.evaluate(() => document.querySelector('main').append(' Followup'));
    await hasWord(messaging, 'Followup');

    await worker.evaluate(() => chrome.storage.local.set({ highlightToggle: false }));
    await messaging.waitForFunction(() => CSS.highlights.get('wh-unknown').size === 0);
    await worker.evaluate(() => chrome.storage.local.set({ highlightToggle: true }));
    await hasWord(messaging, 'Conversation');

    const unrelatedNavigation = page.waitForEvent('framenavigated', {
      predicate: frame => frame.url().startsWith('https://example.com/')
    });
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.src = 'https://example.com/widget';
      document.body.append(frame);
    });
    const unrelated = await unrelatedNavigation;
    await unrelated.waitForLoadState('load');
    assert.equal(await unrelated.evaluate(() => CSS.highlights.has('wh-unknown')), false);

    await page.goto('https://www.linkedin.com/messaging/');
    await hasWord(page, 'Conversation');
    assert.equal(await page.locator('.hlw-word-sidebar-host').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: LinkedIn iframe navigation, dynamic text, toggle sync, direct navigation, and frame isolation');
  } finally {
    await context.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
