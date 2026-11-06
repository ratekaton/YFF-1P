// Calculator logic. Loads data from /api/data, builds the recipe tree for the
// selected item and shows: tree, total machines, total raw materials.
// Not modelled yet: modules, beacons, productivity, by-products, fuel/power.

const state = {
  mode: "vanilla", // "vanilla" | "space-age" (which data set is loaded)
  view: "calc", // "calc" | "tech"
  item: null, // item slug
  rate: 60,
  unit: "min", // "min" | "sec"
  assembler: "assembling-machine-2",
  furnace: "electric-furnace",
  lab: "lab",
  overrides: {}, // itemId -> recipeId chosen by the user
  machineOverrides: {}, // recipeId -> producerId chosen locally
};

window.state = state; // the side menu (iframe) and tech.js read it
window.currentData = null; // the data of the current mode, also used by the side menu
let modes = []; // [{ id, name, available }] from /api/modes

let items = new Map(); // id -> item
let itemsBySlug = new Map();
let recipes = new Map(); // id -> recipe
let producers = new Map(); // id -> machine
let byOutput = new Map(); // itemId -> [recipe]

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// ---------- data ----------
async function init() {
  loadHash();
  modes = await (await fetch("/api/modes")).json();
  if (!modes.some((m) => m.id === state.mode && m.available)) state.mode = "vanilla";
  await loadMode(state.mode);
  showView(state.view);
  syncControls();
  render();
}

// Loads items, recipes and technologies of one mode (vanilla / space-age).
async function loadMode(mode) {
  const res = await fetch(`/api/data?mode=${encodeURIComponent(mode)}`);
  if (!res.ok) throw new Error(`Could not load data for mode "${mode}"`);
  const data = await res.json();

  items = new Map();
  itemsBySlug = new Map();
  recipes = new Map();
  producers = new Map();
  byOutput = new Map();
  data.items.forEach((i) => {
    items.set(i.id, i);
    itemsBySlug.set(i.slug, i);
  });
  data.producers.forEach((p) => producers.set(p.id, p));
  data.recipes.forEach((r) => {
    recipes.set(r.id, r);
    r.out.forEach((o) => {
      if (!byOutput.has(o.item)) byOutput.set(o.item, []);
      byOutput.get(o.item).push(r);
    });
  });

  if (state.mode !== mode) state.machineOverrides = {};
  state.mode = mode;
  state.overrides = {};
  if (state.item && !itemsBySlug.has(state.item)) state.item = null; // item does not exist in this mode
  window.currentData = data;
  localStorage.setItem("factorioCalcMode", mode);

  syncModeToggle();
  const frame = $("leftiframe").contentWindow;
  if (frame && frame.buildMenu) frame.buildMenu(data); // otherwise the iframe builds itself when it loads
  window.dispatchEvent(new CustomEvent("datachange", { detail: data }));
}

function syncModeToggle() {
  $("modeToggle").checked = state.mode === "space-age";
  document.querySelectorAll(".modeLabel").forEach((l) => {
    l.classList.toggle("on", l.dataset.mode === state.mode);
    const m = modes.find((x) => x.id === l.dataset.mode);
    l.classList.toggle("off", !!m && !m.available);
  });
}

let noticeTimer = null;
function showNotice(text) {
  const n = $("notice");
  n.textContent = text;
  n.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (n.hidden = true), 9000);
}

// ---------- views (Calculator / Technologies) ----------
function showView(view) {
  state.view = view;
  $("calcView").hidden = view !== "calc";
  $("techView").hidden = view !== "tech";
  document.body.classList.toggle("techMode", view === "tech"); // hides the item menu
  document.querySelectorAll(".viewTab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  if (view === "tech" && window.renderTech) window.renderTech();
  saveHash();
}
window.showView = showView;

// ---------- choosing recipe / machine ----------
function isRecycling(r) {
  return r.slug.endsWith("-recycling") || r.producers.some((id) => producers.get(id)?.slug === "recycler");
}

function recipeScore(r, itemId) {
  let s = 0;
  if (r.slug === items.get(itemId).slug) s -= 100; // recipe named like the item
  if (isRecycling(r)) s += 1000;
  if (r.out.length > 1) s += 10; // prefer recipes without by-products
  s += r.in.length * 0.01;
  return s;
}

function sortedCandidates(itemId) {
  return [...(byOutput.get(itemId) || [])].sort((a, b) => recipeScore(a, itemId) - recipeScore(b, itemId));
}

function pickRecipe(itemId) {
  const chosen = recipes.get(state.overrides[itemId]);
  return chosen || sortedCandidates(itemId)[0] || null;
}

function pickMachine(r) {
  const list = r.producers.map((id) => producers.get(id));
  if (!list.length) return null;
  const local = list.find((p) => p.id === Number(state.machineOverrides[r.id]));
  if (local) return local;
  const preferred = list.some((p) => ["lab", "biolab"].includes(p.slug))
    ? state.lab
    : null;
  for (const slug of [preferred, state.assembler, state.furnace, "electric-mining-drill"]) {
    const m = list.find((p) => p.slug === slug);
    if (m) return m;
  }
  return list[list.length - 1]; // otherwise the last (usually best) machine
}
window.pickRecipeMachine = pickMachine;

function recipeMachines(r) {
  return r.producers.map((id) => producers.get(id)).filter(Boolean);
}

function machineSelect(r, className = "recipeSelect machineSelect") {
  const choices = recipeMachines(r);
  if (!choices.length) return el("span", "nodeMachine muted", "—");
  if (choices.length === 1) return el("span", "nodeMachine", choices[0].name);
  const select = el("select", className);
  select.title = `Machine for ${r.name}`;
  select.setAttribute("aria-label", `Machine for ${r.name}`);
  const selected = pickMachine(r);
  const localId = Number(state.machineOverrides[r.id]) || null;
  const globalOption = el("option", "", `Global default · ${selected?.name || "best available"}`);
  globalOption.value = "";
  globalOption.selected = !localId;
  select.append(globalOption);
  for (const machine of choices) {
    const option = el("option", "", machine.name);
    option.value = machine.id;
    option.selected = localId ? machine.id === localId : false;
    select.append(option);
  }
  select.addEventListener("change", () => {
    if (select.value) state.machineOverrides[r.id] = Number(select.value);
    else delete state.machineOverrides[r.id];
    render();
  });
  select.addEventListener("click", (e) => e.stopPropagation());
  return select;
}

function localMachineControl(r) {
  const control = el("span", "localMachineControl");
  control.append(el("span", "localMachineLabel", "Local machine"));
  control.append(machineSelect(r, "recipeSelect machineSelect"));
  return control;
}

// ---------- calculation ----------
// rate is items per second.
function build(itemId, rate, stack) {
  const recipe = stack.includes(itemId) ? null : pickRecipe(itemId); // loop -> treat as raw
  const node = { item: itemId, rate, recipe, children: [] };
  if (!recipe) return node;

  const outQty = recipe.out.find((o) => o.item === itemId).qty;
  const crafts = rate / outQty; // crafts per second
  node.craftsPerSec = crafts;
  node.machine = pickMachine(recipe);
  node.machines = node.machine ? (crafts * recipe.time) / node.machine.speed : 0;
  for (const inp of recipe.in) node.children.push(build(inp.item, crafts * inp.qty, [...stack, itemId]));
  return node;
}

const isRaw = (n) => !n.recipe || n.recipe.in.length === 0;

function totals(root) {
  const machines = new Map(); // recipe + selected output + machine -> demand
  const raw = new Map(); // itemId -> rate
  (function walk(n) {
    // No recipe, or a recipe without inputs (mining, pumping) = raw material.
    if (isRaw(n)) raw.set(n.item, (raw.get(n.item) || 0) + n.rate);
    if (n.recipe && n.machine) {
      const key = `${n.recipe.id}:${n.item}:${n.machine.id}`;
      const e = machines.get(key) || { recipe: n.recipe, item: n.item, machine: n.machine, count: 0, rate: 0 };
      e.count += n.machines;
      e.rate += n.rate;
      machines.set(key, e);
    }
    n.children.forEach(walk);
  })(root);
  return { machines: [...machines.values()], raw: [...raw.entries()] };
}

// ---------- rendering ----------
const perUnit = (ratePerSec) => ratePerSec * (state.unit === "min" ? 60 : 1);
const unitLabel = () => (state.unit === "min" ? "/min" : "/s");

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function icon(path) {
  const img = el("img", "icon");
  img.src = path;
  img.alt = "";
  iconFallback(img);
  return img;
}

function machineMark(machine, count = null, showName = count !== null) {
  const mark = el("span", "machineMark");
  if (count !== null) mark.append(el("span", "machineCount", `×${count}`));
  const img = icon(machine.icon);
  img.title = machine.name;
  img.alt = machine.name;
  mark.append(img);
  if (showName) mark.append(el("span", "machineMarkName", machine.name));
  return mark;
}

function chip(cls, ...kids) {
  const s = el("span", "chip " + cls);
  kids.forEach((k) => s.append(k));
  return s;
}

// One node of the tree: the item, then (nested) everything needed to make it.
function renderNode(node, depth) {
  const item = items.get(node.item);
  const wrap = el("div", "node d" + (depth % 6));

  const row = el("div", "nodeRow");
  const itemCell = el("span", "nodeItem");
  itemCell.append(icon(item.icon), el("span", "nodeName", item.name));
  if (isRaw(node)) itemCell.append(el("span", "rawTag", "RAW"));
  row.append(
    el("span", "lvl", String(depth + 1)),
    itemCell,
    el("span", "nodeRate", `${fmt(perUnit(node.rate))} ${unitLabel()}`)
  );

  const recipeCell = el("span", "nodeChoice");
  const machineCell = el("span", "nodeChoice");
  if (node.recipe) {
    const cands = sortedCandidates(node.item);
    if (cands.length > 1) {
      const sel = el("select", "recipeSelect");
      sel.title = "Recipe";
      for (const r of cands) {
        const o = el("option", "", r.name);
        o.value = r.id;
        if (r.id === node.recipe.id) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener("change", () => {
        state.overrides[node.item] = Number(sel.value);
        render();
      });
      sel.addEventListener("click", (e) => e.stopPropagation());
      recipeCell.append(sel);
    } else recipeCell.append(el("span", "muted", node.recipe.name));
    if (node.machine) {
      machineCell.classList.add("machineChoice");
      machineCell.append(
        machineMark(node.machine, Math.ceil(node.machines - 1e-9), false),
        localMachineControl(node.recipe)
      );
    }
    else machineCell.append(el("span", "muted", "No machine"));
  } else {
    recipeCell.append(el("span", "muted", "Raw input"));
    machineCell.append(el("span", "muted", "—"));
  }
  row.append(recipeCell, machineCell);

  if (!node.children.length) {
    wrap.classList.add("leaf");
    wrap.append(row);
    return wrap;
  }

  const details = el("details");
  details.open = true;
  const summary = el("summary");
  summary.append(row);
  details.append(summary);
  const kids = el("div", "children");
  node.children.forEach((c) => kids.append(renderNode(c, depth + 1)));
  details.append(kids);
  wrap.append(details);
  return wrap;
}

function stat(label, value) {
  const d = el("div", "stat");
  d.append(el("span", "statValue", value), el("span", "statLabel", label));
  return d;
}

function table(headers, rows) {
  const t = el("table");
  const head = el("tr");
  headers.forEach((h) => head.append(el("th", "", h)));
  t.append(head);
  rows.forEach((cells) => {
    const tr = el("tr");
    cells.forEach((c) => {
      const td = el("td");
      if (c instanceof Node) td.append(c);
      else td.textContent = c;
      tr.append(td);
    });
    t.append(tr);
  });
  return t;
}

function withIcon(path, text) {
  const s = el("span", "withIcon");
  s.append(icon(path), document.createTextNode(text));
  return s;
}

function render() {
  const sel = $("selected");
  const out = $("results");
  sel.textContent = "";
  out.textContent = "";

  const target = state.item && itemsBySlug.get(state.item);
  if (!target) {
    sel.append(el("span", "muted", "Select an item in the menu on the left"));
    out.append(el("p", "muted", "The production tree, machine counts and required raw materials will appear here."));
    return;
  }
  sel.append(icon(target.icon), el("strong", "", target.name));

  const rateSec = state.unit === "min" ? state.rate / 60 : state.rate;
  const root = build(target.id, rateSec, []);
  const { machines, raw } = totals(root);

  const total = machines.reduce((n, m) => n + Math.ceil(m.count - 1e-9), 0);
  const stats = el("div", "stats");
  stats.append(
    stat("Target", `${fmt(state.rate)} ${state.unit === "min" ? "/min" : "/s"}`),
    stat("Machines", String(total)),
    stat("Machine types", String(machines.length)),
    stat("Raw materials", String(raw.length))
  );
  out.append(stats);

  const bar = el("div", "treeBar");
  bar.append(el("h2", "", "Production tree"));
  const ex = el("button", "btn", "Expand all");
  ex.onclick = () => out.querySelectorAll("details").forEach((d) => (d.open = true));
  const co = el("button", "btn", "Collapse all");
  co.onclick = () => out.querySelectorAll(".tree > .node > details details").forEach((d) => (d.open = false));
  bar.append(ex, co);
  const tree = el("div", "tree");
  tree.append(renderNode(root, 0));
  out.append(bar, tree);

  out.append(el("h2", "", "Machines"));
  out.append(
    machines.length
      ? table(
          ["Production", "Machines needed", "Choose machine", "Throughput"],
          machines
            .sort((a, b) => b.count - a.count)
            .map((m) => [
              withIcon(items.get(m.item).icon, items.get(m.item).name),
              machineMark(m.machine, Math.ceil(m.count - 1e-9), false),
              machineSelect(m.recipe, "tableMachineSelect"),
              `${fmt(perUnit(m.rate))} ${unitLabel()}`,
            ])
        )
      : el("p", "muted", "No machines needed.")
  );

  out.append(el("h2", "", `Raw materials (${unitLabel()})`));
  out.append(
    table(
      ["Item", "Amount"],
      raw
        .sort((a, b) => b[1] - a[1])
        .map(([id, r]) => [withIcon(items.get(id).icon, items.get(id).name), fmt(perUnit(r))])
    )
  );

  out.append(el("p", "muted note", "By-products, modules, beacons and power are not included yet."));
  saveHash();
}

// ---------- controls & URL ----------
function syncControls() {
  $("rate").value = state.rate;
  $("unit").value = state.unit;
  $("assembler").value = state.assembler;
  $("furnace").value = state.furnace;
  const lab = $("lab");
  if (lab) {
    const labs = [...producers.values()].filter((p) => ["lab", "biolab"].includes(p.slug));
    lab.replaceChildren(...labs.map((p) => {
      const option = el("option", "", p.name);
      option.value = p.slug;
      return option;
    }));
    if (!labs.some((p) => p.slug === state.lab)) state.lab = labs[0]?.slug || "lab";
    lab.value = state.lab;
  }
}

function saveHash() {
  const p = new URLSearchParams({
    item: state.item || "",
    rate: state.rate,
    unit: state.unit,
    asm: state.assembler,
    furnace: state.furnace,
    lab: state.lab,
    machines: JSON.stringify(state.machineOverrides),
    mode: state.mode,
    view: state.view,
  });
  history.replaceState(null, "", "#" + p.toString());
}
window.saveHash = saveHash;

function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  // The item is checked later, in loadMode(), when the data is known.
  const mode = p.get("mode") || localStorage.getItem("factorioCalcMode");
  if (["vanilla", "space-age"].includes(mode)) state.mode = mode;
  if (["calc", "tech"].includes(p.get("view"))) state.view = p.get("view");
  if (p.get("item")) state.item = p.get("item");
  if (p.get("rate") && Number(p.get("rate")) >= 0) state.rate = Number(p.get("rate"));
  if (["min", "sec"].includes(p.get("unit"))) state.unit = p.get("unit");
  if (p.get("asm")) state.assembler = p.get("asm");
  if (p.get("furnace")) state.furnace = p.get("furnace");
  if (p.get("lab")) state.lab = p.get("lab");
  if (p.get("machines")) {
    try {
      const machines = JSON.parse(p.get("machines"));
      if (machines && typeof machines === "object" && !Array.isArray(machines)) state.machineOverrides = machines;
    } catch {}
  }
}

// Called by the side menu (iframe).
window.selectItem = (slug) => {
  state.item = slug;
  state.overrides = {};
  const frame = $("leftiframe").contentWindow;
  if (frame && frame.markSelected) frame.markSelected(slug);
  if (state.view !== "calc") showView("calc");
  render();
};

$("rate").addEventListener("input", (e) => {
  state.rate = Math.max(0, Number(e.target.value) || 0);
  render();
});
$("unit").addEventListener("change", (e) => {
  state.unit = e.target.value;
  render();
});
$("assembler").addEventListener("change", (e) => {
  state.assembler = e.target.value;
  render();
});
$("furnace").addEventListener("change", (e) => {
  state.furnace = e.target.value;
  render();
});
$("lab").addEventListener("change", (e) => {
  state.lab = e.target.value;
  render();
  if (window.renderTech) window.renderTech();
});

$("modeToggle").addEventListener("change", async (e) => {
  const target = e.target.checked ? "space-age" : "vanilla";
  const m = modes.find((x) => x.id === target);
  if (!m || !m.available) {
    e.target.checked = state.mode === "space-age"; // put the switch back
    showNotice(
      "Space Age data is not installed yet. Put data/factorio-2.0-space-age.json into the data folder, " +
        "run \"node build_db.mjs\" and restart the server (see README)."
    );
    return;
  }
  await loadMode(target);
  syncControls();
  render();
  if (window.renderTech) window.renderTech();
});

document.querySelectorAll(".viewTab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));

init();
