"""Approved-source knowledge index (stands in for Azure AI Search / Foundry IQ).

Indexes the markdown files in data/kb by section and does TF-IDF retrieval.
Every section keeps its document title, source URL and audience (public or
internal) so replies can cite the source and internal material is never linked.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache

from .config import KB_DIR

STOP = set("a an the and or of to in on for is are be it its this that with at by from as our we you your do does how what can could should i my me us".split())


def _tokens(text: str) -> list[str]:
    toks = re.findall(r"[a-z0-9]+", text.lower())
    out = []
    for t in toks:
        if t in STOP or len(t) < 2:
            continue
        for suffix in ("ing", "es", "s", "ed"):
            if t.endswith(suffix) and len(t) > len(suffix) + 2:
                t = t[: -len(suffix)]
                break
        out.append(t)
    return out


def _parse(path) -> list[dict]:
    raw = path.read_text()
    meta, body = {}, raw
    if raw.startswith("---"):
        _, front, body = raw.split("---", 2)
        for line in front.strip().splitlines():
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    sections = []
    for block in re.split(r"^## ", body, flags=re.M)[1:]:
        heading, _, text = block.partition("\n")
        sections.append({"doc_id": meta.get("id"), "title": meta.get("title"),
                         "source_url": meta.get("source_url"), "audience": meta.get("audience", "internal"),
                         "index": meta.get("index", "true") != "false",
                         "heading": heading.strip(), "text": text.strip()})
    return sections


@lru_cache(maxsize=1)
def _index():
    sections = [s for p in sorted(KB_DIR.glob("*.md")) for s in _parse(p) if s["index"]]
    docs = [Counter(_tokens(s["heading"] + " " + s["heading"] + " " + s["text"])) for s in sections]
    df = Counter(t for d in docs for t in d)
    n = len(docs)
    idf = {t: math.log((n + 1) / (c + 0.5)) for t, c in df.items()}
    return sections, docs, idf


def search(query: str, k: int = 3, audience: str | None = None) -> list[dict]:
    sections, docs, idf = _index()
    q = Counter(_tokens(query))
    results = []
    for sec, d in zip(sections, docs):
        if audience and sec["audience"] != audience:
            continue
        length = math.sqrt(sum(v * v for v in d.values())) or 1
        score = sum(idf.get(t, 0) * qv * d.get(t, 0) for t, qv in q.items()) / length
        if score > 0:
            results.append({**sec, "score": round(score, 3)})
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:k]


def get_section(doc_id: str, heading_prefix: str) -> dict | None:
    sections, _, _ = _index()
    for s in sections:
        if s["doc_id"] == doc_id and s["heading"].lower().startswith(heading_prefix.lower()):
            return s
    return None
