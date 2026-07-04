/* ============ rateify frontend ============ */

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state ----
let now = null;            // last /api/now snapshot
let trackKey = "";         // artist:::album:::title of the loaded track
let sel = { n: null, mod: "just" };
let shelfDirty = true;     // refetch library next time the shelf opens

// -------------------------------------------------------------- helpers ----
const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const labelOf = (n, mod) => (mod === "just" ? `${n}` : `${mod} ${n}`);
const valueOf = (n, mod) =>
  Math.round((n + (mod === "light" ? -1 / 3 : mod === "strong" ? 1 / 3 : 0)) * 100) / 100;

// label for an already-stored numeric value (used on the shelf)
const prettyAvg = (v) => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1));

// ---------------------------------------------------------------- tabs ----
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const view = tab.dataset.view;
    $("view-now").hidden = view !== "now";
    $("view-shelf").hidden = view !== "shelf";
    if (view === "shelf" && shelfDirty) loadShelf();
  })
);

// ------------------------------------------------------------ rating UI ----
const pillsBox = $("pills");
for (let n = 1; n <= 10; n++) {
  const b = document.createElement("button");
  b.className = "pill";
  b.textContent = n;
  b.addEventListener("click", () => {
    sel.n = n;
    if (n === 10 && sel.mod === "strong") sel.mod = "just"; // scale tops out at 10
    renderRating();
  });
  pillsBox.appendChild(b);
}

document.querySelectorAll(".mod").forEach((m) =>
  m.addEventListener("click", () => {
    if (m.disabled) return;
    sel.mod = m.dataset.mod;
    renderRating();
  })
);

function renderRating() {
  [...pillsBox.children].forEach((p, i) => p.classList.toggle("on", i + 1 === sel.n));
  document.querySelectorAll(".mod").forEach((m) => {
    m.classList.toggle("active", m.dataset.mod === sel.mod);
    m.disabled = m.dataset.mod === "strong" && sel.n === 10;
  });
  if (sel.n == null) {
    $("r-label").textContent = "pick a number…";
    $("r-value").textContent = "";
  } else {
    $("r-label").textContent = labelOf(sel.n, sel.mod);
    $("r-value").textContent = `(${valueOf(sel.n, sel.mod)})`;
  }
}

function resetRating(saved) {
  if (saved) {
    // reverse the stored value back into pill + modifier
    const v = saved.value;
    const n = Math.round(v);
    sel.n = Math.min(10, Math.max(1, n));
    sel.mod = v < n - 0.1 ? "light" : v > n + 0.1 ? "strong" : "just";
    $("note").value = saved.note || "";
    $("stamp").hidden = false;
  } else {
    sel = { n: null, mod: "just" };
    $("note").value = "";
    $("stamp").hidden = true;
  }
  const btn = $("save");
  btn.classList.remove("saved");
  btn.textContent = saved ? "✦ re-stamp it" : "✦ stamp it";
  renderRating();
}

// ---------------------------------------------------------------- save ----
$("save").addEventListener("click", async () => {
  const btn = $("save");
  if (!now || !now.active) return;
  if (sel.n == null) {
    btn.classList.remove("nope");
    void btn.offsetWidth; // restart the shake
    btn.classList.add("nope");
    return;
  }
  btn.disabled = true;
  try {
    const res = await fetch("/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artist: now.artist,
        album: now.album,
        title: now.title,
        value: valueOf(sel.n, sel.mod),
        label: labelOf(sel.n, sel.mod),
        note: $("note").value,
      }),
    });
    const out = await res.json();
    if (out.ok) {
      shelfDirty = true;
      const stamp = $("stamp");
      stamp.hidden = true;
      void stamp.offsetWidth; // replay slam animation
      stamp.hidden = false;
      btn.classList.add("saved");
      btn.textContent = `✦ stamped — album avg ${prettyAvg(out.albumAvg)}`;
    }
  } finally {
    btn.disabled = false;
  }
});

// ------------------------------------------------------------- controls ----
document.querySelectorAll(".ctl").forEach((b) =>
  b.addEventListener("click", () => {
    fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: b.dataset.act }),
    });
    // optimistic flip so the vinyl, icon and clock react instantly
    if (b.dataset.act === "playpause" && now && now.active) {
      now.position = clock.pos + (clock.playing ? Date.now() / 1000 - clock.at : 0);
      now.ts = Date.now() / 1000;
      now.playing = !now.playing;
      renderNow();
    }
    setTimeout(pollNow, 350); // then confirm against reality
  })
);

// ----------------------------------------------------------- now playing ----
async function pollNow() {
  try {
    const res = await fetch("/api/now");
    now = await res.json();
  } catch {
    now = { active: false };
  }
  renderNow();
}

function renderNow() {
  const card = $("now-card");
  const empty = $("now-empty");
  if (!now || !now.active) {
    card.hidden = true;
    empty.hidden = false;
    return;
  }
  card.hidden = false;
  empty.hidden = true;

  const key = `${now.artist}:::${now.album}:::${now.title}`;
  if (key !== trackKey) {
    trackKey = key;
    $("t-title").textContent = now.title;
    $("t-artist").textContent = now.artist;
    $("t-album").textContent = now.album;
    resetRating(now.saved);
  }

  const cover = $("cover");
  const want = now.cover || "";
  if (cover.dataset.src !== want) {
    cover.dataset.src = want;
    cover.src = want;
  }

  $("vinyl").classList.toggle("out", now.playing);
  card.classList.toggle("playing", now.playing);
  // NB: the `hidden` attribute is ignored on inline <svg>, use display
  $("icon-play").style.display = now.playing ? "none" : "";
  $("icon-pause").style.display = now.playing ? "" : "none";

  syncClock();
}

// ------------------------------------------------------- smooth progress ----
// Spotify only reports its position to Windows every few seconds, so raw
// polls jump backwards. Keep a local clock and only resync on real events
// (track change, play/pause, or a seek that drifts it > 3s).
const clock = { key: "", pos: 0, at: 0, playing: false, duration: 0 };

function syncClock() {
  const t = Date.now() / 1000;
  let serverPos = now.position + (now.playing ? t - now.ts : 0);
  if (now.duration) serverPos = Math.min(serverPos, now.duration);
  const localPos = clock.pos + (clock.playing ? t - clock.at : 0);
  if (
    clock.key !== trackKey ||
    clock.playing !== now.playing ||
    Math.abs(serverPos - localPos) > 3
  ) {
    clock.pos = serverPos;
    clock.at = t;
  }
  clock.key = trackKey;
  clock.playing = now.playing;
  clock.duration = now.duration || 0;
}

// drive the bar every frame so it glides instead of ticking
function drawProgress() {
  if (now && now.active && clock.duration) {
    let pos = clock.pos + (clock.playing ? Date.now() / 1000 - clock.at : 0);
    pos = Math.min(pos, clock.duration);
    $("p-fill").style.width = `${(pos / clock.duration) * 100}%`;
    const cur = fmt(pos);
    if ($("p-cur").textContent !== cur) $("p-cur").textContent = cur;
    const dur = fmt(clock.duration);
    if ($("p-dur").textContent !== dur) $("p-dur").textContent = dur;
  }
  requestAnimationFrame(drawProgress);
}
requestAnimationFrame(drawProgress);

// ---------------------------------------------------------------- shelf ----
async function loadShelf() {
  shelfDirty = false;
  const res = await fetch("/api/library");
  const { albums } = await res.json();
  const grid = $("shelf-grid");
  grid.innerHTML = "";
  $("shelf-empty").hidden = albums.length > 0;

  albums.forEach((a) => {
    const card = document.createElement("div");
    card.className = "album-card";
    card.innerHTML = `
      <div class="album-cover-wrap">
        <span class="avg-badge">${prettyAvg(a.avg)}</span>
        ${
          a.cover
            ? `<img class="album-cover" src="${a.cover}" alt="" loading="lazy">`
            : `<div class="album-cover placeholder">♪</div>`
        }
      </div>
      <p class="album-name"></p>
      <p class="album-artist"></p>
      <p class="album-count">${a.count} track${a.count > 1 ? "s" : ""} rated</p>`;
    card.querySelector(".album-name").textContent = a.album || "(single)";
    card.querySelector(".album-artist").textContent = a.artist;
    card.addEventListener("click", () => toggleTracks(card, a));
    grid.appendChild(card);
  });
}

let openPanel = null;
function toggleTracks(card, a) {
  if (openPanel) {
    const wasThis = openPanel.dataset.for === `${a.artist}:::${a.album}`;
    openPanel.remove();
    openPanel = null;
    if (wasThis) return;
  }
  const panel = document.createElement("div");
  panel.className = "album-tracks";
  panel.dataset.for = `${a.artist}:::${a.album}`;
  panel.innerHTML = `<h3></h3><p class="sub"></p>`;
  panel.querySelector("h3").textContent = a.album || "(single)";
  panel.querySelector(".sub").textContent = `${a.artist} — album avg ${prettyAvg(a.avg)}`;

  a.tracks.forEach((t) => {
    const row = document.createElement("div");
    row.className = "trk";
    row.innerHTML = `
      <span class="trk-title"></span>
      <span class="trk-label"></span>
      <button class="trk-del" title="remove rating">✕</button>`;
    row.querySelector(".trk-title").textContent = t.title;
    row.querySelector(".trk-label").textContent = t.label;
    row.querySelector(".trk-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch("/api/rate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist: a.artist, album: a.album, title: t.title }),
      });
      shelfDirty = true;
      trackKey = ""; // force the now-view to reload saved state
      loadShelf();
    });
    panel.appendChild(row);
    if (t.note) {
      const note = document.createElement("p");
      note.className = "trk-note";
      note.textContent = `“${t.note}”`;
      panel.appendChild(note);
    }
    const date = document.createElement("p");
    date.className = "trk-date";
    date.textContent = t.date.slice(0, 10);
    panel.appendChild(date);
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
  card.after(panel);
  openPanel = panel;
}

// ----------------------------------------------------------------- boot ----
renderRating();
pollNow();
setInterval(pollNow, 1000);
if (location.hash === "#shelf")
  document.querySelector('.tab[data-view="shelf"]').click();
