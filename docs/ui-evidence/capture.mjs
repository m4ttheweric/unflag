// Local capture harness for unflag dev panel evidence screenshots.
// This is NOT part of the unflag library or its published packages -- it is
// a machine-local dev tool for producing docs/ui-evidence/*.png, and is not
// run in CI. It depends on a locally installed playwright-core (e.g. from
// fast-browser's vendored runtime) and a cached Chromium/Chrome for Testing
// build; point it at yours via the env vars below.
//
// Avoids keystroke simulation on large textareas (native setter + input event).
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

const pwCorePath = process.env.UNFLAG_PW_CORE;
if (!pwCorePath) {
  throw new Error(
    'UNFLAG_PW_CORE is not set. Point it at a local playwright-core install ' +
      '(e.g. the path to fast-browser\'s vendored playwright-core), then re-run.'
  );
}
const { chromium } = require(pwCorePath);

const OUT = new URL('.', import.meta.url).pathname;
const BASE = 'http://localhost:5173';

function discoverChromiumExecutable() {
  const cacheRoot = path.join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!existsSync(cacheRoot)) return undefined;
  const names = ['Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'Chromium.app/Contents/MacOS/Chromium'];
  const entries = readdirSync(cacheRoot).filter(e => e.startsWith('chromium-')).sort().reverse();
  for (const entry of entries) {
    for (const name of names) {
      const candidate = path.join(cacheRoot, entry, 'chrome-mac-arm64', name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const executablePath = process.env.UNFLAG_CHROMIUM || discoverChromiumExecutable();
if (!executablePath) {
  throw new Error(
    'No Chromium executable found. Set UNFLAG_CHROMIUM to an explicit path, ' +
      'or install a cached build under ~/Library/Caches/ms-playwright.'
  );
}

const consoleErrors = [];
const measurements = {};

const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(String(e)));

const shot = name => page.screenshot({ path: path.join(OUT, name) });
const trigger = () => page.getByRole('button', { name: 'unflag', exact: true });
const filter = () => page.getByLabel('filter features');
const row = name => page.locator('button[aria-expanded]').filter({ hasText: name }).first();

async function openPanel() {
  await trigger().click();
  await filter().waitFor({ state: 'visible' });
}
async function clearAllIfAny() {
  const clearBtn = page.getByLabel('clear all overrides');
  if (await clearBtn.count()) await clearBtn.click();
}
async function setTextareaNative(label, text) {
  const ta = page.getByLabel(label);
  await ta.evaluate((el, value) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.blur();
  }, text);
  await page.waitForTimeout(150);
}

// ---------- NORMAL MODE ----------
await page.goto(BASE);
await page.getByRole('heading', { name: 'Support Desk' }).waitFor();
await openPanel();
await clearAllIfAny();
await page.reload();
await page.getByRole('heading', { name: 'Support Desk' }).waitFor();
await openPanel();
await shot('02-panel-compact-clean.png');

await row('ticketChat').click();
await page.getByRole('button', { name: 'agent-chat', exact: true }).waitFor();
await shot('03-row-expanded.png');

await page.getByRole('button', { name: 'bot-chat', exact: true }).click();
await page.getByText('would be', { exact: false }).first().waitFor();
await shot('04-enum-override.png');

await page.getByLabel('why ticketChat').click();
await page.getByText('OVERRIDDEN', { exact: false }).first().waitFor();
await shot('05-explain-expanded.png');

await row('attachments').click();
await page.getByLabel('override attachments').click();
await page.getByText('unavailable', { exact: false }).first().waitFor();
await shot('06-boolean-override.png');

await row('ticketLimits').click();
await setTextareaNative('override ticketLimits', '{"maxOpen": 99, "upgradeNudge": true}');
await page.getByText('99', { exact: false }).first().waitFor();
await shot('07-json-override.png');

await setTextareaNative('override ticketLimits', 'not json');
await page.getByText(/invalid/i).first().waitFor();
await shot('08-json-invalid.png');

await filter().fill('ticket');
await page.waitForTimeout(150);
await shot('09-filtered.png');
await filter().fill('');

await page.getByLabel('clear all overrides').click();
await page.waitForTimeout(200);
await shot('10-clear-all.png');

// ---------- STRESS MODE ----------
await page.goto(`${BASE}/?stress=300`);
await page.getByText('Stress mode', { exact: false }).waitFor();
// clean leftover overrides from the earlier wedged run
await openPanel();
await clearAllIfAny();
await page.reload();
await page.getByText('Stress mode', { exact: false }).waitFor();

// (a) trigger -> panel interactive
const t0 = Date.now();
await trigger().click();
await filter().waitFor({ state: 'visible' });
await page.getByText('300 features', { exact: false }).first().waitFor();
measurements.triggerToPanelMs = Date.now() - t0;

// (b) textarea count with all rows collapsed
measurements.collapsedTextareaCount = await page.locator('textarea').count();
await shot('11-stress-compact-top.png');

await filter().fill('feature25');
await page.waitForTimeout(200);
await shot('12-stress-filtered.png');

await filter().fill('feature32');
await page.waitForTimeout(200);
await row('feature32').click();
await page.locator('textarea').first().waitFor();
await shot('13-stress-heavy-expanded.png');

// (c) heavy textarea edit responsiveness via native setter
const heavyValue = await page.locator('textarea').first().inputValue();
const edited = heavyValue.replace('"id": 32000', '"id": 32001');
const e0 = Date.now();
await setTextareaNative(/override feature32/.source ? 'override feature32' : 'override feature32', edited === heavyValue ? heavyValue + ' ' : edited);
measurements.heavyEditRoundMs = Date.now() - e0;
// reset that override if it applied
await clearAllIfAny();

await filter().fill('feature201');
await page.waitForTimeout(200);
await row('feature201').click();
// click first chip that is not the current value: read current preview then choose different chip
const chips = page.locator('button', { hasText: /^(alpha|bravo|charlie|delta|echo)$/ });
const current = await row('feature201').textContent();
const target = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].find(v => !current.includes(`"${v}"`));
await page.getByRole('button', { name: target, exact: true }).click();
await page.getByText('overridden', { exact: true }).first().waitFor();
// collapse to show badge in compact list
await row('feature201').click();
await page.waitForTimeout(150);
await shot('14-stress-override-under-load.png');

// (d) filter keystroke responsiveness (small field, typing OK)
const f0 = Date.now();
await filter().fill('');
await filter().pressSequentially('feature1', { delay: 0 });
await page.waitForTimeout(50);
measurements.filterTypeMs = Date.now() - f0 - 50;

// END: clean both modes
await filter().fill('');
await clearAllIfAny();
await page.goto(BASE);
await page.getByRole('heading', { name: 'Support Desk' }).waitFor();
await openPanel();
await clearAllIfAny();

console.log(JSON.stringify({ measurements, consoleErrors }, null, 2));
await browser.close();
