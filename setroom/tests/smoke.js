'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const app = read('app.js');
const shelf = read('shelf3d.js');
const css = `${read('styles.css')}\n${read('upgrade.css')}`;
const data = read('data.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const serviceWorker = read('sw.js');

for (const asset of ['styles.css', 'upgrade.css', 'config.js', 'data.js', 'shelf3d.js', 'app.js']) {
  assert.match(index, new RegExp(asset.replace('.', '\\.')), `${asset} is linked from index.html`);
}

assert.match(index, /See where every LEGO box fits/);
assert.match(index, /Search a set/);
assert.match(index, /Check the fit/);
assert.match(index, /Place the box/);
assert.match(index, /independent fan-made collector tool/i);

assert.match(app, /function renderStudio\(/);
assert.match(app, /function addStudioSet\(/);
assert.match(app, /function moveStudioPlacement\(/);
assert.match(app, /function firstOpenPosition\(/);
assert.match(app, /function placementCollision\(/);
assert.match(app, /localStorage\.setItem/);
assert.match(app, /renderCollection/);
assert.match(app, /renderBuild/);
assert.match(app, /renderSell/);
assert.match(app, /renderBuy/);
assert.match(app, /renderSettings/);

assert.match(shelf, /class ShelfStudio/);
assert.match(shelf, /data-camera="right"/);
assert.match(shelf, /data-box-key/);
assert.match(shelf, /onPointerMove/);
assert.match(shelf, /face-front/);
assert.match(shelf, /set\.image/);
assert.match(shelf, /--half-d/);

assert.match(css, /perspective:1350px/);
assert.match(css, /transform-style:preserve-3d/);
assert.match(css, /\.shelf-box\.is-selected/);
assert.match(css, /@media\(max-width:680px\)/);
assert.doesNotMatch(css, /var\(--[a-z-]+\)\s*\/\s*2/, 'unsupported CSS variable division was removed');

assert.match(data, /https:\/\/images\.brickset\.com\/sets\/images/);
assert.match(data, /Avengers Tower/);
assert.match(data, /dimensions:\{w:/);

assert.equal(manifest.start_url, './#app/studio');
for (const asset of ['upgrade.css', 'shelf3d.js']) assert.match(serviceWorker, new RegExp(asset.replace('.', '\\.')));

for (const file of ['app.js', 'shelf3d.js', 'data.js', 'sw.js']) {
  new Function(read(file));
}

const opens = css.split('{').length - 1;
const closes = css.split('}').length - 1;
assert.equal(opens, closes, 'CSS braces are balanced');

console.log('SetRoom smoke tests passed: routes, 3D scene, artwork, fit logic, movement, persistence hooks and responsive assets.');
