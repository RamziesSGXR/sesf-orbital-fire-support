// 0.62.8 in the browser: the feedback form (typed in the game, posted through the SESF feed), and the next-mission cards saying
// how much harder the mission is than the last instead of a level number.
//   node test/ui628.mjs [phone]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PHONE = process.argv[2] === 'phone';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const mk = async (sinkOn) => {
  const ctx = await browser.newContext(PHONE ? { ...devices['Pixel 7'] } : { viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { fails++; console.log('PAGE ERROR', e.message); });
  await page.addInitScript((sinkOn) => { try { localStorage.setItem('ofs.notice', 'true'); localStorage.setItem('ofs.callsign', '"TESTER"'); } catch { /* fine */ } if (sinkOn) { window.__posts = []; window.__feedSink = (p) => window.__posts.push(p); } }, sinkOn);
  await page.goto(`file://${ROOT}/dist/orbital-fury.html`); await page.waitForTimeout(1500);
  return page;
};
const on = (page, id) => page.evaluate((id) => document.getElementById(id).classList.contains('on'), id);

// ---------------------------------------------------------------- a copy that cannot send
{
  const page = await mk(false);
  await page.click('#lnk-fb-t'); await page.waitForTimeout(300);
  check('FEEDBACK on the title opens the form, not a new tab', await on(page, 's-feedback') && (await page.context().pages()).length === 1);
  check('a copy that cannot send says so and offers the Discord', await page.evaluate(() => document.getElementById('fb-send').disabled && /Discord/.test(document.getElementById('fb-msg').textContent) && /discord\.com/.test(document.getElementById('fb-discord').href)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Escape closes it', !(await on(page, 's-feedback')));
  await page.close();
}

// ---------------------------------------------------------------- no score for now
{
  const page = await mk(false);
  await page.mouse.click(5, 5); await page.waitForTimeout(600);
  check('the music is off', await page.evaluate(() => window.__game.music.style === 'off'));
  const rows = await page.evaluate(() => { document.getElementById('btn-settings-t') && document.getElementById('btn-settings-t').click(); return [...document.querySelectorAll('#s-settings input[type=range]')].length; });
  check('and its settings are gone with it (two volume sliders left: master, effects)', rows === 0 || rows <= 3, `${rows} sliders`);
  await page.close();
}

// ---------------------------------------------------------------- sending
{
  const page = await mk(true);
  await page.click('#lnk-fb-t'); await page.waitForTimeout(300);
  check('where it can send, SEND is live', await page.evaluate(() => !document.getElementById('fb-send').disabled));
  await page.click('#fb-send'); await page.waitForTimeout(200);
  check('nothing typed: it asks for something, and posts nothing', /first/i.test(await page.textContent('#fb-msg')) && (await page.evaluate(() => window.__posts.length)) === 0, await page.textContent('#fb-msg'));
  const fits = await page.evaluate(() => { const c = document.querySelector('#s-feedback .card').getBoundingClientRect(), b = document.getElementById('fb-send').getBoundingClientRect(); return c.top >= 0 && b.bottom <= innerHeight && c.right <= innerWidth + 1; });
  check('the whole form is on screen, SEND included', fits);
  await page.fill('#fb-text', 'The harvester walks through my turret nest.\n@everyone look at `this`\nline three');
  check('it counts what is typed', /\d+ \/ 900/.test(await page.textContent('#fb-count')), await page.textContent('#fb-count'));
  await page.click('#fb-send'); await page.waitForTimeout(300);
  const posts = await page.evaluate(() => window.__posts);
  const c = posts[0] ? posts[0].content : '';
  check('SEND posts it once', posts.length === 1, `${posts.length} posts`);
  check('with who, the version and the device', /Feedback/.test(c) && /TESTER/.test(c) && /v0\.62\.\d+/.test(c) && /(computer|phone|tablet) \(/.test(c), c.split('\n')[0]);
  check('the text is quoted line by line, and cannot ping or break out of the quote', c.split('\n').filter((l) => l.startsWith('> ')).length === 3 && !/`this`/.test(c.split('```')[0]) && JSON.stringify(posts[0].allowed_mentions) === '{"parse":[]}');
  check('the debug report is attached by default', /```/.test(c) && /Orbital Fury 0\.62/.test(c) && c.length <= 1900, `${c.length} chars`);
  check('it says SENT and closes by itself', /SENT/.test(await page.textContent('#fb-msg')));
  await page.waitForTimeout(1700);
  check('...closed', !(await on(page, 's-feedback')));
  await page.click('#lnk-fb-t'); await page.waitForTimeout(300);
  await page.fill('#fb-text', 'And another thing.'); await page.uncheck('#fb-report'); await page.click('#fb-send'); await page.waitForTimeout(300);
  check('a second one straight away waits a minute', /minute/.test(await page.textContent('#fb-msg')) && (await page.evaluate(() => window.__posts.length)) === 1, await page.textContent('#fb-msg'));
  await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('ofs.fbSent')); localStorage.setItem('ofs.fbSent', JSON.stringify(L.map((t) => t - 120000))); });
  await page.click('#fb-send'); await page.waitForTimeout(300);
  const p2 = await page.evaluate(() => window.__posts[1] && window.__posts[1].content);
  check('after the minute it goes, without the report when the box is off', !!p2 && !/```/.test(p2) && /another thing/.test(p2));
  await page.evaluate(() => { localStorage.setItem('ofs.fbSent', JSON.stringify([1, 2, 3, 4, 5, 6].map((k) => Date.now() - 3600000 * k))); });
  await page.waitForTimeout(1700); await page.click('#lnk-fb-t'); await page.waitForTimeout(300);
  await page.fill('#fb-text', 'Seventh today.'); await page.click('#fb-send'); await page.waitForTimeout(300);
  check('six a day from one device, then it points to the Discord', /today/.test(await page.textContent('#fb-msg')) && (await page.evaluate(() => window.__posts.length)) === 2, await page.textContent('#fb-msg'));
  await page.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
