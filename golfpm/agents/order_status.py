"""Category 1: Order status agent (guided workflow; the model only words the reply).

The workflow, not the model, decides whether the sender may see the order:
order data is released only to verified contacts of the account that placed it.
"""
from __future__ import annotations

import re

from ..config import ORDERS, get_config
from .. import llm
from .common import PO_RE, SO_RE, ack_text, decision, reply, summarize, wrap_reply

INVENTORY_RE = re.compile(r"\b(in stock|quick ship|stock check|availability|available)\b", re.I)


def _find(ref: str) -> dict | None:
    for o in ORDERS["orders"]:
        if o["order_no"].upper() == ref.upper() or o["customer_po"] == ref:
            return o
    return None


def lookup(text: str) -> list[tuple[str, dict | None]]:
    refs = [m.group(0).upper() for m in SO_RE.finditer(text)] + [m.group(1) for m in PO_RE.finditer(text)]
    seen, out = set(), []
    for r in refs:
        if r not in seen:
            seen.add(r)
            out.append((r, _find(r)))
    return out


def _line(ref: str, o: dict) -> str:
    label = o["order_no"] if ref.startswith("SO-") else f"PO {o['customer_po']} (order {o['order_no']})"
    text = f"- {label}, shipping to {o['ship_to']}: {o['status']}"
    if o["status"].lower().startswith("shipped"):
        text += f" on {o['ship_date']}"
        if o["tracking"]:
            text += f", {o['carrier']} tracking {o['tracking']}"
    elif o["ship_date"]:
        text += f", scheduled ship date {o['ship_date']}"
    return text + "."


def handle(email: dict, intake: dict, triage: dict, case: dict) -> dict:
    text = intake["model_text"]
    sender = intake["sender"]
    owner = get_config()["categories"]["1"]["owner"]

    if sender["status"] in ("unknown", "lookalike"):
        body = ("For the security of our customers, order details can only be shared with the registered contacts "
                "on the account. Please write to us from the email address registered with your account, or ask the "
                "account's contact to get in touch, and include the order or PO number.")
        return decision("ask", f"Sender is {sender['status']}; no order data released",
                        customer_reply=reply("verification", wrap_reply(email, body)),
                        case_status="awaiting_customer", checks={"no_order_data": True})

    refs = lookup(text)
    if not refs:
        if INVENTORY_RE.search(text):
            return decision("route", "Inventory question; no on-hand inventory feed available to the agent (O-Q11)",
                            customer_reply=reply("ack", wrap_reply(email, ack_text("our Customer Service team"))),
                            forward={"to": owner, "summary": "Inventory availability request. " + summarize(email, text)},
                            teams={"to": owner, "text": f"Inventory check from {sender['account_name']}"},
                            case_status="routed")
        body = ("Thank you for your email. So we can look up the right order, please reply with the Rain Bird order "
                "number (for example SO-123456) or your purchase order (PO) number.")
        return decision("ask", "No order or PO number in the email", customer_reply=reply("ask", wrap_reply(email, body)),
                        case_status="awaiting_customer")

    allowed, blocked, missing = [], [], []
    for ref, order in refs:
        if order is None:
            missing.append(ref)
        elif order["sold_to"] != sender["account_id"]:
            blocked.append(ref)
        else:
            allowed.append((ref, order))

    if blocked or missing or not allowed:
        why = []
        if blocked:
            why.append(f"{', '.join(blocked)} not linked to {sender['account_name']}")
        if missing:
            why.append(f"{', '.join(missing)} not found in the order feed")
        return decision("route", "; ".join(why) or "No authorized order",
                        customer_reply=reply("ack", wrap_reply(email, ack_text("our Customer Service team"))),
                        forward={"to": owner, "summary": "Order status request needs a person: " + "; ".join(why)},
                        teams={"to": owner, "text": f"Order status handoff: {'; '.join(why)}"},
                        case_status="routed", checks={"no_order_data": True})

    no_date = [(r, o) for r, o in allowed if not o["ship_date"]]
    if no_date:
        names = ", ".join(o["order_no"] for _, o in no_date)
        return decision("route", f"No ship date in the data for {names}; agent does not estimate dates (O-Q7)",
                        customer_reply=reply("ack", wrap_reply(email, ack_text(
                            "our Customer Service team", "We aim to respond within one business day."))),
                        forward={"to": owner, "summary": f"{names}: status {no_date[0][1]['status']}, no ship date in feed. Customer asks for ETA."},
                        teams={"to": owner, "text": f"ETA needed for {names} ({sender['account_name']})"},
                        case_status="routed", checks={"no_order_data": True})

    lines = [_line(r, o) for r, o in allowed]
    facts = {"orders": lines, "as_of": ORDERS["as_of"]}
    extra = ""
    if triage.get("secondary_category") == 2:
        extra = "\n\nYour warranty request has been opened as a separate case and passed to our returns team, who will contact you."
    base = ("Here is the latest status we have:\n\n" + "\n".join(lines) +
            f"\n\nThis information is from our order system as of {ORDERS['as_of']}." + extra)
    drafted = None
    try:
        drafted = llm.write("Write a short order status reply. Keep every order line exactly as given and include the as-of statement verbatim.",
                            base)
    except Exception:
        drafted = None
    body = drafted if drafted and ORDERS["as_of"] in drafted and all(o["order_no"] in drafted for _, o in allowed) else base
    child = None
    if triage.get("secondary_category") == 2:
        child = {"category": 2, "summary": "Warranty request raised inside an order status email. " + summarize(email, text)}
    return decision("reply", f"Status found for {', '.join(o['order_no'] for _, o in allowed)}",
                    customer_reply=reply("answer", wrap_reply(email, body)),
                    checks={"needs_as_of": True, "allowed_orders": [o["order_no"] for _, o in allowed]},
                    case_status="answered", child_case=child,
                    sources=[{"title": ORDERS["source"], "as_of": ORDERS["as_of"]}])
