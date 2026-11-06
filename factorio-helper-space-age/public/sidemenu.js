// Builds the item inventory (like the Factorio inventory: tabs + grid of slots) inside the iframe.
// The data comes from the parent page (calc.js) through buildMenu(data), so Vanilla / Space Age
// switching only has to call buildMenu again.
// Clicking a slot calls selectItem() from the parent page (calc.js).

const pretty = (s) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

// Tab order as in the game; unknown categories (new ones in Space Age) go after these.
const TAB_ORDER = ["logistics", "production", "intermediate-products", "space", "combat"];

let tabsData = []; // [{ id, rows: [[item, ...], ...] }]
let currentTab = null;
let selectedSlug = null;

function makeIcon(path) {
  const img = document.createElement("img");
  img.src = path;
  img.alt = "";
  img.className = "icon";
  iconFallback(img);
  return img;
}

// Group the items: tab -> subgroup rows. Technologies have their own page. Fluids are shown
// in the "Intermediate products" tab, as in the game.
function groupItems(data) {
  const produced = new Set(data.recipes.flatMap((r) => r.out.map((o) => o.item)));
  const tabs = new Map();
  for (const it of data.items) {
    if (it.category === "technology" || !produced.has(it.id)) continue;
    const isFluid = it.category === "fluids";
    const tabId = isFluid ? "intermediate-products" : it.category;
    const rowKey = isFluid ? 1000 + it.row : it.row;
    if (!tabs.has(tabId)) tabs.set(tabId, new Map());
    const rows = tabs.get(tabId);
    if (!rows.has(rowKey)) rows.set(rowKey, []);
    rows.get(rowKey).push(it);
  }
  const rank = (id) => (TAB_ORDER.includes(id) ? TAB_ORDER.indexOf(id) : TAB_ORDER.length);
  return [...tabs.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([id, rows]) => ({
      id,
      rows: [...rows.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]),
    }));
}

function makeSlot(it) {
  const b = document.createElement("button");
  b.className = "slot";
  b.dataset.name = it.name.toLowerCase();
  b.dataset.slug = it.slug;
  b.title = it.name;
  if (it.slug === selectedSlug) b.classList.add("picked");
  b.appendChild(makeIcon(it.icon));
  b.addEventListener("mouseenter", () => (document.getElementById("hoverName").textContent = it.name));
  b.addEventListener("mouseleave", () => (document.getElementById("hoverName").innerHTML = "&nbsp;"));
  b.addEventListener("click", () => {
    setSelected(it.slug);
    if (window.parent && window.parent.selectItem) window.parent.selectItem(it.slug);
  });
  return b;
}

function setSelected(slug) {
  selectedSlug = slug;
  document.querySelectorAll(".slot").forEach((s) => s.classList.toggle("picked", s.dataset.slug === slug));
}

function renderTabs() {
  const box = document.getElementById("tabs");
  box.textContent = "";
  for (const t of tabsData) {
    const b = document.createElement("button");
    b.className = "invTab" + (t.id === currentTab ? " active" : "");
    b.title = pretty(t.id);
    b.appendChild(makeIcon(`Graphics/Icons/${t.id}.png`));
    b.addEventListener("click", () => {
      currentTab = t.id;
      renderTabs();
      renderGrid();
    });
    box.appendChild(b);
  }
}

function renderGrid() {
  const menu = document.getElementById("menu");
  menu.textContent = "";
  const q = document.getElementById("search").value.trim().toLowerCase();

  if (q) {
    // Search: matches from all tabs in one grid.
    const grid = document.createElement("div");
    grid.className = "slots";
    for (const t of tabsData)
      for (const row of t.rows)
        for (const it of row) if (it.name.toLowerCase().includes(q)) grid.appendChild(makeSlot(it));
    if (!grid.children.length) {
      const p = document.createElement("p");
      p.className = "muted emptyNote";
      p.textContent = "No items found.";
      menu.appendChild(p);
    } else menu.appendChild(grid);
    return;
  }

  const tab = tabsData.find((t) => t.id === currentTab);
  if (!tab) return;
  const title = document.createElement("div");
  title.className = "invTitle";
  title.textContent = pretty(tab.id);
  menu.appendChild(title);
  for (const row of tab.rows) {
    const grid = document.createElement("div");
    grid.className = "slots";
    row.forEach((it) => grid.appendChild(makeSlot(it)));
    menu.appendChild(grid);
  }
}

// Called by the parent page whenever the data is (re)loaded, e.g. after the mode switch.
window.buildMenu = function (data) {
  tabsData = groupItems(data);
  if (!tabsData.some((t) => t.id === currentTab)) currentTab = tabsData[0]?.id ?? null;
  if (window.parent && window.parent.state) selectedSlug = window.parent.state.item;
  renderTabs();
  renderGrid();
};

window.markSelected = setSelected; // the parent can highlight an item chosen elsewhere

document.getElementById("search").addEventListener("input", renderGrid);

// The parent may already have loaded the data before this iframe finished loading.
if (window.parent && window.parent.currentData) window.buildMenu(window.parent.currentData);
