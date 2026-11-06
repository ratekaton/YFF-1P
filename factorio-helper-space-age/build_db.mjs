// Builds SQLite databases for Vanilla and Space Age from FactorioLab datasets.
// Run: node build_db.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, rmSync, existsSync } from 'node:fs';
const MODES = [
  { id: 'vanilla', file: './data/factorio-2.0.json' },
  { id: 'space-age', file: './data/factorio-2.0-space-age.json' },
];
const path = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(path(p), 'utf8');
function build(mode) {
  const data = JSON.parse(read(mode.file));
  const out = `./calc-${mode.id}.db`;
  rmSync(path(out), { force: true });
  const db = new DatabaseSync(path(out).pathname);
  db.exec(read('./sql/Create tables.sql'));
  db.exec(read('./sql/Insert types.sql'));
  const preserveSource = mode.id === 'space-age';
  if (preserveSource) db.exec(read('./sql/Extended tables.sql'));
  const iconIds = new Set(data.icons.map((i) => i.id));
  const icon = (slug) => `Graphics/Icons/${slug}.png`;
  const itemId = new Map(), producerId = new Map(), recipeId = new Map();
  db.exec('BEGIN');
  const insItem = db.prepare('INSERT INTO items (name,displayName,typeID,category,row,iconPath,iconText,effects) VALUES (?,?,?,?,?,?,?,?)');
  for (const it of data.items) {
    const typeID = (it.types || []).includes('fluid') ? 2 : 1;
    const { prerequisites, recipeUnlock, ...effects } = it.technology || {};
    const r = insItem.run(it.id,it.name,typeID,it.category||'',it.row??0,icon(it.icon||it.id),it.iconText??null,Object.keys(effects).length?JSON.stringify(effects):null);
    itemId.set(it.id,Number(r.lastInsertRowid));
  }
  const insProd = db.prepare('INSERT INTO producers (itemID,producingSpeedMultiplier) VALUES (?,?)');
  for (const it of data.items) if (it.machine && typeof it.machine.speed === 'number') producerId.set(it.id,Number(insProd.run(itemId.get(it.id),it.machine.speed).lastInsertRowid));
  const insRec=db.prepare('INSERT INTO recipes (name,displayName,craftingTime,iconPath) VALUES (?,?,?,?)');
  const insRP=db.prepare('INSERT OR IGNORE INTO recipeProducers (recipeID,producerID) VALUES (?,?)');
  const insIn=db.prepare('INSERT INTO recipeInput (recipeID,itemID,quantity) VALUES (?,?,?)');
  const insOut=db.prepare('INSERT INTO recipeOutput (recipeID,itemID,quantity) VALUES (?,?,?)');
  const recipeIcon=(r)=>{const own=r.icon||r.id;if(iconIds.has(own))return own;const first=data.items.find(i=>i.id===Object.keys(r.out||{})[0]);return first?first.icon||first.id:own;};
  let skipped=0;
  for(const r of data.recipes){
    const ins=Object.entries(r.in||{}),outs=Object.entries(r.out||{});
    if(!outs.length||[...ins,...outs].some(([id])=>!itemId.has(id))){skipped++;continue;}
    const rid=Number(insRec.run(r.id,r.name,r.time??1,icon(recipeIcon(r))).lastInsertRowid);recipeId.set(r.id,rid);
    for(const p of r.producers||[])if(producerId.has(p))insRP.run(rid,producerId.get(p));
    for(const [id,q] of ins)insIn.run(rid,itemId.get(id),q);
    for(const [id,q] of outs)insOut.run(rid,itemId.get(id),q);
  }
  const insPre=db.prepare('INSERT OR IGNORE INTO techPrerequisites (technologyID,prerequisiteID) VALUES (?,?)');
  const insUn=db.prepare('INSERT OR IGNORE INTO techUnlocks (technologyID,recipeID) VALUES (?,?)');
  for(const it of data.items)if(it.technology){for(const p of it.technology.prerequisites||[])if(itemId.has(p))insPre.run(itemId.get(it.id),itemId.get(p));for(const u of it.technology.recipeUnlock||[])if(recipeId.has(u))insUn.run(itemId.get(it.id),recipeId.get(u));}
  if(preserveSource){
    const si=db.prepare('INSERT INTO sourceItemData (itemID,sourceJSON) VALUES (?,?)');
    for(const it of data.items)si.run(itemId.get(it.id),JSON.stringify(it));
    const sr=db.prepare('INSERT INTO sourceRecipeData (recipeID,sourceJSON) VALUES (?,?)');
    for(const r of data.recipes)if(recipeId.has(r.id))sr.run(recipeId.get(r.id),JSON.stringify(r));
    const sm=db.prepare('INSERT INTO datasetMetadata (name,jsonValue) VALUES (?,?)');
    for(const key of ['version','categories','flags','qualities','defaults'])if(data[key]!==undefined)sm.run(key,JSON.stringify(data[key]));
    const sl=db.prepare('INSERT INTO locations (id,displayName,iconID,sourceJSON) VALUES (?,?,?,?)');
    for(const loc of data.locations||[])sl.run(loc.id,loc.name,loc.icon||null,JSON.stringify(loc));
    const sx=db.prepare('INSERT INTO iconAtlasIndex (iconID,x,y) VALUES (?,?,?)');
    for(const i of data.icons||[])sx.run(i.id,i.x,i.y);
  }
  db.exec('COMMIT');
  const n=(t)=>db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log(`[${mode.id}] items=${n('items')} producers=${n('producers')} recipes=${n('recipes')} technologies=${db.prepare("SELECT COUNT(*) c FROM items WHERE category='technology'").get().c} unlocks=${n('techUnlocks')} skipped=${skipped}`);
  db.close();
}
for(const mode of MODES){if(!existsSync(path(mode.file))){console.log(`[${mode.id}] skipped: ${mode.file} not found`);continue;}build(mode);}
