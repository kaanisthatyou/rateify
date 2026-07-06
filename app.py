"""Rateify — tiny local widget that shows what Spotify is playing and lets you rate it.

Reads Windows' media session (SMTC), so no Spotify API keys are needed.
Run:  python app.py   → opens http://127.0.0.1:7700
"""
__version__ = "1.2.0"

import asyncio
import hashlib
import json
import socket
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from winrt.windows.media.control import (
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
)
from winrt.windows.storage.streams import Buffer, InputStreamOptions

# frozen exe: bundled read-only assets live in _MEIPASS, data next to the exe
FROZEN = getattr(sys, "frozen", False)
BUNDLE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
ROOT = Path(sys.executable).parent if FROZEN else Path(__file__).parent
DATA_DIR = ROOT / "data"
COVERS_DIR = ROOT / "covers"
DATA_DIR.mkdir(exist_ok=True)
COVERS_DIR.mkdir(exist_ok=True)
RATINGS_FILE = DATA_DIR / "ratings.json"

PORT = 7700

app = Flask(__name__, static_folder=str(BUNDLE / "static"), static_url_path="")

# ---------------------------------------------------------------- ratings ----

_ratings_lock = threading.Lock()


def _load():
    if RATINGS_FILE.exists():
        return json.loads(RATINGS_FILE.read_text(encoding="utf-8"))
    return {"albums": {}}


def _save(data):
    RATINGS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _album_key(artist, album):
    return f"{artist}:::{album}"


def _album_avg(album):
    values = [t["value"] for t in album["tracks"].values()]
    return round(sum(values) / len(values), 2) if values else None


# ------------------------------------------------------------ SMTC worker ----

_now_lock = threading.Lock()
_now = {"active": False}
_session = None  # latest SMTC session, used by /api/control
_loop = None  # worker thread's asyncio loop


def _cover_path(artist, album):
    h = hashlib.md5(f"{artist}|{album}".encode("utf-8")).hexdigest()[:16]
    return COVERS_DIR / f"{h}.png"


async def _grab_cover(info, path):
    if path.exists() or not info.thumbnail:
        return
    stream = await info.thumbnail.open_read_async()
    size = stream.size
    if not size:
        return
    buf = Buffer(size)
    await stream.read_async(buf, size, InputStreamOptions.READ_AHEAD)
    path.write_bytes(bytes(buf))


async def _poll_forever():
    global _session
    mgr = await SessionManager.request_async()
    while True:
        try:
            session = None
            for s in mgr.get_sessions():
                if "spotify" in (s.source_app_user_model_id or "").lower():
                    session = s
                    break
            if session is None:
                session = mgr.get_current_session()
            _session = session

            if session is None:
                snap = {"active": False}
            else:
                info = await session.try_get_media_properties_async()
                pb = session.get_playback_info()
                tl = session.get_timeline_properties()
                artist = info.artist or ""
                album = info.album_title or ""
                title = info.title or ""
                cover = ""
                if title:
                    cpath = _cover_path(artist, album)
                    try:
                        await _grab_cover(info, cpath)
                    except OSError:
                        pass
                    if cpath.exists():
                        cover = f"/covers/{cpath.name}"
                # SMTC tells us when the reported position was accurate; use
                # that as the timestamp so the client can extrapolate exactly
                pos_ts = time.time()
                try:
                    lu = tl.last_updated_time
                    if lu and lu.year > 2000:
                        pos_ts = lu.timestamp()
                except (OSError, OverflowError, ValueError):
                    pass
                snap = {
                    "active": bool(title),
                    "title": title,
                    "artist": artist,
                    "album": album,
                    "playing": pb.playback_status == PlaybackStatus.PLAYING,
                    "position": tl.position.total_seconds() if tl.position else 0,
                    "duration": tl.end_time.total_seconds() if tl.end_time else 0,
                    "cover": cover,
                    "ts": pos_ts,
                }
            with _now_lock:
                _now.clear()
                _now.update(snap)
        except Exception as exc:  # keep the poller alive no matter what
            with _now_lock:
                _now.clear()
                _now.update({"active": False, "error": str(exc)})
        await asyncio.sleep(1.0)


def _worker():
    global _loop
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    _loop.run_until_complete(_poll_forever())


# ------------------------------------------------------------------ routes ----


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/covers/<path:name>")
def cover(name):
    return send_from_directory(COVERS_DIR, name)


@app.get("/api/now")
def api_now():
    with _now_lock:
        snap = dict(_now)
    if snap.get("active"):
        with _ratings_lock:
            data = _load()
        album = data["albums"].get(_album_key(snap["artist"], snap["album"]))
        saved = album["tracks"].get(snap["title"]) if album else None
        snap["saved"] = saved
    return jsonify(snap)


_ACTIONS = {
    "playpause": "try_toggle_play_pause_async",
    "next": "try_skip_next_async",
    "prev": "try_skip_previous_async",
}


@app.post("/api/control")
def api_control():
    action = (request.get_json(silent=True) or {}).get("action")
    session = _session
    if action not in _ACTIONS or session is None or _loop is None:
        return jsonify(ok=False), 400
    async def _do():
        # winrt methods return an IAsyncOperation, not a coroutine — await it here
        return await getattr(session, _ACTIONS[action])()

    fut = asyncio.run_coroutine_threadsafe(_do(), _loop)
    try:
        ok = fut.result(timeout=5)
    except Exception:
        ok = False
    return jsonify(ok=bool(ok))


@app.post("/api/rate")
def api_rate():
    body = request.get_json(force=True)
    artist, album, title = body["artist"], body["album"], body["title"]
    key = _album_key(artist, album)
    with _ratings_lock:
        data = _load()
        entry = data["albums"].setdefault(
            key, {"artist": artist, "album": album, "cover": "", "tracks": {}}
        )
        cpath = _cover_path(artist, album)
        if cpath.exists():
            entry["cover"] = f"/covers/{cpath.name}"
        entry["tracks"][title] = {
            "value": round(float(body["value"]), 2),
            "label": body["label"],
            "note": body.get("note", "").strip(),
            "date": datetime.now().isoformat(timespec="seconds"),
        }
        _save(data)
        return jsonify(ok=True, albumAvg=_album_avg(entry))


@app.delete("/api/rate")
def api_unrate():
    body = request.get_json(force=True)
    key = _album_key(body["artist"], body["album"])
    with _ratings_lock:
        data = _load()
        entry = data["albums"].get(key)
        if entry and body["title"] in entry["tracks"]:
            del entry["tracks"][body["title"]]
            if not entry["tracks"]:
                del data["albums"][key]
            _save(data)
    return jsonify(ok=True)


@app.get("/api/library")
def api_library():
    with _ratings_lock:
        data = _load()
    albums = []
    for entry in data["albums"].values():
        tracks = [
            {"title": t, **info}
            for t, info in sorted(
                entry["tracks"].items(), key=lambda kv: kv[1]["date"], reverse=True
            )
        ]
        albums.append(
            {
                "artist": entry["artist"],
                "album": entry["album"],
                "cover": entry["cover"],
                "avg": _album_avg(entry),
                "count": len(tracks),
                "latest": max(t["date"] for t in tracks),
                "tracks": tracks,
            }
        )
    albums.sort(key=lambda a: a["latest"], reverse=True)
    return jsonify(albums=albums)


def _acquire_singleton():
    """Claim the port with our own bind, rather than testing it with a
    connect() — a connect-based check leaves a race window during this
    instance's own Flask startup where a second near-simultaneous launch
    also sees the port as free, so both survive as separate windows.
    A bind is atomic: only one process can ever hold it, immediately."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", PORT))
    except OSError:
        s.close()
        return None
    s.listen(8)
    return s


def _run_flask(lock_socket):
    from werkzeug.serving import make_server

    make_server("127.0.0.1", PORT, app, fd=lock_socket.fileno()).serve_forever()


def _enable_true_transparency(window):
    """pywebview's transparent=True only clears WebView2's own background —
    it never touches the parent Form's BackColor, which stays at its WinForms
    default (an opaque box behind the "transparent" page; confirmed by
    inspecting webview/platforms/{winforms,edgechromium}.py). Chroma-key the
    Form itself with the classic WinForms trick so it's actually see-through
    to the desktop wherever the page paints nothing (alpha 0)."""
    window.events.shown.wait()
    try:
        import clr

        clr.AddReference("System.Windows.Forms")
        from System import Func, Type
        from System.Drawing import Color
        from webview.platforms.winforms import BrowserView

        form = BrowserView.instances[window.uid]
        key = Color.FromArgb(255, 1, 2, 3)  # a color our CSS never paints

        def _apply():
            form.BackColor = key
            form.TransparencyKey = key

        form.Invoke(Func[Type](_apply))
    except Exception:
        pass  # best-effort — window just stays opaque if this ever breaks


def _run_widget(lock_socket):
    """Frameless always-on-top widget window; the page's header is the drag
    handle and its ✕ / — buttons call back in through window.expose."""
    import webview

    threading.Thread(target=_run_flask, args=(lock_socket,), daemon=True).start()
    window = webview.create_window(
        "rateify",
        f"http://127.0.0.1:{PORT}",
        width=420,
        height=560,
        frameless=True,
        on_top=True,
        resizable=True,
        background_color="#f0e9d8",
        transparent=True,  # lets the tucked-away mini bar show the desktop through it
    )
    threading.Thread(target=_enable_true_transparency, args=(window,), daemon=True).start()

    def close():
        window.destroy()

    def minimize():
        window.minimize()

    def resize(width, height):
        # the page asks to be fitted to its content (drawer open/closed, etc.)
        window.resize(int(width), int(height))

    window.expose(close, minimize, resize)
    webview.start()  # blocks until the window is closed


if __name__ == "__main__":
    lock_socket = _acquire_singleton()
    if lock_socket is None:
        # another Rateify already holds the port — just bring up its page
        webbrowser.open(f"http://127.0.0.1:{PORT}")
        sys.exit(0)
    threading.Thread(target=_worker, daemon=True).start()
    try:
        _run_widget(lock_socket)
    except Exception:
        # no WebView2 runtime? fall back to the browser like the old days
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
        print(f"Rateify spinning at http://127.0.0.1:{PORT}")
        _run_flask(lock_socket)
