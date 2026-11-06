// Tiny web server: serves ./public and a JSON API over calc.db (SQLite).
// Run: node server.mjs   ->   http://localhost:3000
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = process.env.PORT || 3000;

// One database per game mode (see build_db.mjs). Modes without a database are listed as unavailable.
const MODES = [
  { id: 'vanilla', name: 'Factorio Vanilla' },
  { id: 'space-age', name: 'Factorio Space Age' },
];

// The datasets are small enough to load once and serve as a single response.
function loadAll(db) {
  const items = db
    .prepare(
      `SELECT i.id, i.name AS slug, i.displayName AS name, t.name AS type,
              i.category, i.row, i.iconPath AS icon, i.iconText, i.effects
       FROM items i JOIN types t ON t.id = i.typeID
       ORDER BY i.category, i.row, i.id`
    )
    .all();
  for (const it of items) it.effects = it.effects ? JSON.parse(it.effects) : null;

  const producers = db
    .prepare(
      `SELECT p.id, i.name AS slug, i.displayName AS name,
              p.producingSpeedMultiplier AS speed, i.iconPath AS icon
       FROM producers p JOIN items i ON i.id = p.itemID`
    )
    .all();

  const recipes = db
    .prepare('SELECT id, name AS slug, displayName AS name, craftingTime AS time, iconPath AS icon FROM recipes')
    .all();
  const byId = new Map(recipes.map((r) => [r.id, { ...r, in: [], out: [], producers: [] }]));

  for (const r of db.prepare('SELECT recipeID, itemID, quantity FROM recipeInput').all())
    byId.get(r.recipeID).in.push({ item: r.itemID, qty: r.quantity });
  for (const r of db.prepare('SELECT recipeID, itemID, quantity FROM recipeOutput').all())
    byId.get(r.recipeID).out.push({ item: r.itemID, qty: r.quantity });
  for (const r of db.prepare('SELECT recipeID, producerID FROM recipeProducers').all())
    byId.get(r.recipeID).producers.push(r.producerID);

  // technology tree: { tech item id -> [prerequisite item ids] } and { tech item id -> [recipe ids] }
  const prerequisites = {};
  for (const r of db.prepare('SELECT technologyID, prerequisiteID FROM techPrerequisites').all())
    (prerequisites[r.technologyID] ||= []).push(r.prerequisiteID);
  const unlocks = {};
  for (const r of db.prepare('SELECT technologyID, recipeID FROM techUnlocks').all())
    (unlocks[r.technologyID] ||= []).push(r.recipeID);

  // Space Age keeps source metadata and the FactorioLab icon atlas index alongside the shared tables.
  const hasIconAtlas = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='iconAtlasIndex'").get();
  const iconAtlas = hasIconAtlas
    ? Object.fromEntries(db.prepare('SELECT iconID, x, y FROM iconAtlasIndex').all().map(({ iconID, x, y }) => [iconID, { x, y }]))
    : null;

  return {
    items, producers, recipes: [...byId.values()], prerequisites, unlocks,
    iconAtlas,
    iconAtlasUrl: iconAtlas ? '/Graphics/Icons/space-age-icons.webp' : null,
    iconTileSize: 64,
  };
}

const DATA = {}; // mode id -> JSON string
for (const m of MODES) {
  const file = join(ROOT, `calc-${m.id}.db`);
  m.available = existsSync(file);
  if (!m.available) {
    console.log(`Mode "${m.id}" is not available: ${file} not found (run node build_db.mjs)`);
    continue;
  }
  const db = new DatabaseSync(file, { readOnly: true });
  DATA[m.id] = JSON.stringify(loadAll(db));
  db.close();
}
const MODES_JSON = JSON.stringify(MODES);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/modes') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(MODES_JSON);
    }
    if (url.pathname === '/api/data') {
      const mode = url.searchParams.get('mode') || 'vanilla';
      if (!DATA[mode]) {
        res.writeHead(404, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: `Mode "${mode}" is not available` }));
      }
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(DATA[mode]);
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/Website.html';
    const file = normalize(join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache', // always re-check, so edits to CSS/JS show up right away
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(PORT, () => console.log(`Calc running on http://localhost:${PORT}`));

