// "Technologies" tab. Shows all technologies of the current mode (Vanilla / Space Age),
// grouped by the science packs they need. Click one to see its cost, prerequisites and unlocked recipes.
// Data comes from calc.js through the "datachange" event.

let tech = {
  data: null,
  list: [], // technology items
  bySlug: new Map(),
  recipeBySlug: new Map(), // the research "recipe" of a technology = science packs + time
  requiredBy: new Map(), // tech id -> [tech id] that need it
  itemById: new Map(),
  recipeById: new Map(),
  selected: null, // slug
};

const tEl = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function tIcon(path, cls) {
  const img = tEl("img", cls || "icon");
  img.src = path;
  img.alt = "";
  iconFallback(img);
  return img;
}

// Icon + small level label ("2", "3", ...) like in the game.
function techIcon(t, cls) {
  const box = tEl("span", "techIcon " + (cls || ""));
  box.append(tIcon(t.icon));
  if (t.iconText) box.append(tEl("span", "techLevel", t.iconText));
  return box;
}

function prepareTech(data) {
  tech.data = data;
  tech.list = data.items.filter((i) => i.category === "technology");
  tech.bySlug = new Map(tech.list.map((t) => [t.slug, t]));
  tech.itemById = new Map(data.items.map((i) => [i.id, i]));
  tech.recipeById = new Map(data.recipes.map((r) => [r.id, r]));
  tech.recipeBySlug = new Map(data.recipes.map((r) => [r.slug, r]));
  tech.requiredBy = new Map();
  for (const [id, pre] of Object.entries(data.prerequisites))
    for (const p of pre) {
      if (!tech.requiredBy.has(p)) tech.requiredBy.set(p, []);
      tech.requiredBy.get(p).push(Number(id));
    }
  if (tech.selected && !tech.bySlug.has(tech.selected)) tech.selected = null;
}

// Research cost of one unit: [{ item, qty }] (empty for technologies without science packs).
const techCost = (t) => tech.recipeBySlug.get(t.slug)?.in ?? [];

function packKey(t) {
  return techCost(t).map((c) => c.item).sort((a, b) => a - b).join(",");
}

// Group by science packs: first the cheapest groups (fewest packs).
function groupTech(list) {
  const groups = new Map();
  for (const t of list) {
    const k = packKey(t);
    if (!groups.has(k)) groups.set(k, { key: k, packs: techCost(t).map((c) => c.item), items: [] });
    groups.get(k).items.push(t);
  }
  return [...groups.values()].sort((a, b) => a.packs.length - b.packs.length || a.key.localeCompare(b.key));
}

function renderList() {
  const box = document.getElementById("techList");
  box.textContent = "";
  const q = document.getElementById("techSearch").value.trim().toLowerCase();
  const shown = tech.list.filter((t) => !q || t.name.toLowerCase().includes(q));
  document.getElementById("techCount").textContent = `${shown.length} / ${tech.list.length} technologies`;

  if (!shown.length) {
    box.append(tEl("p", "muted", "No technologies found."));
    return;
  }
  for (const g of groupTech(shown)) {
    const head = tEl("h2", "techGroupHead");
    if (!g.packs.length) head.append(document.createTextNode("Trigger technologies (no science packs)"));
    g.packs.forEach((id) => {
      const it = tech.itemById.get(id);
      const s = tEl("span", "withIcon");
      s.title = it.name;
      s.append(tIcon(it.icon));
      head.append(s);
    });
    box.append(head);

    const grid = tEl("div", "techGrid");
    for (const t of g.items) {
      const b = tEl("button", "techCard" + (t.slug === tech.selected ? " picked" : ""));
      b.title = t.name;
      b.dataset.slug = t.slug;
      b.append(techIcon(t), tEl("span", "techName", t.name));
      b.addEventListener("click", () => selectTech(t.slug));
      grid.append(b);
    }
    box.append(grid);
  }
}

function selectTech(slug) {
  tech.selected = slug;
  document.querySelectorAll(".techCard").forEach((c) => c.classList.toggle("picked", c.dataset.slug === slug));
  renderDetail();
}

// "researchSpeed: 0.2" -> "Research speed +20%"
function describeEffects(effects) {
  if (!effects) return [];
  const pretty = (s) => s.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const out = [];
  for (const [k, v] of Object.entries(effects)) {
    if (typeof v === "number") out.push(`${pretty(k)} +${Math.round(v * 100)}%`);
    else if (Array.isArray(v))
      v.forEach((e) => out.push(`${pretty(k)}${e.category ? " (" + e.category + ")" : ""} +${e.value}`));
  }
  return out;
}

function techLink(id) {
  const t = tech.itemById.get(id);
  const b = tEl("button", "chip link");
  b.append(techIcon(t, "small"), document.createTextNode(t.name));
  b.addEventListener("click", () => {
    selectTech(t.slug);
    document.querySelector(`.techCard[data-slug="${t.slug}"]`)?.scrollIntoView({ block: "nearest" });
  });
  return b;
}

function section(title, ...kids) {
  const s = tEl("div", "detailSection");
  s.append(tEl("h3", "", title), ...kids);
  return s;
}

function researchMachineControl(recipe) {
  if (!recipe) return tEl("span", "muted", "No research machine");
  const choices = (recipe.producers || [])
    .map((id) => tech.data.producers.find((p) => p.id === id))
    .filter(Boolean);
  if (!choices.length) return tEl("span", "muted", "No research machine");
  if (choices.length === 1) return tEl("span", "chip", choices[0].name);

  const select = tEl("select", "tableMachineSelect");
  select.setAttribute("aria-label", `Research machine for ${recipe.name}`);
  const localId = Number(window.state.machineOverrides[recipe.id]) || null;
  const globalMachine = choices.find((p) => p.slug === window.state.lab) || choices[0];
  const defaultOption = tEl("option", "", `Global default · ${globalMachine.name}`);
  defaultOption.value = "";
  defaultOption.selected = !localId;
  select.append(defaultOption);
  for (const machine of choices) {
    const option = tEl("option", "", machine.name);
    option.value = machine.id;
    option.selected = localId ? machine.id === localId : false;
    select.append(option);
  }
  select.addEventListener("change", () => {
    if (select.value) window.state.machineOverrides[recipe.id] = Number(select.value);
    else delete window.state.machineOverrides[recipe.id];
    renderDetail();
    window.saveHash?.();
  });
  return select;
}

function renderDetail() {
  const box = document.getElementById("techDetail");
  box.textContent = "";
  const t = tech.selected && tech.bySlug.get(tech.selected);
  const banner = tEl("div", "productionTechBanner");
  banner.append(tEl("span", "productionTechLabel", "Production technology"));
  if (t) banner.append(techIcon(t, "small"), tEl("strong", "productionTechName", t.name));
  else banner.append(tEl("span", "muted", "Choose a technology to see its details."));
  box.append(banner);
  if (!t) {
    return;
  }

  // cost of one research unit
  const cost = techCost(t);
  const rec = tech.recipeBySlug.get(t.slug);
  const costRow = tEl("div", "chips");
  if (!cost.length) costRow.append(tEl("span", "muted", "No science packs (researched by a trigger or from the start)."));
  cost.forEach((c) => {
    const it = tech.itemById.get(c.item);
    const chip = tEl("span", "chip");
    chip.append(tIcon(it.icon), document.createTextNode(`${c.qty} × ${it.name}`));
    costRow.append(chip);
  });
  if (rec) {
    const time = tEl("span", "chip rate");
    time.textContent = `${rec.time} s per unit`;
    costRow.append(time);
  }
  box.append(section("Cost per research unit", costRow));
  if (rec) box.append(section("Research machine for this technology", researchMachineControl(rec)));

  const effects = describeEffects(t.effects);
  if (effects.length) box.append(section("Effects", ...effects.map((e) => tEl("div", "effectLine", e))));

  const pre = tech.data.prerequisites[t.id] || [];
  box.append(
    section("Prerequisites", pre.length ? chipsOf(pre.map(techLink)) : tEl("span", "muted", "None"))
  );

  const next = tech.requiredBy.get(t.id) || [];
  if (next.length) box.append(section("Leads to", chipsOf(next.map(techLink))));

  const unl = tech.data.unlocks[t.id] || [];
  if (unl.length) {
    const chips = unl.map((rid) => {
      const r = tech.recipeById.get(rid);
      const out = tech.itemById.get(r.out[0].item);
      const b = tEl("button", "chip link", "");
      b.title = `Open ${out.name} in the calculator`;
      b.append(tIcon(r.icon), document.createTextNode(r.name));
      b.addEventListener("click", () => window.selectItem(out.slug)); // switches to the calculator
      return b;
    });
    box.append(section("Unlocks recipes", chipsOf(chips)));
  }
}

function chipsOf(list) {
  const d = tEl("div", "chips");
  list.forEach((c) => d.append(c));
  return d;
}

window.renderTech = function () {
  if (!tech.data) return;
  renderList();
  renderDetail();
};

window.addEventListener("datachange", (e) => {
  prepareTech(e.detail);
  if (!document.getElementById("techView").hidden) window.renderTech();
});

document.getElementById("techSearch").addEventListener("input", renderList);
