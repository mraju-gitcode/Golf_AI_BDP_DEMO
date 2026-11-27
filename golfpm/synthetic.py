"""Story-driven synthetic email generator.

Every generated email comes from the demo story (data/story.md): the same
courses, distributors, people, orders, POs, part numbers and situations as
the test cases and the order feed. Volume is weighted like a real GolfPM
mailbox, with order status the most common request.

Template mode (offline) varies greetings, wording and sign-offs. LLM mode
(--llm) asks the model to write each email fresh from its scenario brief, so
wording is not tied to the rules; labels always come from the scenario.

    python -m golfpm.synthetic --total 90          # template wording
    python -m golfpm.synthetic --total 90 --llm    # written by the model
    python -m golfpm.evaluation synthetic_cases.json
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
from concurrent.futures import ThreadPoolExecutor

from .config import DATA, llm_enabled

# Share of mailbox volume by category (order status is the most common, per the spec).
WEIGHTS = {1: 0.28, 2: 0.14, 3: 0.16, 4: 0.07, 5: 0.08, 6: 0.06, 7: 0.09, 8: 0.07, 9: 0.05}

P = {
    "mike": ("mike.alvarez@pinehollowgc.example.com", "Mike Alvarez", "Superintendent, Pine Hollow Golf Club"),
    "jeff": ("jeff.hale@pinehollowgc.example.com", "Jeff Hale", "General Manager, Pine Hollow Golf Club"),
    "jen": ("jen.walsh@cedarridgecc.example.com", "Jen Walsh", "Assistant Superintendent, Cedar Ridge Country Club"),
    "luis": ("luis.romero@cedarridgecc.example.com", "Luis Romero", "Irrigation Technician, Cedar Ridge CC"),
    "dana": ("dana.price@fairwayirrigation.example.com", "Dana Price", "Fairway Irrigation Supply"),
    "orders": ("orders@fairwayirrigation.example.com", "Dana Price", "Fairway Irrigation Supply"),
    "parts": ("parts@fairwayirrigation.example.com", "Parts Desk", "Fairway Irrigation Supply"),
    "purch": ("purchasing@fairwayirrigation.example.com", "Purchasing", "Fairway Irrigation Supply"),
    "sam": ("sam.ortiz@lakeviewgolf.example.com", "Sam Ortiz", "Superintendent, Lakeview Golf Club"),
    "chris": ("irrigation@harborpointclub.example.com", "Chris Dunn", "Irrigation Tech, Harbor Point Club"),
    "pat": ("gm@harborpointclub.example.com", "Pat Greene", "General Manager, Harbor Point Club"),
    "meadow": ("office@meadowbrookgc.example.com", "Office", "Meadowbrook Golf Club"),
    "proshop": ("pro.shop@meadowbrookgc.example.com", "Pro Shop", "Meadowbrook Golf Club"),
    "kelly": ("office@newbridgegolf.example.com", "Kelly Fox", "Newbridge Golf"),
    "greenline": ("projects@greenlinegolfbuild.example.com", "Projects Team", "Greenline Golf Construction"),
    "vendor": ("hello@turfgrowthagency.example.com", "Growth Team", "Turf Growth Agency"),
}

# (category, expected action, person, brief for the model, template subject, template body)
SCENARIOS = [
    # 1. Order status - most common
    (1, "reply", "mike", "Asks when the 24 rotors on SO-TEST-104582 will ship; aerifying the week of the 15th.",
     "SO-TEST-104582 ship date", "Can you confirm when SO-TEST-104582 ships? We aerify the week of the 15th and need the rotors here first."),
    (1, "reply", "mike", "Checks whether SO-TEST-104582 is still on schedule; crew is lined up for install.",
     "Rotor order SO-TEST-104582", "Is SO-TEST-104582 still on schedule? I have the crew lined up for install and want to confirm the date."),
    (1, "reply", "jen", "Asks for tracking on SO-TEST-104590, the rotor order that shipped last week.",
     "Tracking for SO-TEST-104590", "Could you send the tracking details for SO-TEST-104590? We have not seen it arrive yet."),
    (1, "reply", "orders", "Asks for the ETA on PO 55187, their stock order of 24 rotors.",
     "ETA PO 55187", "What is the current ETA on our stock order, PO 55187?"),
    (1, "reply", "dana", "Lakeview is asking about PO 55120; asks whether it has shipped and for tracking.",
     "PO 55120 - Lakeview asking", "Lakeview is asking about their rotors on PO 55120. Has it shipped, and is there tracking?"),
    (1, "ask", "jen", "Asks for an update on 'our rotor order from last month' without giving any order or PO number.",
     "Rotor order update", "Any update on the rotor order we placed last month? We are planning winter work around it."),
    (1, "ask", "sam", "Asks when 'our order' will arrive, no order number given, renovation underway.",
     "When will our order arrive?", "We are mid-renovation. When will our order arrive?"),
    (1, "route", "mike", "SO-TEST-104611 decoders still show backordered; asks for an ETA.",
     "SO-TEST-104611 still backordered", "SO-TEST-104611 has shown backordered for weeks now. When can we expect the decoders?"),
    (1, "route", "dana", "Asks whether 40 full-circle golf rotors are in stock for quick ship for a spring renovation.",
     "Stock check - 40 rotors", "Do you have 40 full-circle golf rotors in stock for quick ship? Spring renovation starts soon."),
    (1, "route", "sam", "Asks for the ship date of SO-TEST-104500, which belongs to another course (Riverbend).",
     "Ship date SO-TEST-104500", "When does SO-TEST-104500 ship? A friend at another course asked me to check."),
    # 2. Returns and warranty
    (2, "ask", "sam", "Wants warranty replacement for rotors that stopped working; no part numbers or contact details given.",
     "Warranty - failed rotors", "A number of our rotors stopped working this season. We need warranty replacements."),
    (2, "ask", "mike", "Five rotors from last year's order stopped rotating; asks for replacement under warranty, no part numbers.",
     "Warranty request", "Five of the rotors from last year's order have stopped rotating. Can they be replaced under warranty?"),
    (2, "route", "dana", "Over-ordered spray nozzles after a project was cut back; wants to return 3 cases for credit.",
     "Return for credit - nozzles", "A project was cut back and we over-ordered spray nozzles. Can we return 3 cases for credit?"),
    (2, "escalate", "pat", "A failed valve flooded the clubhouse basement; their attorney wants to file a damage claim.",
     "Clubhouse flooding claim", "A failed valve flooded our clubhouse basement. Our attorney has asked us to file a claim for the damage."),
    # 3. Tech support
    (3, "reply", "sam", "Rotor on hole 9 pops up but stays in one position and does not rotate; pressure seems fine.",
     "Hole 9 rotor not rotating", "The rotor on hole 9 pops up but stays in one position and doesn't rotate. Pressure seems fine. What should we check?"),
    (3, "reply", "luis", "Since the storm all stations on hole 7 won't come on from central control; suspects decoders.",
     "Hole 7 stations down after storm", "Since the storm, all the stations on hole 7 won't come on from central control. Could it be the decoders?"),
    (3, "reply", "luis", "How to create a new watering program in CirrusPRO for the new practice area.",
     "New CirrusPRO program", "How do I create a new watering program in CirrusPRO for our new practice area?"),
    (3, "reply", "jen", "How to adjust the arc on part-circle rotors around the new tee boxes.",
     "Adjusting rotor arc", "How do we adjust the arc on our part-circle rotors around the new tee boxes?"),
    (3, "ask", "proshop", "Vague: sprinklers are acting up, asks for help, no product or symptom details.",
     "Sprinklers acting up", "Our sprinklers are acting up. Can someone help?"),
    (3, "escalate", "chris", "After the lightning strike there is a burning smell at the field controller by hole 14; asks if they can reset it.",
     "Burning smell at controller", "Lightning hit near the shop last night and there's a burning smell at the field controller by hole 14. Can we just reset it?"),
    # 4. PM order holds
    (4, "route", "dana", "SO-TEST-104790 is on hold pending PM approval for golf application; Lakeview needs it next week.",
     "Release SO-TEST-104790", "SO-TEST-104790 is on hold pending PM approval for golf application. Lakeview needs it next week. Can it be released?"),
    (4, "route", "dana", "Follows up on the hold on SO-TEST-104790, asks who can approve the release.",
     "Hold on SO-TEST-104790", "Who can approve the release of the hold on SO-TEST-104790? The course is waiting."),
    # 5. Product, SKU
    (5, "route", "parts", "TEST-4471 shows as discontinued; asks for the replacement part number.",
     "Replacement for TEST-4471", "TEST-4471 shows as discontinued. What is the replacement part number?"),
    (5, "route", "sam", "Asks if current nozzles are compatible with the rotor bodies installed ten years ago.",
     "Nozzle compatibility", "Are the current nozzles compatible with the rotor bodies we installed about ten years ago?"),
    (5, "route", "parts", "TEST-4480 is discontinued in their system; asks what replaces it.",
     "TEST-4480 discontinued", "Our system shows TEST-4480 as discontinued. What replaces it?"),
    # 6. CirrusPRO / GSP
    (6, "route", "kelly", "Just installed CirrusPRO; wants to set up an account and subscription.",
     "CirrusPRO subscription", "We just installed CirrusPRO and want to set up our account and subscription. Who should we talk to?"),
    (6, "route", "meadow", "Asks to renew the CirrusPRO plan for next year.",
     "CirrusPRO plan renewal", "Please renew our CirrusPRO plan for next year."),
    # 7. Purchase orders
    (7, "route", "purch", "Sends PO 55240 for the Lakeview renovation (PDF attached), requested ship date March 2.",
     "New PO 55240", "Please find attached PO 55240 for the Lakeview renovation. Requested ship date is March 2."),
    (7, "route", "dana", "Asks to change the quantity on PO 55187 from 24 to 36 rotors.",
     "Change to PO 55187", "Please change the quantity on PO 55187 from 24 to 36 rotors. Same ship-to."),
    # 8. Quotes, pricing, tariffs
    (8, "route", "greenline", "Requests a quote for rotors, decoders and central control for the Willow Creek GC 18-hole renovation bid.",
     "RFQ - Willow Creek renovation", "We are bidding the Willow Creek GC 18-hole renovation. Please quote rotors, decoders and central control. Bid due Dec 15."),
    (8, "route", "dana", "Asks whether tariffs will change pricing on the 2027 early order program.",
     "Tariffs and 2027 early order", "Will tariffs change pricing on our 2027 early order program? We are setting budgets now."),
    # 9. Other
    (9, "reply", "proshop", "Asks for a copy of the current golf product catalog.",
     "Golf catalog", "Could you send us the current golf product catalog?"),
    (9, "file", "vendor", "Vendor solicitation offering to triple leads with AI outreach; asks for 15 minutes.",
     "Grow your irrigation business", "We help irrigation brands triple their leads with AI-powered outreach. Do you have 15 minutes this week?"),
]

REF_RE = re.compile(r"SO-TEST-\d{6}|PO \d{5}|TEST-\d{4}")
GREETINGS = ["Hi team,", "Hello,", "Good morning,", "Hi GolfPM team,", "Hi,"]
CLOSINGS = ["Thanks,", "Regards,", "Thank you,", "Best,", "Cheers,"]


def _template_email(rng, person, subject, body) -> tuple[str, str]:
    addr, name, title = P[person]
    if person == "vendor":
        return subject, body
    first = name.split()[0] if " " in name else name
    sign = f"{first}" if rng.random() < 0.5 else f"{name}\n{title}"
    return subject, f"{rng.choice(GREETINGS)}\n\n{body}\n\n{rng.choice(CLOSINGS)}\n{sign}"


def _llm_email(person, brief, subject, body) -> tuple[str, str]:
    from .llm import _chat
    addr, name, title = P[person]
    story = (DATA / "story.md").read_text()
    msg = _chat(os.environ.get("GOLFPM_REPLY_MODEL", "gpt-5-mini")).invoke([
        ("system", "You write realistic customer emails to the Rain Bird GolfPM mailbox for a demo test set. "
                   "Stay inside this story; never invent new order numbers, PO numbers, part numbers, people or courses.\n\n" + story),
        ("user", json.dumps({
            "sender": f"{name}, {title} <{addr}>", "what_the_email_is_about": brief,
            "must_keep_exactly": "every order, PO and part number in the reference email",
            "reference_email": {"subject": subject, "body": body},
            "instructions": "Write a new email with different wording, natural for this sender, 2-5 sentences, "
                            "plain text with a sign-off. Do not add requests that are not in the brief. "
                            "Return JSON with keys subject and body only."})),
    ])
    text = msg.content if isinstance(msg.content, str) else "".join(p.get("text", "") for p in msg.content if isinstance(p, dict))
    data = json.loads(text[text.find("{"): text.rfind("}") + 1])
    return data["subject"], data["body"]


def generate(total: int = 90, use_llm: bool = False, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    by_cat: dict[int, list] = {}
    for s in SCENARIOS:
        by_cat.setdefault(s[0], []).append(s)
    counts = {c: max(1, round(total * w)) for c, w in WEIGHTS.items()}
    plan = []
    for cat, n in counts.items():
        for i in range(n):
            plan.append(by_cat[cat][i % len(by_cat[cat])])

    def build(item):
        idx, (cat, action, person, brief, subject, body) = item
        if use_llm:
            refs = set(REF_RE.findall(subject + " " + body))
            written = None
            for _ in range(2):  # the model must keep every order, PO and part number from the story
                try:
                    s, b = _llm_email(person, brief, subject, body)
                except Exception:
                    continue
                if refs <= set(REF_RE.findall(s + " " + b)):
                    written = (s, b)
                    break
            subject, body = written or _template_email(random.Random(seed + idx), person, subject, body)
        else:
            subject, body = _template_email(random.Random(seed + idx), person, subject, body)
        case = {"id": f"SY-{idx + 1:03d}", "type": "Synthetic", "scenario": brief, "from": P[person][0],
                "subject": subject, "body": body, "expected": {"category": cat, "action": action}}
        if cat == 7 and "PO 55240" in brief:
            case["attachments"] = [{"name": "PO_55240.pdf", "type": "application/pdf"}]
        return case

    items = list(enumerate(plan))
    if use_llm:
        with ThreadPoolExecutor(max_workers=8) as pool:
            return list(pool.map(build, items))
    return [build(i) for i in items]


def write(total: int = 90, use_llm: bool = False) -> int:
    cases = generate(total, use_llm and llm_enabled())
    (DATA / "synthetic_cases.json").write_text(json.dumps(
        {"_note": "Generated from the demo story (data/story.md) by golfpm.synthetic. Labels come from the scenarios.",
         "cases": cases}, indent=2))
    return len(cases)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--total", type=int, default=90)
    ap.add_argument("--llm", action="store_true")
    a = ap.parse_args()
    print(f"Wrote {write(a.total, a.llm)} cases to data/synthetic_cases.json")
