"""Paths, static data loading and the admin-editable runtime config."""
from __future__ import annotations

import copy
import json
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RUNTIME = DATA / "runtime"
KB_DIR = DATA / "kb"

_lock = threading.Lock()


def _load_env_file() -> None:
    """Minimal .env loader so the demo needs no extra dependency."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if value.strip() and not os.environ.get(key.strip()):
            os.environ[key.strip()] = value.strip()


_load_env_file()

# Accept OPENAI_KEY as an alias for the standard variable name.
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPENAI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPENAI_KEY"]


def load_json(name: str):
    return json.loads((DATA / name).read_text())


CONTACTS = load_json("contacts.json")
ORDERS = load_json("orders.json")
_DEFAULT_CONFIG = load_json("config.json")


def _config_path() -> Path:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    return RUNTIME / "config.json"


def get_config() -> dict:
    with _lock:
        path = _config_path()
        if path.exists():
            return json.loads(path.read_text())
        return copy.deepcopy(_DEFAULT_CONFIG)


def save_config(cfg: dict) -> dict:
    with _lock:
        _config_path().write_text(json.dumps(cfg, indent=2))
    return cfg


def update_config(patch: dict) -> dict:
    """Shallow-merge top-level keys; merge category settings per category."""
    cfg = get_config()
    for key, value in patch.items():
        if key == "categories" and isinstance(value, dict):
            for cat, settings in value.items():
                cfg["categories"].setdefault(cat, {}).update(settings)
        elif key == "ai_disclosure" and isinstance(value, dict):
            cfg["ai_disclosure"].update(value)
        else:
            cfg[key] = value
    return save_config(cfg)


def reset_config() -> dict:
    return save_config(copy.deepcopy(_DEFAULT_CONFIG))


def category_name(cat) -> str:
    if cat is None:
        return "None (ignored)"
    return get_config()["categories"][str(cat)]["name"]


def llm_enabled() -> bool:
    mode = os.environ.get("GOLFPM_MODE", "").lower()
    if mode == "offline":
        return False
    return bool(os.environ.get("OPENAI_API_KEY"))
