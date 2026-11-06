// Shared by Website.html and sidemenu.html.

const MISSING_ICON = "Graphics/missing.svg";
function iconFallback(img) {
  img.addEventListener("error", () => {
    if (img.dataset.iconFallbackHandled) return;
    img.dataset.iconFallbackHandled = "1";

    // Look up missing per-item PNGs in the Space Age sprite atlas. The API includes
    // its icon coordinates; this keeps the existing vanilla PNGs unchanged.
    const data = window.currentData || (window.parent && window.parent.currentData);
    const slug = img.src.split("/").pop().replace(/\.png(?:\?.*)?$/i, "");
    const point = data?.iconAtlas?.[slug];
    if (!point || !data?.iconAtlasUrl) {
      img.src = MISSING_ICON;
      return;
    }

    const sheet = new Image();
    sheet.onload = () => {
      const tile = data.iconTileSize || 64;
      const bounds = img.getBoundingClientRect();
      const scaleX = (bounds.width || 28) / tile;
      const scaleY = (bounds.height || 28) / tile;
      const sprite = document.createElement("span");
      sprite.className = img.className;
      sprite.style.display = "inline-block";
      sprite.style.flex = "0 0 auto";
      sprite.title = img.title;
      sprite.setAttribute("aria-hidden", "true");
      sprite.style.backgroundImage = `url("${data.iconAtlasUrl}")`;
      sprite.style.backgroundRepeat = "no-repeat";
      sprite.style.backgroundSize = `${sheet.naturalWidth * scaleX}px ${sheet.naturalHeight * scaleY}px`;
      sprite.style.backgroundPosition = `${-point.x * scaleX}px ${-point.y * scaleY}px`;
      img.replaceWith(sprite);
    };
    sheet.onerror = () => { img.src = MISSING_ICON; };
    sheet.src = data.iconAtlasUrl;
  });
}

function sidebar() {
  const frame = document.getElementById("leftiframe");
  if (frame) frame.classList.toggle("closed");
}

document.addEventListener("click", function (e) {
  const btn = e.target.closest(".accordion");
  if (!btn) return;
  btn.classList.toggle("active");
  const panel = btn.nextElementSibling;
  panel.style.display = panel.style.display == "block" ? "none" : "block";
});


