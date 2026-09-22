// Desktop integration check against the production bundle; screenshots stay in /tmp.
const { app, BrowserWindow, ipcMain } = require('electron')
const { mkdir, writeFile } = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { registerLocalAI } = require('../electron/local-ai.cjs')
const { buildSync } = require('esbuild')
const gameURL = pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href
const staleDevelopment = process.argv.includes('--dev-stale')
if (!staleDevelopment) registerLocalAI(ipcMain, url => url === gameURL)
const output = '/private/tmp/forge-world-smoke'
app.setPath('userData', path.join(output, 'profile'))
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.disableHardwareAcceleration()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let win
const js = code => win.webContents.executeJavaScript(code, true)
const click = text => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw Error('Button missing: ' + ${JSON.stringify(text)}); b.click() })()`)
const coords = () => js("document.querySelector('.world-map-panel small')?.textContent")
async function key(value) {
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(value)}, bubbles:true}))`)
  await sleep(35)
  await js(`window.dispatchEvent(new KeyboardEvent('keyup', {key:${JSON.stringify(value)}, bubbles:true}))`)
  await sleep(170)
}
async function capture(name) { await sleep(250); await writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()) }

async function checkDirectionalArt() {
  // Exercise the actual canvas drawing code, without adding test hooks to the game.
  const bundle = buildSync({ stdin: { contents: "export { drawPlayer, drawResident } from './src/world/characterArt'; export { drawAnimal } from './src/world/animalArt'", resolveDir: path.resolve(__dirname, '..') }, bundle: true, format: 'iife', globalName: 'actorArtQA', write: false })
  await js(bundle.outputFiles[0].text)
  const result = await js(`(() => {
    const directions = ['south', 'north', 'east', 'west'];
    const actors = [{ name: 'Player', draw: (c, f, t) => actorArtQA.drawPlayer(c, 0, 0, f, t, true) },
      ...Array.from({length: 8}, (_, i) => ({name: 'Neighbour ' + (i + 1), draw: (c, f, t) => actorArtQA.drawResident(c, 0, 0, f, t, true, i)})),
      ...['sheep', 'chicken', 'rabbit', 'bird'].map(kind => ({name: kind, draw: (c, f, t) => actorArtQA.drawAnimal(c, 0, 0, kind, f, t / 1000, true)}))];
    const sheet = document.createElement('canvas'); sheet.width = 780; sheet.height = 70 + actors.length * 125;
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#263b30'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.fillStyle = '#efe5c0'; ctx.font = '20px sans-serif'; directions.forEach((f, i) => ctx.fillText(f, 180 + i * 150, 35));
    const results = actors.map((actor, row) => {
      ctx.fillStyle = '#efe5c0'; ctx.font = '16px sans-serif'; ctx.fillText(actor.name, 12, 125 + row * 125);
      const sprites = directions.map((f, col) => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
        const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.translate(0, 20); c.scale(72, 72); actor.draw(c, f, 0);
        const idle = canvas.toDataURL(); ctx.drawImage(canvas, 175 + col * 150, 60 + row * 125);
        c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,100,100); c.translate(0,20); c.scale(72,72); actor.draw(c, f, 150);
        return {idle, animated: idle !== canvas.toDataURL()};
      });
      return { name: actor.name, unique: new Set(sprites.map(s => s.idle)).size, animated: sprites.every(s => s.animated) };
    });
    return { image: sheet.toDataURL().split(',')[1], results };
  })()`)
  for (const actor of result.results) { assert.equal(actor.unique, 4, actor.name + ' has four distinct rendered views'); assert.ok(actor.animated, actor.name + ' animates in every direction') }
  await writeFile(path.join(output, 'directional-art.png'), Buffer.from(result.image, 'base64'))
}

async function checkDirectionalRenderer() {
  const bundle = buildSync({ stdin: { contents: "export { createRenderer } from './src/world/renderer'", resolveDir: path.resolve(__dirname, '..') }, loader: { '.png': 'dataurl' }, bundle: true, format: 'iife', globalName: 'worldRendererQA', write: false })
  await js(bundle.outputFiles[0].text)
  const results = await js(`(async () => {
    const canvas = document.createElement('canvas'), mini = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:-10000px;width:320px;height:320px'; document.body.append(canvas);
    const renderer = await worldRendererQA.createRenderer(canvas, mini), results = [];
    for (const reducedMotion of [false, true]) {
      const views = [];
      for (const playerFacing of ['south', 'north', 'east', 'west']) {
        const state = { seed: 1, player: {x:0,y:0}, playerFacing, minutes:480, now:1000, zoom:1, route:[], labels:false, selected:null, discoveries:{}, reducedMotion };
        renderer.render(state); const first = canvas.toDataURL();
        renderer.render({...state, now:2000});
        views.push({first, stable: first === canvas.toDataURL()});
      }
      results.push({ reducedMotion, unique: new Set(views.map(v => v.first)).size, stable: views.every(v => v.stable) });
    }
    canvas.remove(); return results;
  })()`)
  for (const r of results) {
    assert.equal(r.unique, 4, 'world renderer honors all four headings with reduced motion ' + r.reducedMotion)
    assert.ok(r.stable, 'player keeps the same heading while stationary')
  }
}

async function checkWorldLayout() {
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 640], [600, 850], [390, 740]]) {
    win.setContentSize(width, height); await sleep(250)
    const layout = await js(`(() => {
      const main = document.querySelector('main'), map = document.querySelector('.world-viewport').getBoundingClientRect(), pad = document.querySelector('.world-dpad').getBoundingClientRect();
      return { pageFits: document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1,
        mainFits: main.scrollHeight <= main.clientHeight + 1 && main.scrollWidth <= main.clientWidth + 1,
        mapHeight: map.height, mapFits: map.top >= 0 && map.bottom <= innerHeight,
        controlsFit: pad.top >= map.top && pad.bottom <= map.bottom };
    })()`)
    assert.ok(layout.pageFits && layout.mainFits && layout.mapFits, `world fits without page scrolling at ${width}×${height}: ${JSON.stringify(layout)}`)
    assert.ok(layout.mapHeight > 200 && layout.controlsFit, 'map and movement controls remain usable')
    await click('Around you'); await sleep(100)
    assert.ok(await js("document.querySelector('.world-area-info')?.textContent.includes('LIFE AROUND YOU') && document.querySelector('.world-area-info .world-town-note') !== null"), 'local activity and region description are in the area panel')
    assert.ok(await js('document.querySelector("main").scrollHeight <= document.querySelector("main").clientHeight + 1'), 'area panel does not add page scrolling')
    if (width === 390) await capture('world-area-narrow')
    await js("document.querySelector('[aria-label=\"Close area information\"]').click()")
    if (width === 1280) await capture('world-no-scroll')
  }
  win.setContentSize(1280, 800); await sleep(250)
}

async function checkSettingsSpacing() {
  const gaps = await js(`(() => {
    const buttons = [...document.querySelectorAll('.mira-settings-actions button')].map(b => b.getBoundingClientRect());
    return buttons.slice(1).map((b, i) => Math.max(b.left - buttons[i].right, b.top - buttons[i].bottom));
  })()`)
  assert.ok(gaps.length && gaps.every(g => g >= 7), 'Ollama settings buttons have a visible gap')
}

async function checkLocalConversation() {
    if (!staleDevelopment) {
      ipcMain.removeHandler('forge:models')
      ipcMain.handle('forge:models', () => ({ ok: false, models: [], error: 'Ollama is unavailable (test).' }))
    }
    await click('Ask Mira')
    await js("document.querySelector('[aria-label=\"Mira settings\"]').click()")
    if (!staleDevelopment) {
      await sleep(200); await checkSettingsSpacing(); await capture('mira-settings-offline')
      ipcMain.removeHandler('forge:models'); ipcMain.removeHandler('forge:chat')
      registerLocalAI(ipcMain, url => url === gameURL)
      await click('Check Ollama')
    }
    for (let i = 0; i < 60; i++) { if (await js("!!document.querySelector('.mira-settings select')")) break; await sleep(100) }
    assert.ok(await js("document.querySelector('.mira-settings select')?.options.length > 0"), 'Ollama models discovered')
    await checkSettingsSpacing(); await capture('mira-settings-connected')
    await click('Use local model')
    await js("document.querySelector('[aria-label=\"Mira settings\"]').click()")
    await js(`(() => { const input = document.querySelector('[aria-label="Message Mira"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'What should I focus on today?'); input.dispatchEvent(new Event('input', {bubbles:true})); })()`)
    await sleep(100); await click('Ask')
    for (let i = 0; i < 550; i++) { if (await js("document.querySelectorAll('.mira-bubble').length >= 3 && ![...document.querySelectorAll('.mira-bubble')].some(e => e.textContent === 'Thinking about that…')")) break; await sleep(100) }
    const response = await js("({text:[...document.querySelectorAll('.mira-bubble')].at(-1)?.textContent, fallback:!!document.querySelector('.mira-notice')})")
    assert.ok(response.text?.length > 15 && !response.fallback, 'real local model replied without fallback')
    console.log('Local Ollama reply verified: ' + response.text)
    await sleep(300); await capture('mira-local-chat')
}

app.whenReady().then(async () => {
  await mkdir(output, { recursive: true })
  win = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { partition: 'forge-smoke', preload: path.resolve(__dirname, '../electron/preload.js'), backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
  const errors = []
  win.webContents.on('console-message', (_event, level, message) => { if (level === 3 && !message.includes('ERR_')) errors.push(message) })
  if (staleDevelopment) await win.loadURL('http://localhost:5173')
  else await win.loadFile(path.resolve(__dirname, '../dist/index.html'))
  await checkDirectionalArt()
  await checkDirectionalRenderer()
  if (process.argv.includes('--directions-only')) { console.log('Directional art and renderer checks passed, including reduced motion.'); win.destroy(); app.quit(); return }
  await js('Math.random = () => 0.12345; undefined')
  await click('Play'); await sleep(100)
  await js(`(() => { const input = document.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'World Tester'); input.dispatchEvent(new Event('input', {bubbles: true})); })()`)
  await sleep(100); await click('Enter the world'); await sleep(80)
  for (let i = 0; i < 6; i++) { await click('Continue'); await sleep(50) }
  await click('Walk into town')
  for (let i = 0; i < 100; i++) { if (await js("!!document.querySelector('.world-canvas') && !document.querySelector('.world-loading')")) break; await sleep(100) }
  assert.ok(await js("!document.querySelector('.world-loading')"), 'renderer loaded')
  await sleep(1000); assert.equal(await coords(), '0, 0')
  await checkWorldLayout()
  if (process.argv.includes('--connection-only')) { await checkLocalConversation(); console.log('Development Ollama recovery and layout checks passed.'); win.destroy(); app.quit(); return }
  await capture('town-desktop')
  await click('Hide place names'); assert.ok(await js("document.querySelector('button[aria-pressed=false]')?.textContent.includes('Show place names')"))
  await click('Show place names')
  await click('Around you'); await sleep(100)
  await js("document.querySelector('.world-activity button').click()")
  await sleep(80); await js("document.querySelector('.world-interaction .world-enter').click()")
  await sleep(150); await click('What are you doing?'); await sleep(150)
  assert.ok(await js("document.querySelectorAll('.resident-messages .assistant').length >= 2"), 'resident replies to conversation')
  await capture('neighbour-conversation')
  await js("document.querySelector('[aria-label=\"Close conversation\"]').click()")
  await js("document.querySelector('[aria-label=\"Close resident details\"]')?.click()")
  await click('Journal · 0'); assert.ok(await js("document.querySelector('.journal-content .contact-glyph') !== null"), 'journal remembers neighbour')
  await js("document.querySelector('[aria-label=\"Close journal\"]').click()")
  // Approach a working neighbour with keys alone: no resident is selected.
  for (let i = 0; i < 5; i++) await key('ArrowLeft')
  await key('ArrowUp'); await key('ArrowUp'); await sleep(200)
  assert.ok(await js("document.querySelector('[data-interaction=resident]')?.textContent.includes('PRESS E TO TALK')"), 'nearby resident has an automatic E prompt')
  const neighbourName = await js("document.querySelector('[data-interaction=resident] strong')?.firstChild.textContent.trim()")
  await key('e')
  assert.equal(await js("document.querySelector('.resident-chat')?.getAttribute('aria-label')"), 'Talk to ' + neighbourName, 'E opens nearby conversation without clicking')
  const beforeChatTyping = await coords()
  await js(`(() => { const input = document.querySelector('[aria-label="Message neighbour"]'); input.dispatchEvent(new KeyboardEvent('keydown', {key:'w', bubbles:true})); input.dispatchEvent(new KeyboardEvent('keyup', {key:'w', bubbles:true})); })()`)
  assert.equal(await coords(), beforeChatTyping, 'typing in resident chat does not move player')
  await capture('keyboard-conversation')
  await key('Escape')
  assert.ok(await js("!document.querySelector('.resident-chat')"), 'Escape closes the conversation')
  await js("document.querySelector('[aria-label=\"Return to town square\"]').click()")
  await sleep(250)
  await key('ArrowRight'); await key('ArrowRight'); await key('ArrowUp'); assert.equal(await coords(), '2, -1')
  await key('ArrowUp'); assert.equal(await coords(), '2, -1', 'well collision')
  await js("document.querySelector('[aria-label=\"Return to town square\"]').click()")
  await sleep(600)
  const point = await js("(() => {const r = document.querySelector('.world-canvas').getBoundingClientRect(); return {x:r.left+r.width/2-5*32, y:r.top+r.height/2-5*32}})()")
  await js(`document.querySelector('.world-canvas').dispatchEvent(new PointerEvent('pointerup', {clientX:${point.x}, clientY:${point.y}, button:0, bubbles:true}))`)
  await sleep(2400)
  assert.equal(await coords(), '-5, -3', 'click-to-walk reaches door')
  assert.ok(await js("document.querySelector('.world-interaction')?.textContent.includes('Dev Desk')"))
  await key('e'); assert.ok(await js("!document.querySelector('.world-canvas')"), 'building opens work screen')
  await click('World'); await sleep(800)
  assert.equal(await coords(), '-5, -3', 'returning preserves player position')
  await js("document.querySelector('[aria-label=\"Return to town square\"]').click()")
  await sleep(700); await click('Pause'); await sleep(600)
  const paused = await js("document.querySelector('.world-canvas').toDataURL()")
  await sleep(500)
  assert.equal(await js("document.querySelector('.world-canvas').toDataURL()"), paused, 'pause freezes world')
  await click('Resume')
  // Cross a chunk boundary and river on the main road.
  await js("window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true}))")
  await sleep(7200)
  await js("window.dispatchEvent(new KeyboardEvent('keyup', {key:'ArrowRight', bubbles:true}))")
  await sleep(500)
  assert.ok(Number((await coords()).split(',')[0]) > 32, 'bridge crossing reaches the next region')
  await capture('river-road')
  await js("document.querySelector('[aria-label=\"Return to town square\"]').click()")
  for (let i = 0; i < 25; i++) await key('ArrowDown')
  assert.equal(await coords(), '0, 25')
  await sleep(350)
  const harvest = await js("(() => {const r = document.querySelector('.world-canvas').getBoundingClientRect(); return {x:r.left+r.width/2+12*32, y:r.top+r.height/2}})()")
  await js(`document.querySelector('.world-canvas').dispatchEvent(new PointerEvent('pointerup', {clientX:${harvest.x}, clientY:${harvest.y}, button:0, bubbles:true}))`)
  for (let i = 0; i < 70; i++) { if (await coords() === '12, 25') break; await sleep(100) }
  assert.equal(await coords(), '12, 25', 'walk to harvest site')
  await capture('harvest-and-animals')
  await js("document.querySelector('.world-interaction .world-enter').click()")
  await sleep(100); await click('Journal · 1')
  assert.ok(await js("document.querySelector('.journal-content')?.textContent.includes('Orchard Apples')"), 'collected item appears in journal')
  await capture('collection-journal')
  await js("document.querySelector('[aria-label=\"Close journal\"]').click()")
  await js("document.querySelector('[aria-label=\"Return to town square\"]').click()")
  win.setSize(600, 850); await sleep(900)
  assert.equal(await js('document.documentElement.scrollWidth <= window.innerWidth'), true, 'narrow layout has no horizontal overflow')
  assert.equal(await js(`(() => { const button = document.querySelector('[aria-label="Walk south"]'); const r = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)); })()`), true, 'directional pad is not obscured')
  await click('Ask Mira'); await sleep(150)
  assert.ok(await js("!!document.querySelector('.mira-pet.mira-idle')"), 'animated Mira companion is present')
  await js(`(() => { const input = document.querySelector('input'); input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', {key:'w', bubbles:true})); input.dispatchEvent(new KeyboardEvent('keyup', {key:'w', bubbles:true})); })()`)
  await sleep(250); assert.equal(await coords(), '0, 0', 'typing in assistant does not move player')
  await click('×'); await sleep(200)
  await capture('town-narrow')
  if (process.argv.includes('--local-ai')) await checkLocalConversation()
  assert.deepEqual(errors, [], 'no renderer errors')
  console.log('Desktop smoke checks passed: four-direction art, reduced motion, nearby E conversations, render, collision, click navigation, interaction, revisit, pause, river crossing, narrow layout. Screenshots: ' + output)
  win.destroy(); app.quit()
}).catch(error => { console.error(error); if (win) win.destroy(); app.exit(1) })
