"""Triage: one of nine categories plus a confidence score. Triage never answers.

LLM mode uses structured output from the model (Jev slot in the SRS design).
Offline mode uses weighted phrase rules so the demo runs without a key.
Multi-request emails follow G-A1: handle the highest-priority strong request,
route the other.
"""
from __future__ import annotations

import re

from . import llm

# (pattern, weight) per category. Phrases, not single loose words, to limit false hits.
RULES: dict[int, list[tuple[str, float]]] = {
    1: [(r"\b(expected to )?ship(s|ped|ping)?\b", 1.5), (r"\beta\b|\betas\b", 2.5), (r"\bship date\b", 2),
        (r"\bwhen (will|is) .{0,40}(ship|arrive|deliver)", 2.5), (r"\b(update|status) (on|of|for)\b", 2),
        (r"\bstatus\b", 1), (r"\barrive\b|\bdelivery\b", 1), (r"\btracking\b", 2), (r"\bbackorder", 2),
        (r"\bin stock\b|\bquick ship\b|\bstock check\b|\bavailab", 3), (r"\border\b", 0.5),
        (r"\bSO-TEST-\d+", 1)],
    2: [(r"\bwarranty\b", 3), (r"\breturn(s|ed)?\b", 2), (r"\brg[ra]\b|\brma\b", 3), (r"\bcredit\b", 2),
        (r"\breplaced\b|\breplacements?\b(?! part)", 1.5), (r"\bclaim\b", 2), (r"\bdefect", 2),
        (r"\bcracked\b", 1.5), (r"\bover-?ordered\b|\boverstock\b", 2), (r"\bflooded\b|\bdamage\b", 1)],
    3: [(r"\bnot (rotating|popping|working)\b|\bdoesn'?t rotate\b|\bwon'?t (come on|run|turn)\b|\baren'?t working\b", 3),
        (r"\bpops up\b|\bpopping up\b", 1.5), (r"\bstuck\b", 1.5), (r"\btroubleshoot", 2), (r"\bdecoder", 1.5),
        (r"\bcontroller\b", 1.5), (r"\bburning smell\b|\bsmoke\b|\bsparks?\b", 3), (r"\bhow (do|can) (i|we)\b", 2),
        (r"\badjust\b", 1.5), (r"\barc\b", 1.5), (r"\bprogram\b", 1.5), (r"\bstations?\b", 1.5),
        (r"\bsprinklers?\b", 1.5), (r"\baspersores\b|\bno giran\b|\bproblema\b", 3), (r"\brotor (question|not)\b", 1),
        (r"\bwhat should we check\b", 2)],
    4: [(r"\bon hold\b|\bhold\b", 3), (r"\breleased?\b", 2), (r"\bpm approval\b", 3), (r"\bgolf application\b", 2)],
    5: [(r"\breplacement part( number)?\b|\bpart number\b", 3), (r"\bdiscontinued\b|\bdeactivated\b", 3),
        (r"\bcompatib", 3), (r"\bfit\b", 2), (r"\bspecs?\b|\bspecification", 1.5), (r"\bsku\b", 2)],
    6: [(r"\bsubscription\b", 3), (r"\bonboarding\b", 3), (r"\brenew(al)?\b", 2.5), (r"\bgsp\b|\bservice plan\b", 3),
        (r"\bpasscode\b", 2), (r"\bset up our account\b|\baccount set ?up\b", 2.5), (r"\bcirruspro plan\b", 2)],
    7: [(r"\b(new|attached|revised) po\b|\bfind attached po\b|\battached (is|are) (our |the )?po\b|\bpo \d+ (is )?attached\b", 3), (r"\bpo \d+ for\b", 2), (r"\brequested ship date\b", 2),
        (r"\bpurchase order\b", 3),
        (r"\bchange the quantity\b|\bquantity change\b|\bchange to po\b", 3.5), (r"\binvoice\b", 2),
        (r"\bpo portal\b|\bconfirm the order\b|\bconfirm the po\b", 2)],
    8: [(r"\bquote\b|\bquotation\b", 3), (r"\brfq\b", 3), (r"\bpric(e|ing)\b", 1.5), (r"\btariffs?\b", 3),
        (r"\bbid(ding)?\b", 2), (r"\bprice list\b", 2), (r"\bboard exchange\b", 3)],
    9: [(r"\bcatalog(ue)?\b|\bbrochure\b|\bliterature\b", 3), (r"\bgive me a call\b|\bfollowing up on what\b|\bat the show\b", 3),
        (r"\btriple their leads\b|\bgrow your\b|\b15 minutes\b|\bunsubscribe\b", 3)],
}
SPAM = re.compile(r"\b(triple their leads|grow your .* business|do you have 15 minutes|unsubscribe|limited time offer)\b", re.I)


def _scores(text: str) -> dict[int, float]:
    return {cat: sum(w for pat, w in rules if re.search(pat, text, re.I)) for cat, rules in RULES.items()}


def rules_triage(text: str, subject: str) -> dict:
    full = f"{subject}\n{text}"
    scores = _scores(full)
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best_cat, best = ranked[0]
    if best <= 0:
        return {"category": 9, "confidence": 0.3, "secondary_category": None, "spam": False,
                "method": "rules", "scores": scores, "reasoning": "No category signals found"}
    # Strong = close to the best score. G-A1: the highest-priority strong category leads.
    strong = sorted(c for c, s in scores.items() if s >= 3 and s >= 0.6 * best)
    primary = strong[0] if strong else best_cat
    # PM holds and inventory checks are special cases that outrank generic order-status words.
    if primary == 1 and scores[4] >= 5:
        primary = 4
    secondary = next((c for c in strong if c != primary and c in (1, 2) and scores[c] >= 3), None)
    if primary == 1 and secondary is None and scores[2] >= 3:
        secondary = 2
    total = sum(scores.values())
    confidence = round(min(0.97, 0.45 + 0.5 * scores[primary] / (total + 1) + 0.03 * scores[primary]), 2)
    return {"category": primary, "confidence": confidence, "secondary_category": secondary,
            "spam": bool(SPAM.search(full)), "method": "rules", "scores": scores,
            "reasoning": f"Strongest signals for category {primary}"}


def run_triage(text: str, subject: str) -> dict:
    if not text.strip():
        return {"category": 9, "confidence": 0.9, "secondary_category": None, "spam": False,
                "method": "rules", "reasoning": "No legitimate request left after removing injected instructions"}
    try:
        res = llm.triage(text, subject)
    except Exception as exc:  # fall back to rules on any model error
        out = rules_triage(text, subject)
        out["fallback_reason"] = f"LLM error: {type(exc).__name__}"
        return out
    if res is None:
        return rules_triage(text, subject)
    return {"category": res.category, "confidence": round(res.confidence, 2),
            "secondary_category": res.secondary_category if res.secondary_category in (1, 2) and res.secondary_category != res.category else None,
            "spam": res.is_spam_or_solicitation, "method": "llm", "reasoning": res.reasoning}
