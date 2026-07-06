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

const modWord = (mod) => (mod === "light" ? t("mod_light") : t("mod_strong"));
const labelOf = (n, mod) => (mod === "just" ? `${n}` : `${modWord(mod)} ${n}`);
const valueOf = (n, mod) =>
  Math.round((n + (mod === "light" ? -1 / 3 : mod === "strong" ? 1 / 3 : 0)) * 100) / 100;

// ------------------------------------------------------------------ i18n ----
const I18N = {
  en: {
    tab_now: "now", tab_shelf: "shelf", tab_settings: "settings",
    tab_hint: "tap again to tuck the widget away",
    min_title: "minimize", close_title: "close",
    prev_title: "previous", playpause_title: "play / pause", next_title: "next",
    empty_now_big: "nothing spinning",
    empty_now_small: "put a record on in spotify & it shows up here ♪",
    rate_track: "rate this track", edit_suffix: " · edit",
    pick_number: "pick a number…",
    mod_light: "light", mod_just: "just", mod_strong: "strong",
    note_placeholder: "scribble a note… (why this number?)",
    stamp_it: "✦ stamp it", restamp_it: "✦ re-stamp it",
    stamped_avg: "✦ stamped — album avg {avg}",
    stamp_rated: "RATED",
    shelf_empty_big: "bare shelves",
    shelf_empty_small: "no verdicts yet — go judge something",
    single_album: "(single)",
    tracks_rated: "{count} track(s) rated",
    album_avg_line: "{artist} — album avg {avg}",
    remove_rating: "remove rating",
    settings_lang_label: "language",
    settings_theme_label: "color theme",
  },
  tr: {
    tab_now: "şimdi", tab_shelf: "raf", tab_settings: "ayarlar",
    tab_hint: "widget'ı gizlemek için tekrar dokun",
    min_title: "küçült", close_title: "kapat",
    prev_title: "önceki", playpause_title: "oynat / duraklat", next_title: "sonraki",
    empty_now_big: "hiçbir şey çalmıyor",
    empty_now_small: "spotify'da bir şey çal, burada görünsün ♪",
    rate_track: "bu parçayı puanla", edit_suffix: " · düzenle",
    pick_number: "bir sayı seç…",
    mod_light: "hafif", mod_just: "tam", mod_strong: "güçlü",
    note_placeholder: "bir not karala… (neden bu sayı?)",
    stamp_it: "✦ damgala", restamp_it: "✦ yeniden damgala",
    stamped_avg: "✦ damgalandı — albüm ort. {avg}",
    stamp_rated: "PUANLANDI",
    shelf_empty_big: "raflar boş",
    shelf_empty_small: "henüz hüküm yok — git bir şeyi yargıla",
    single_album: "(tekli)",
    tracks_rated: "{count} parça puanlandı",
    album_avg_line: "{artist} — albüm ort. {avg}",
    remove_rating: "puanı kaldır",
    settings_lang_label: "dil",
    settings_theme_label: "renk teması",
  },
  es: {
    tab_now: "ahora", tab_shelf: "estante", tab_settings: "ajustes",
    tab_hint: "toca de nuevo para ocultar el widget",
    min_title: "minimizar", close_title: "cerrar",
    prev_title: "anterior", playpause_title: "reproducir / pausar", next_title: "siguiente",
    empty_now_big: "nada sonando",
    empty_now_small: "pon algo en spotify y aparecerá aquí ♪",
    rate_track: "califica esta canción", edit_suffix: " · editar",
    pick_number: "elige un número…",
    mod_light: "suave", mod_just: "justo", mod_strong: "fuerte",
    note_placeholder: "escribe una nota… (¿por qué este número?)",
    stamp_it: "✦ sellarlo", restamp_it: "✦ volver a sellarlo",
    stamped_avg: "✦ sellado — promedio del álbum {avg}",
    stamp_rated: "SELLADO",
    shelf_empty_big: "estantes vacíos",
    shelf_empty_small: "aún sin veredictos — ve a juzgar algo",
    single_album: "(sencillo)",
    tracks_rated: "{count} canción(es) calificada(s)",
    album_avg_line: "{artist} — promedio del álbum {avg}",
    remove_rating: "eliminar calificación",
    settings_lang_label: "idioma",
    settings_theme_label: "tema de color",
  },
  ja: {
    tab_now: "再生中", tab_shelf: "棚", tab_settings: "設定",
    tab_hint: "もう一度タップしてウィジェットを隠す",
    min_title: "最小化", close_title: "閉じる",
    prev_title: "前へ", playpause_title: "再生 / 一時停止", next_title: "次へ",
    empty_now_big: "何も再生されていません",
    empty_now_small: "Spotifyで何か再生すると、ここに表示されます ♪",
    rate_track: "この曲を評価する", edit_suffix: "・編集",
    pick_number: "数字を選んでください…",
    mod_light: "弱め", mod_just: "ちょうど", mod_strong: "強め",
    note_placeholder: "メモを書く…（なぜこの数字？）",
    stamp_it: "✦ 評価する", restamp_it: "✦ 再評価する",
    stamped_avg: "✦ 評価完了 — アルバム平均 {avg}",
    stamp_rated: "評価済み",
    shelf_empty_big: "棚は空です",
    shelf_empty_small: "まだ評価がありません — 何か評価しに行こう",
    single_album: "（シングル）",
    tracks_rated: "{count}曲評価済み",
    album_avg_line: "{artist} — アルバム平均 {avg}",
    remove_rating: "評価を削除",
    settings_lang_label: "言語",
    settings_theme_label: "カラーテーマ",
  },
  zh: {
    tab_now: "正在播放", tab_shelf: "唱片架", tab_settings: "设置",
    tab_hint: "再次点击以收起小组件",
    min_title: "最小化", close_title: "关闭",
    prev_title: "上一首", playpause_title: "播放 / 暂停", next_title: "下一首",
    empty_now_big: "没有正在播放的内容",
    empty_now_small: "在spotify播放点什么，就会显示在这里 ♪",
    rate_track: "为这首歌评分", edit_suffix: " · 编辑",
    pick_number: "选择一个数字…",
    mod_light: "偏轻", mod_just: "刚好", mod_strong: "偏强",
    note_placeholder: "写点笔记…（为什么打这个分？）",
    stamp_it: "✦ 盖章", restamp_it: "✦ 重新盖章",
    stamped_avg: "✦ 已盖章 — 专辑均分 {avg}",
    stamp_rated: "已评分",
    shelf_empty_big: "空空如也",
    shelf_empty_small: "还没有评价 — 去评一评吧",
    single_album: "（单曲）",
    tracks_rated: "已评{count}首",
    album_avg_line: "{artist} — 专辑均分 {avg}",
    remove_rating: "删除评分",
    settings_lang_label: "语言",
    settings_theme_label: "配色主题",
  },
};

let lang = localStorage.getItem("rateify_lang") || "en";

function t(key, params) {
  let s = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
  if (params) for (const k in params) s = s.replace(`{${k}}`, params[k]);
  return s;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll(".lang-pill").forEach((p) => p.classList.toggle("on", p.dataset.lang === lang));
}

function setLang(l) {
  lang = l;
  localStorage.setItem("rateify_lang", l);
  applyI18n();
  renderRating();
  resetRating(now && now.saved);
  openPanel = null;
  if (!shelfDirty) loadShelf();
}

document.querySelectorAll(".lang-pill").forEach((p) =>
  p.addEventListener("click", () => setLang(p.dataset.lang))
);

// ---------------------------------------------------------------- theme ----
const THEMES = ["classic", "noir", "mint", "berry", "ocean"];
let theme = localStorage.getItem("rateify_theme") || "classic";

function setTheme(name) {
  theme = name;
  localStorage.setItem("rateify_theme", name);
  document.body.classList.remove(...THEMES.map((n) => `theme-${n}`));
  document.body.classList.add(`theme-${name}`);
  document.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("on", s.dataset.theme === name));
}

document.querySelectorAll(".swatch").forEach((s) =>
  s.addEventListener("click", () => setTheme(s.dataset.theme))
);

setTheme(theme);
applyI18n();

// label for an already-stored numeric value (used on the shelf)
const prettyAvg = (v) => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1));

// ------------------------------------------------- tabs + window fitting ----
let collapsed = false;

// ask the native window to hug the content (no-op in a plain browser)
function fitWindow() {
  if (!window.pywebview) return;
  const w = collapsed ? 250 : 420;
  const h = collapsed
    ? 40
    : Math.min(Math.max(document.body.scrollHeight + 6, 280), 920);
  window.pywebview.api.resize(w, h);
}

function setCollapsed(c) {
  collapsed = c;
  document.body.classList.toggle("collapsed", c);
  fitWindow();
}

$("mini-now").addEventListener("click", () => setCollapsed(false));

document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    if (tab.classList.contains("active")) {
      setCollapsed(!collapsed); // tap the open tab again to tuck the widget away
      return;
    }
    setCollapsed(false);
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const view = tab.dataset.view;
    $("view-now").hidden = view !== "now";
    $("view-shelf").hidden = view !== "shelf";
    $("view-settings").hidden = view !== "settings";
    if (view === "shelf" && shelfDirty) loadShelf();
    fitWindow();
  })
);

// -------------------------------------------------------- rating drawer ----
let savedLabel = null; // label of the stored rating for the current track

function updateDrawerLabel() {
  const open = !$("rating-zone").hidden;
  $("drawer-toggle").textContent =
    (savedLabel ? `✎ ${savedLabel}${t("edit_suffix")}` : `✎ ${t("rate_track")}`) +
    (open ? " ▴" : " ▾");
}

$("drawer-toggle").addEventListener("click", () => {
  $("rating-zone").hidden = !$("rating-zone").hidden;
  updateDrawerLabel();
  fitWindow();
});

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
    $("r-label").textContent = t("pick_number");
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
  btn.textContent = saved ? t("restamp_it") : t("stamp_it");
  savedLabel = saved ? saved.label : null;
  updateDrawerLabel();
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
      btn.textContent = t("stamped_avg", { avg: prettyAvg(out.albumAvg) });
      savedLabel = labelOf(sel.n, sel.mod);
      updateDrawerLabel();
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
  const active = !!(now && now.active);
  const mini = $("mini-now");
  mini.classList.toggle("has-track", active);
  mini.classList.toggle("playing", active && now.playing);
  if (active) {
    $("mini-title").textContent = now.title;
    $("mini-artist").textContent = now.artist;
    const miniCover = $("mini-cover-sm");
    const wantMini = now.cover || "";
    if (miniCover.dataset.src !== wantMini) {
      miniCover.dataset.src = wantMini;
      miniCover.src = wantMini;
    }
  }
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
    fitWindow(); // title height can change between tracks
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
      <p class="album-count"></p>`;
    card.querySelector(".album-name").textContent = a.album || t("single_album");
    card.querySelector(".album-artist").textContent = a.artist;
    card.querySelector(".album-count").textContent = t("tracks_rated", { count: a.count });
    card.addEventListener("click", () => toggleTracks(card, a));
    grid.appendChild(card);
  });
  fitWindow();
}

let openPanel = null;
function toggleTracks(card, a) {
  if (openPanel) {
    const wasThis = openPanel.dataset.for === `${a.artist}:::${a.album}`;
    openPanel.remove();
    openPanel = null;
    if (wasThis) {
      fitWindow();
      return;
    }
  }
  const panel = document.createElement("div");
  panel.className = "album-tracks";
  panel.dataset.for = `${a.artist}:::${a.album}`;
  panel.innerHTML = `<h3></h3><p class="sub"></p>`;
  panel.querySelector("h3").textContent = a.album || t("single_album");
  panel.querySelector(".sub").textContent = t("album_avg_line", { artist: a.artist, avg: prettyAvg(a.avg) });

  a.tracks.forEach((trk) => {
    const row = document.createElement("div");
    row.className = "trk";
    row.innerHTML = `
      <span class="trk-title"></span>
      <span class="trk-label"></span>
      <button class="trk-del">✕</button>`;
    row.querySelector(".trk-title").textContent = trk.title;
    row.querySelector(".trk-label").textContent = trk.label;
    row.querySelector(".trk-del").title = t("remove_rating");
    row.querySelector(".trk-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch("/api/rate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist: a.artist, album: a.album, title: trk.title }),
      });
      shelfDirty = true;
      trackKey = ""; // force the now-view to reload saved state
      loadShelf();
    });
    panel.appendChild(row);
    if (trk.note) {
      const note = document.createElement("p");
      note.className = "trk-note";
      note.textContent = `“${trk.note}”`;
      panel.appendChild(note);
    }
    const date = document.createElement("p");
    date.className = "trk-date";
    date.textContent = trk.date.slice(0, 10);
    panel.appendChild(date);
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
  card.after(panel);
  openPanel = panel;
  fitWindow();
}

// ------------------------------------------------------- widget window ----
// pywebview announces itself after load; only then show the ✕ / — buttons
window.addEventListener("pywebviewready", () => {
  document.body.classList.add("webview");
  $("win-close").addEventListener("click", () => window.pywebview.api.close());
  $("win-min").addEventListener("click", () => window.pywebview.api.minimize());
  fitWindow();
  setTimeout(fitWindow, 700); // refit once fonts/cover have settled
});

// ----------------------------------------------------------------- boot ----
renderRating();
pollNow();
setInterval(pollNow, 1000);
if (location.hash === "#shelf")
  document.querySelector('.tab[data-view="shelf"]').click();
if (location.hash === "#settings")
  document.querySelector('.tab[data-view="settings"]').click();
if (location.hash === "#rate") {
  $("rating-zone").hidden = false;
  updateDrawerLabel();
}
