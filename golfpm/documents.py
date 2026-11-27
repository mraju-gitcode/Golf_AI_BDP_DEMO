"""Builds the synthetic document library the client referenced (Behavior Specification
and Design Canvas): guides, manuals, catalog, bulletins, policies, process documents,
RGA reports, council deck, tribal-knowledge notes, the daily backlog report, the
price list, and the attachments customers send in the test cases.

The markdown in data/kb is the source text. This renders it to real PDF / DOCX
files, builds XLSX exports from the synthetic order data, and writes a manifest
the UI lists on the Knowledge Sources page.

    python -m golfpm.documents
"""
from __future__ import annotations

import json
import re

from .config import DATA, KB_DIR, ORDERS

OUT = DATA / "documents"
BANNER = "SYNTHETIC DEMO DOCUMENT - invented content for the GolfPM Assist demo. Not Rain Bird guidance."
GREEN = "#018752"


def parse_md(path) -> tuple[dict, list[tuple[str, str]]]:
    raw = path.read_text()
    _, front, body = raw.split("---", 2)
    meta = {}
    for line in front.strip().splitlines():
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip()
    sections = []
    for block in re.split(r"^## ", body, flags=re.M)[1:]:
        heading, _, text = block.partition("\n")
        sections.append((heading.strip(), text.strip()))
    return meta, sections


# ---------------- renderers ----------------
def render_pdf(path, title, meta_line, sections):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    ss = getSampleStyleSheet()
    green = colors.HexColor(GREEN)
    h1 = ParagraphStyle("h1", parent=ss["Title"], textColor=green, alignment=0, fontSize=18, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=green, fontSize=12.5, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=10, leading=14)
    small = ParagraphStyle("s", parent=body, fontSize=8.5, textColor=colors.HexColor("#6F7F77"))
    story = []
    banner = Table([[Paragraph(f"<b>{BANNER}</b>", ParagraphStyle("w", parent=small, textColor=colors.white))]],
                   colWidths=[7 * inch])
    banner.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), green), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                                ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    story += [banner, Spacer(1, 12), Paragraph(title, h1), Paragraph(meta_line, small), Spacer(1, 8)]
    for heading, text in sections:
        story.append(Paragraph(heading, h2))
        for line in text.splitlines():
            if line.strip():
                story.append(Paragraph(line.strip().replace("&", "&amp;"), body))
    doc = SimpleDocTemplate(str(path), pagesize=letter, title=title, author="Boston Data Pro (synthetic demo)",
                            leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    doc.build(story)


def render_docx(path, title, meta_line, sections):
    from docx import Document
    from docx.shared import Pt, RGBColor

    d = Document()
    p = d.add_paragraph()
    r = p.add_run(BANNER)
    r.bold, r.font.size, r.font.color.rgb = True, Pt(8), RGBColor(0x01, 0x87, 0x52)
    h = d.add_heading(title, level=1)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x01, 0x87, 0x52)
    m = d.add_paragraph(meta_line)
    m.runs[0].font.size = Pt(8.5)
    for heading, text in sections:
        d.add_heading(heading, level=2)
        for line in text.splitlines():
            if line.strip():
                d.add_paragraph(line.strip())
    d.core_properties.author = "Boston Data Pro (synthetic demo)"
    d.core_properties.title = title
    d.save(path)


def _xlsx(path, title, headers, rows, note):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]
    ws.append([BANNER])
    ws.append([note])
    ws.append([])
    ws.append(headers)
    for c in ws[4]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=GREEN.lstrip("#"))
    for row in rows:
        ws.append(row)
    ws["A1"].font = Font(bold=True, color=GREEN.lstrip("#"))
    for col in ws.columns:
        ws.column_dimensions[col[3].column_letter].width = max(12, min(40, max(len(str(c.value or "")) for c in col[3:]) + 2))
    wb.save(path)


# ---------------- build ----------------
def build() -> list[dict]:
    (OUT / "knowledge").mkdir(parents=True, exist_ok=True)
    (OUT / "exports").mkdir(parents=True, exist_ok=True)
    (OUT / "attachments").mkdir(parents=True, exist_ok=True)
    manifest = []

    for md in sorted(KB_DIR.glob("*.md")):
        meta, sections = parse_md(md)
        fmt = meta.get("format", "pdf")
        name = f"{md.stem}.{fmt}"
        meta_line = (f"{meta.get('doc_type', '')} | Owner: {meta.get('owner', '')} | "
                     f"Location: {meta.get('location', '')} | Updated: {meta.get('updated', '')}")
        (render_docx if fmt == "docx" else render_pdf)(OUT / "knowledge" / name, meta["title"], meta_line, sections)
        manifest.append({
            "id": meta["id"], "title": meta["title"], "file": f"knowledge/{name}", "format": fmt,
            "doc_type": meta.get("doc_type"), "owner": meta.get("owner"), "location": meta.get("location"),
            "updated": meta.get("updated"), "audience": meta.get("audience", "internal"),
            "indexed": meta.get("index", "true") != "false", "sections": [h for h, _ in sections],
            "usage": _usage(meta),
        })

    # Daily backlog and backorder report (Adriana), built from the synthetic order feed
    rows = [[o["order_no"], o["customer_po"], o["sold_to"], o["ship_to"], o["status"], o["ship_date"] or "",
             o["carrier"] or "", o["tracking"] or "", o["lines"], o["internal_note"]] for o in ORDERS["orders"]]
    _xlsx(OUT / "exports" / "daily_backlog_report.xlsx", "Backlog and backorders",
          ["Order", "Customer PO", "Sold to", "Ship to", "Status", "Ship date", "Carrier", "Tracking", "Lines", "Internal note"],
          rows, f"RBMG_ORDERS_BY_DATE daily export, as of {ORDERS['as_of']}. Prepared by Adriana Romero (synthetic).")
    manifest.append({"id": "EXP-BACKLOG", "title": "Daily Backlog and Backorder Report (Adriana)", "file": "exports/daily_backlog_report.xlsx",
                     "format": "xlsx", "doc_type": "Data export", "owner": "Adriana Romero (Operations)",
                     "location": "PeopleSoft query RBMG_ORDERS_BY_DATE, emailed daily", "updated": ORDERS["as_of"][:10],
                     "audience": "internal", "indexed": False, "sections": [],
                     "usage": "Order status agent looks up orders read-only. Internal notes never leave the building."})

    # Published price list: deliberately NOT indexed; pricing always goes to Sales
    prices = [["RB-7710", "Golf rotor, full circle", 189.00], ["RB-7712", "Golf rotor, part circle", 196.00],
              ["RB-5520", "Decoder, single station", 142.00], ["RB-9100", "Golf valve", 315.00],
              ["RB-4475", "Nozzle retainer (replaces RB-4471)", 6.50], ["RB-4485", "Nozzle set with adapter (replaces RB-4480)", 24.00]]
    _xlsx(OUT / "exports" / "price_list_2026.xlsx", "Price list 2026", ["Part", "Description", "List price USD"], prices,
          "Published golf price list 2026 (synthetic). NOT indexed: the agent never quotes prices.")
    manifest.append({"id": "EXP-PRICES", "title": "Published Golf Price List 2026", "file": "exports/price_list_2026.xlsx",
                     "format": "xlsx", "doc_type": "Price list", "owner": "Golf Sales Operations", "location": "Box: Golf / Price Lists",
                     "updated": "2026-01-05", "audience": "internal", "indexed": False, "sections": [],
                     "usage": "Excluded from the agent by policy. Pricing questions are routed to Sales."})

    # Attachments customers send in the test cases
    render_pdf(OUT / "attachments" / "warranty_form_lakeview.pdf", "Golf Warranty Information Form (completed)",
               "Attached to TC-08 by ops@lakeviewgolf.example.com", [
                   ("Course and contact", "Course: Lakeview Golf Club\nContact: Sam Ortiz, 555-0177, ops@lakeviewgolf.example.com\nDistributor: Fairway Irrigation Supply"),
                   ("Products affected", "RB-7710 x 8\nInstallation date: 2025-04-10\nDate code: 2291"),
                   ("Failure description", "Rotors stopped rotating after one season on holes 3 and 4. Photos attached to the email.")])
    render_pdf(OUT / "attachments" / "PO_55240.pdf", "Purchase Order 55240", "Attached to TC-27 by purchasing@fairwayirrigation.example.com", [
        ("Buyer", "Fairway Irrigation Supply, Purchasing"),
        ("Ship to", "Lakeview Golf Club, renovation project"),
        ("Lines", "RB-7710 golf rotor x 60\nRB-7712 golf rotor x 24\nRB-5520 decoder x 84"),
        ("Requested ship date", "2 March 2027")])
    _xlsx(OUT / "attachments" / "equipment_schedule_willow_creek.xlsx", "Equipment schedule",
          ["Item", "Description", "Quantity"],
          [["RB-7710", "Golf rotor, full circle", 420], ["RB-7712", "Golf rotor, part circle", 180],
           ["RB-5520", "Decoder", 600], ["Central control", "CirrusPRO central control", 1]],
          "Willow Creek GC 18-hole renovation, attached to TC-29 by Greenline Golf Construction (synthetic).")
    for f, title, tc in (("warranty_form_lakeview.pdf", "Completed warranty form (Lakeview)", "TC-08"),
                         ("PO_55240.pdf", "Purchase order 55240 (Fairway)", "TC-27"),
                         ("equipment_schedule_willow_creek.xlsx", "Equipment schedule (Willow Creek RFQ)", "TC-29")):
        manifest.append({"id": f"ATT-{tc}", "title": title, "file": f"attachments/{f}", "format": f.rsplit(".", 1)[1],
                         "doc_type": "Customer attachment", "owner": "Customer", "location": f"Email attachment on {tc}",
                         "updated": "2026-11-27", "audience": "customer", "indexed": False, "sections": [],
                         "usage": "Never opened by the agent. Known form types are read by the sandboxed extractor; others are forwarded unchanged."})

    (OUT / "manifest.json").write_text(json.dumps({"documents": manifest}, indent=2))
    return manifest


def _usage(meta: dict) -> str:
    if meta.get("index") == "false":
        return "Sent to customers on request; not searched by the agent."
    if meta.get("audience") == "public":
        return "Searched by the agents and cited in customer replies with a link."
    return "Informs CSR case summaries; never quoted or linked to customers (T-A2)."


def load_manifest() -> list[dict]:
    path = OUT / "manifest.json"
    return json.loads(path.read_text())["documents"] if path.exists() else []


if __name__ == "__main__":
    docs = build()
    print(f"Built {len(docs)} documents in data/documents")
