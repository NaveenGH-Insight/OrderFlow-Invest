const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { once } = require('node:events');
const { chromium } = require('playwright-core');

async function localPort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

async function start(executable, args, profile) {
  const port = await localPort();
  const proc = spawn(executable, [
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
    `--orderflow-profile=${profile}`, ...args
  ], { stdio: 'inherit' });
  const stopped = once(proc, 'exit');
  stopped.catch(() => {});
  const stop = async () => { if (!proc.killed && proc.exitCode === null) proc.kill(); await stopped; };
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (proc.exitCode !== null) throw new Error(`App exited before startup: ${proc.exitCode}`);
      const endpoint = `http://127.0.0.1:${port}`;
      const response = await fetch(`${endpoint}/json/version`).catch(() => null);
      if (response?.ok) {
        const browser = await chromium.connectOverCDP(endpoint);
        const [context] = browser.contexts();
        const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 10000 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.waitForFunction(() => document.getElementById('quote-price')?.textContent.length > 0, null, { timeout: 10000 });
        const close = async () => {
          await page.evaluate(() => { setTimeout(() => window.close(), 0); });
          await Promise.race([
            stopped,
            delay(10000, null, { ref: false }).then(() => { throw new Error('Desktop window did not close gracefully'); })
          ]);
        };
        return { page, browser, close, stop, errors };
      }
      await delay(250);
    }
    throw new Error('Timed out waiting for packaged Chromium to start');
  } catch (error) {
    await stop();
    throw error;
  }
}

async function run() {
  const executable = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
  const args = process.argv[2] ? [] : ['.'];
  const screenshot = process.argv[3];
  const stylesScreenshot = process.argv[4];
  const profile = await mkdtemp(path.join(os.tmpdir(), 'orderflow-smoke-'));
  let app;
  const value = (page, selector) => page.locator(selector).textContent();
  try {
    app = await start(executable, args, profile);
    const { page } = app;
    await page.setViewportSize({ width: 1360, height: 900 });
    if (screenshot) await page.screenshot({ path: screenshot });
    await page.getByRole('button', { name: 'Simulation running' }).click();
    assert.equal(await value(page, '#cash-value'), '₹1,00,000.00');
    assert.equal(await page.locator('#chart svg rect.vbar').count(), 60);
    await page.getByRole('button', { name: '30m' }).click();
    assert.equal(await page.locator('#chart svg rect.vbar').count(), 30);
    await page.getByRole('button', { name: '2h' }).click();
    assert.equal(await page.locator('#chart svg rect.vbar').count(), 120);
    const chart = page.locator('#chart');
    const styleMenu = page.locator('#chart-types');
    await page.locator('#chart-type-label').click();
    const chartStyles = await styleMenu.getByRole('radio').all();
    assert.equal(chartStyles.length, 12);
    const renders = new Set();
    for (const style of chartStyles) {
      await style.check();
      const svg = chart.locator('svg');
      assert.equal(await svg.getAttribute('data-chart-style'), await style.getAttribute('value'));
      renders.add(await svg.innerHTML());
    }
    assert.equal(renders.size, 12);
    await styleMenu.getByRole('radio', { name: 'Baseline', exact: true }).check();
    await page.keyboard.press('Escape');
    assert.equal(await styleMenu.getAttribute('open'), null);
    await page.getByRole('combobox', { name: 'Bar interval' }).selectOption('5');
    assert.ok([24, 25].includes(await chart.locator('.vbar').count()));
    assert.match(await value(page, '#chart-meta'), /5-min bars.*Simulated/);
    assert.match(await value(page, '#ohlc'), new RegExp((await value(page, '#quote-price')).replace('.', '\\.')));
    await page.getByRole('button', { name: 'Show volume' }).click();
    assert.equal(await chart.locator('.vbar').count(), 0);
    await chart.press('Home');
    assert.equal(await chart.locator('#crosshair').getAttribute('visibility'), 'visible');
    const first = await value(page, '#ohlc');
    await chart.press('End');
    assert.notEqual(await value(page, '#ohlc'), first);
    await page.getByRole('button', { name: 'Expand chart' }).click();
    assert.equal(await page.locator('.watch').isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Exit expanded chart' }).getAttribute('aria-pressed'), 'true');
    if (stylesScreenshot) {
      await page.locator('#chart-type-label').click();
      await page.screenshot({ path: stylesScreenshot });
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.watch').isVisible(), true);
    await page.keyboard.press('Control+k');
    await page.getByRole('searchbox').fill('harbor');
    await page.getByRole('button', { name: 'Add HARB to watchlist' }).click();
    await page.locator('#search-dialog').getByRole('button', { name: /Harbor Infrastructure HARB/ }).click();
    await page.locator('#identity').getByRole('heading', { name: 'Harbor Infrastructure' }).waitFor();
    assert.equal(await page.locator('#watch-list [data-symbol="HARB"]').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Sell', exact: true }).click();
    await page.getByRole('button', { name: 'Place simulated sell' }).click();
    assert.equal(await value(page, '#order-error'), 'You do not own that many shares.');
    await page.getByRole('button', { name: 'Close order ticket' }).click();
    const quote = await value(page, '#quote-price');
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    assert.equal(await value(page, '#ticket-price'), quote);
    await page.getByLabel('Shares').fill('3');
    await page.getByRole('button', { name: 'Place simulated buy' }).click();
    assert.match(await value(page, '#toast'), /Bought 3 HARB/);
    assert.notEqual(await value(page, '#cash-value'), '₹1,00,000.00');
    await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    assert.match(await page.locator('#holdings tbody tr').textContent(), /HARB.*Harbor Infrastructure/);
    assert.equal(await value(page, '#holdings tbody td:nth-child(2)'), '3');
    await page.getByRole('button', { name: 'Order history', exact: true }).click();
    assert.equal(await value(page, '#orders tbody td:nth-child(5)'), quote);
    assert.deepEqual(app.errors, []);
    await app.close();
    app = undefined;

    app = await start(executable, args, profile);
    await app.page.getByRole('button', { name: 'Simulation running' }).click();
    await app.page.locator('#identity').getByRole('heading', { name: 'Harbor Infrastructure' }).waitFor();
    await app.page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    assert.equal(await value(app.page, '#holdings tbody td:nth-child(2)'), '3');
    await app.page.getByRole('button', { name: 'Order history', exact: true }).click();
    assert.match(await value(app.page, '#orders tbody tr'), /FilledHARBBuy3/);
    assert.deepEqual(app.errors, []);
    console.log('Desktop smoke passed: 12 chart styles, ranges and intervals, volume toggle, expanded view, watchlist, trading, portfolio, history, and persistence.');
  } finally {
    if (app) await app.stop();
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
