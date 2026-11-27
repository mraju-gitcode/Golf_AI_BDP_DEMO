"""Synthetic email generator for more test volume beyond the 39 sheet cases.

Template mode (offline): combines senders, scenarios and phrasing variants per
category with known labels. LLM mode (--llm): asks the model to paraphrase the
template emails so wording is not identical to the rules, which makes it a
fairer held-out test for the classifier.

    python -m golfpm.synthetic --per-category 20            # template only
    python -m golfpm.synthetic --per-category 20 --llm      # paraphrased by the model
    python -m golfpm.evaluation synthetic_cases.json
"""
from __future__ import annotations

import argparse
import json
import random

from .config import DATA, llm_enabled

SENDERS = {
    "pine": ("mike.alvarez@pinehollowgc.example.com", "Mike"),
    "cedar": ("jen.walsh@cedarridgecc.example.com", "Jen"),
    "fairway": ("dana.price@fairwayirrigation.example.com", "Dana"),
    "lake": ("sam.ortiz@lakeviewgolf.example.com", "Sam"),
    "meadow": ("pro.shop@meadowbrookgc.example.com", "Meadowbrook Pro Shop"),
    "harbor": ("irrigation@harborpointclub.example.com", "Chris"),
    "new": ("office@oakmontvalley.example.com", "Taylor"),
}

# (category, expected action, sender key, subject, body) — {n} is the sign-off name.
TEMPLATES = [
    (1, "reply", "pine", "Ship date SO-TEST-104582", "Hi, could you confirm the ship date for SO-TEST-104582? Thanks, {n}"),
    (1, "reply", "pine", "Order SO-TEST-104582", "When will SO-TEST-104582 ship? Our crew is booked for install. {n}"),
    (1, "reply", "fairway", "ETA for PO 55187", "Hello, what is the current ETA for PO 55187? Regards, {n}"),
    (1, "reply", "fairway", "Tracking for PO 55120", "Can you send tracking for PO 55120? The course is asking. {n}"),
    (1, "ask", "cedar", "Where is our order?", "Hi, any update on when our last rotor order will arrive? {n}"),
    (1, "ask", "lake", "Order update", "Checking on the status of our order from a few weeks ago. {n}"),
    (1, "route", "pine", "SO-TEST-104611 update", "SO-TEST-104611 still shows backordered. When will it ship? {n}"),
    (1, "route", "fairway", "Stock availability", "Do you have 60 golf rotors available for quick ship next week? {n}"),
    (2, "ask", "lake", "Warranty on failed rotors", "Four of our rotors failed this month. Can we get them replaced under warranty? {n}"),
    (2, "ask", "cedar", "RMA request", "We need an RMA for some decoders that failed. How do we start a warranty claim? {n}"),
    (2, "route", "fairway", "Return for credit", "We over-ordered nozzles on our last order and would like to return them for credit. {n}"),
    (2, "escalate", "harbor", "Damage claim", "A valve failure flooded our cart barn. Our lawyer says we should file a claim for the damage. {n}"),
    (3, "reply", "lake", "Rotor stuck", "One rotor on hole 4 pops up but doesn't rotate. Pressure is fine. What should we check? {n}"),
    (3, "reply", "cedar", "Adjusting arc", "How do we adjust the arc on our part-circle rotors? {n}"),
    (3, "reply", "pine", "CirrusPRO program", "How do I create a new watering program in CirrusPRO for our new chipping green? {n}"),
    (3, "reply", "meadow", "Hole 12 stations", "Several stations on hole 12 won't come on from central control. Could the decoders be the issue? {n}"),
    (3, "ask", "meadow", "Irrigation issue", "Something is wrong with our sprinklers. Can someone help? {n}"),
    (3, "escalate", "harbor", "Smoke from controller", "There is smoke coming out of a field controller after the storm. Can we reset it? {n}"),
    (4, "route", "fairway", "Hold on SO-TEST-104790", "SO-TEST-104790 is on hold for PM approval. Can you get it released this week? {n}"),
    (4, "route", "pine", "Order on hold", "Our order shows on hold pending golf application approval. Who can release it? {n}"),
    (5, "route", "fairway", "Discontinued part", "Part TEST-4480 is discontinued. What is the replacement part number? {n}"),
    (5, "route", "lake", "Nozzle compatibility", "Are the new nozzles compatible with our older rotor bodies? {n}"),
    (6, "route", "new", "CirrusPRO subscription", "We would like to set up a CirrusPRO subscription for our course. Who do we contact? {n}"),
    (6, "route", "meadow", "GSP renewal", "Please renew our GSP service plan for next year. {n}"),
    (7, "route", "fairway", "New PO 55300", "Please find attached PO 55300 for the spring stock order. {n}"),
    (7, "route", "fairway", "Change to PO 55120", "Please change the quantity on PO 55120 from 30 to 40 rotors. {n}"),
    (8, "route", "new", "RFQ - 9 hole upgrade", "Please quote rotors and decoders for a 9-hole upgrade. Bid due next month. {n}"),
    (8, "route", "fairway", "Tariff question", "Will tariffs affect our pricing for 2027 orders? {n}"),
    (9, "reply", "meadow", "Catalog request", "Could you send me the latest golf catalog? {n}"),
    (9, "file", "new", "Boost your leads", "We help irrigation brands triple their leads. Do you have 15 minutes this week?"),
]


def _paraphrase(subject: str, body: str) -> tuple[str, str]:
    from .llm import _chat  # only used in LLM mode
    import os
    msg = _chat(os.environ.get("GOLFPM_REPLY_MODEL", "gpt-5-mini")).invoke([
        ("system", "Rewrite this customer email to a golf irrigation manufacturer in a different, natural style. "
                   "Keep the same request, the same order, PO and part numbers, and the same sign-off name. "
                   "Return JSON with keys subject and body only."),
        ("user", json.dumps({"subject": subject, "body": body})),
    ])
    data = json.loads(msg.content if isinstance(msg.content, str) else msg.content[0]["text"])
    return data["subject"], data["body"]


def generate(per_category: int = 10, use_llm: bool = False, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    by_cat: dict[int, list] = {}
    for t in TEMPLATES:
        by_cat.setdefault(t[0], []).append(t)
    cases, n = [], 0
    for cat, temps in sorted(by_cat.items()):
        for i in range(per_category):
            c, action, skey, subject, body = temps[i % len(temps)]
            addr, name = SENDERS[skey]
            body = body.format(n=name)
            if use_llm and i >= len(temps):  # first pass keeps the template wording, repeats are paraphrased
                try:
                    subject, body = _paraphrase(subject, body)
                except Exception:
                    pass
            elif i >= len(temps):
                body = rng.choice(["Hello, ", "Hi team, ", "Good morning, ", ""]) + body
            n += 1
            cases.append({"id": f"SY-{n:03d}", "type": "Synthetic", "scenario": f"Generated category {c} email",
                          "from": addr, "subject": subject, "body": body,
                          "expected": {"category": c, "action": action}})
    return cases


def write(per_category: int = 10, use_llm: bool = False) -> int:
    cases = generate(per_category, use_llm and llm_enabled())
    (DATA / "synthetic_cases.json").write_text(json.dumps(
        {"_note": "Generated synthetic emails (golfpm.synthetic). Labels come from the templates.", "cases": cases}, indent=2))
    return len(cases)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-category", type=int, default=10)
    ap.add_argument("--llm", action="store_true")
    a = ap.parse_args()
    print(f"Wrote {write(a.per_category, a.llm)} cases to data/synthetic_cases.json")
