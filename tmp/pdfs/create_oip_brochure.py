from math import cos, sin, pi, atan2
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUT = Path("outputs/OIP_Customer_Support_Brochure.pdf")

PAGE_W, PAGE_H = letter
M = 46

INK = colors.HexColor("#17211F")
MUTED = colors.HexColor("#5F6D67")
CREAM = colors.HexColor("#F6F1E8")
PAPER = colors.HexColor("#FFFDF7")
SAGE = colors.HexColor("#769985")
DARK_SAGE = colors.HexColor("#35594C")
BLUE = colors.HexColor("#2F6F89")
LIGHT_BLUE = colors.HexColor("#DCEEF2")
AMBER = colors.HexColor("#DFA64A")
LIGHT_AMBER = colors.HexColor("#F6E6C8")
CORAL = colors.HexColor("#C96B5C")
LINE = colors.HexColor("#D8D0C2")
WHITE = colors.white


def setup_page(c, page, title=None, dark=False):
    c.setFillColor(DARK_SAGE if dark else PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    if title:
        c.setFillColor(WHITE if dark else MUTED)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(M, PAGE_H - 28, title.upper())
    c.setFillColor(WHITE if dark else MUTED)
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - M, 24, f"Organizational Intelligence Platform / {page}")


def text_lines(text, font, size, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = word if not current else f"{current} {word}"
        if stringWidth(test, font, size) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(c, text, x, y, w, size=10, leading=14, font="Helvetica", color=INK):
    c.setFillColor(color)
    c.setFont(font, size)
    for line in text_lines(text, font, size, w):
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_heading(c, text, x, y, w, size=28, color=INK):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", size)
    lines = text_lines(text, "Helvetica-Bold", size, w)
    for line in lines:
        c.drawString(x, y, line)
        y -= size + 7
    return y


def draw_kicker(c, text, x, y, color=AMBER):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y, text.upper())


def round_rect(c, x, y, w, h, fill, stroke=None, radius=12, lw=1):
    c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(lw)
        c.roundRect(x, y, w, h, radius, stroke=1, fill=1)
    else:
        c.roundRect(x, y, w, h, radius, stroke=0, fill=1)


def pill(c, text, x, y, fill=LIGHT_BLUE, color=BLUE):
    w = c.stringWidth(text, "Helvetica-Bold", 8) + 18
    round_rect(c, x, y - 3, w, 17, fill, None, 8)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(color)
    c.drawString(x + 9, y + 2, text)
    return w


def card(c, x, y, w, h, title, body, fill=WHITE, accent=SAGE, title_size=11, body_size=8.5):
    round_rect(c, x, y, w, h, fill, LINE, 12)
    c.setFillColor(accent)
    c.rect(x, y + h - 5, w, 5, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", title_size)
    c.drawString(x + 14, y + h - 25, title)
    draw_wrapped(c, body, x + 14, y + h - 42, w - 28, body_size, body_size + 3, "Helvetica", MUTED)


def arrow(c, x1, y1, x2, y2, color=SAGE, lw=1.8):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(lw)
    c.line(x1, y1, x2, y2)
    angle = atan2(y2 - y1, x2 - x1)
    size = 7
    p1 = (x2, y2)
    p2 = (x2 - size * cos(angle - pi / 6), y2 - size * sin(angle - pi / 6))
    p3 = (x2 - size * cos(angle + pi / 6), y2 - size * sin(angle + pi / 6))
    c.line(p1[0], p1[1], p2[0], p2[1])
    c.line(p1[0], p1[1], p3[0], p3[1])


def small_icon(c, x, y, label, fill, color=INK):
    round_rect(c, x, y, 66, 56, fill, None, 12)
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(x + 33, y + 31, label[:2].upper())
    c.setFont("Helvetica", 6)
    c.drawCentredString(x + 33, y + 14, label)


def comparison_table(c, x, y, w, rows, headers=("Instead of", "OIP does this")):
    col_w = w / 2
    row_h = 43
    round_rect(c, x, y - row_h * (len(rows) + 1), w, row_h * (len(rows) + 1), WHITE, LINE, 12)
    c.setFillColor(DARK_SAGE)
    c.roundRect(x, y - row_h, w, row_h, 12, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 14, y - 26, headers[0])
    c.drawString(x + col_w + 14, y - 26, headers[1])
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(x + col_w, y - row_h, x + col_w, y - row_h * (len(rows) + 1))
    for i, (a, b) in enumerate(rows):
        yy = y - row_h * (i + 2)
        c.line(x, yy + row_h, x + w, yy + row_h)
        draw_wrapped(c, a, x + 14, yy + 26, col_w - 28, 8.3, 10.5, "Helvetica", INK)
        draw_wrapped(c, b, x + col_w + 14, yy + 26, col_w - 28, 8.3, 10.5, "Helvetica", INK)


def page_cover(c):
    setup_page(c, 1, dark=True)
    c.setFillColor(colors.HexColor("#29493E"))
    c.circle(PAGE_W - 70, PAGE_H - 78, 160, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor("#8DB69E"))
    c.setLineWidth(1.2)
    for r in [52, 82, 112]:
        c.circle(PAGE_W - 70, PAGE_H - 78, r, stroke=1, fill=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(M, PAGE_H - 75, "ORGANIZATIONAL INTELLIGENCE PLATFORM")
    y = draw_heading(
        c,
        "Every day, your best people solve problems your company may forget by next quarter.",
        M,
        PAGE_H - 145,
        440,
        34,
        WHITE,
    )
    y -= 10
    draw_wrapped(
        c,
        "An Organizational Intelligence Platform turns everyday support work into governed organizational memory, so the institution becomes more capable through every validated decision.",
        M,
        y,
        430,
        13,
        18,
        "Helvetica",
        colors.HexColor("#EAF3EC"),
    )
    y -= 95
    round_rect(c, M, y - 86, 318, 86, colors.HexColor("#F9F1DE"), None, 16)
    draw_wrapped(
        c,
        "Recurring example: imagine a mid-sized e-commerce company whose support team handles product questions, shipping exceptions, refunds, and policy edge cases every day.",
        M + 18,
        y - 25,
        280,
        10,
        14,
        "Helvetica",
        INK,
    )
    c.setFillColor(WHITE)
    c.setFont("Helvetica", 9)
    c.drawString(M, 62, "A plain-language buyer brochure for support, CX, operations, investors, and partners.")


def page_problem(c):
    setup_page(c, 2, "The Problem")
    draw_kicker(c, "The Problem: Organizational Entropy", M, PAGE_H - 66)
    y = draw_heading(c, "The case closes. The lesson often disappears.", M, PAGE_H - 96, 420, 27)
    y -= 6
    draw_wrapped(
        c,
        "Picture the e-commerce support team. A customer asks about a refund exception after a delayed shipment. A senior agent investigates, checks policy, finds the right answer, and calms the customer. A month later, another agent faces the same situation and starts from scratch.",
        M,
        y,
        360,
        10.6,
        14.8,
        "Helvetica",
        INK,
    )
    y -= 92
    card(
        c,
        M,
        y - 98,
        355,
        98,
        "Organizational Entropy",
        "The natural decay of institutional knowledge, context, memory, and decision quality as work spreads across people, systems, time, and tools.",
        LIGHT_AMBER,
        AMBER,
        12,
        9.2,
    )
    # Fragmentation visual
    cx, cy = 425, 382
    round_rect(c, cx - 42, cy - 25, 84, 50, DARK_SAGE, None, 14)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(cx, cy + 4, "Solved")
    c.drawCentredString(cx, cy - 9, "case")
    fragments = [
        ("Ticket archive", 302, 287, LIGHT_BLUE),
        ("Chat thread", 429, 265, LIGHT_AMBER),
        ("Old article", 470, 345, colors.HexColor("#E7E1D3")),
        ("Senior agent", 410, 446, colors.HexColor("#E5F0E8")),
        ("Manager note", 470, 510, colors.HexColor("#F0DDDA")),
    ]
    for label, x, y2, fill in fragments:
        arrow(c, cx, cy - 5, x + 42, y2 + 24, LINE, 1.2)
        round_rect(c, x, y2, 86, 48, fill, LINE, 12)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x + 43, y2 + 27, label)
        c.setFont("Helvetica", 6.5)
        c.setFillColor(MUTED)
        c.drawCentredString(x + 43, y2 + 14, "partial memory")
    card(
        c,
        320,
        140,
        235,
        110,
        "What leaders see",
        "Slow answers, repeated escalations, inconsistent responses, stale documentation, onboarding drag, and senior experts interrupted for the same questions.",
        WHITE,
        CORAL,
        11,
        8.7,
    )
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(M, 80, "The issue is not that the team lacks effort. The issue is that learning has nowhere durable to go.")


def page_definition(c):
    setup_page(c, 3, "What This Actually Is")
    draw_kicker(c, "What This Actually Is", M, PAGE_H - 66)
    y = draw_heading(c, "Not another chatbot. Not another archive.", M, PAGE_H - 96, 445, 28)
    y -= 4
    draw_wrapped(
        c,
        "An Organizational Intelligence Platform is a software platform that captures meaningful work, preserves evidence, supports reasoning, enables human review, validates learning, and stores that learning as durable organizational memory.",
        M,
        y,
        358,
        10.7,
        15,
    )
    card(
        c,
        413,
        520,
        145,
        105,
        "Organizational Memory",
        "Validated, reusable knowledge the company can trust and act on. It is different from a document dump, chat log, or old ticket archive.",
        LIGHT_BLUE,
        BLUE,
        10.8,
        8.2,
    )
    rows = [
        ("A help desk manages support work.", "OIP learns from support work."),
        ("A knowledge base stores articles.", "OIP keeps knowledge current through reviewed learning."),
        ("Search finds existing information.", "OIP helps determine what is valid, current, and reusable."),
        ("A chatbot answers a conversation.", "OIP preserves the lesson so future work improves."),
        ("Automation asks: can we finish faster?", "OIP asks: did the organization become more capable?"),
    ]
    comparison_table(c, M, 455, PAGE_W - 2 * M, rows, ("Common category", "Organizational Intelligence Platform"))
    # Layer visual
    y0 = 74
    labels = [("Help desk", 70), ("Docs", 166), ("Chat", 262), ("CRM", 358), ("People", 454)]
    for label, x in labels:
        round_rect(c, x, y0, 78, 38, colors.HexColor("#EEE8DD"), LINE, 10)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x + 39, y0 + 21, label)
        arrow(c, x + 39, y0 + 44, x + 39, y0 + 80, LINE, 1)
    round_rect(c, 76, y0 + 86, 454, 48, DARK_SAGE, None, 15)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(303, y0 + 113, "Governed learning layer: evidence + review + validated memory")


def page_flywheel(c):
    setup_page(c, 4, "How It Works")
    draw_kicker(c, "How It Works: The Knowledge Flywheel", M, PAGE_H - 66)
    y = draw_heading(c, "Solved work becomes better future work.", M, PAGE_H - 96, 380, 27)
    y -= 3
    draw_wrapped(
        c,
        "The Knowledge Flywheel is the loop through which work creates validated memory, memory improves future reasoning, and improved reasoning creates further knowledge. Here is the loop using the e-commerce support example.",
        M,
        y,
        360,
        10.2,
        14.2,
    )
    card(
        c,
        M,
        126,
        210,
        78,
        "Knowledge Candidate",
        "Proposed reusable knowledge awaiting validation. It may be useful, but it is not official memory yet.",
        LIGHT_AMBER,
        AMBER,
        10.5,
        8.2,
    )
    card(
        c,
        230,
        126,
        210,
        78,
        "Knowledge Item",
        "Reusable organizational knowledge that has earned a defined trust state through review.",
        LIGHT_BLUE,
        BLUE,
        10.5,
        8.2,
    )
    # Circular flywheel
    cx, cy, r = 393, 430, 142
    steps = [
        ("1", "A tricky\nquestion"),
        ("2", "Evidence\ncaptured"),
        ("3", "Candidate\nlesson"),
        ("4", "Human\nreview"),
        ("5", "Validated\nmemory"),
        ("6", "Better next\ncase"),
    ]
    points = []
    for i, (num, label) in enumerate(steps):
        angle = pi / 2 - i * 2 * pi / len(steps)
        x = cx + r * cos(angle)
        y2 = cy + r * sin(angle)
        points.append((x, y2))
    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]
        arrow(c, x1 + (x2 - x1) * 0.25, y1 + (y2 - y1) * 0.25, x1 + (x2 - x1) * 0.78, y1 + (y2 - y1) * 0.78, SAGE, 1.5)
    for (num, label), (x, y2) in zip(steps, points):
        round_rect(c, x - 45, y2 - 29, 90, 58, WHITE, LINE, 13)
        c.setFillColor(DARK_SAGE)
        c.circle(x - 30, y2 + 15, 10, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x - 30, y2 + 12, num)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 8.5)
        lines = label.split("\n")
        c.drawCentredString(x + 12, y2 + 6, lines[0])
        c.drawCentredString(x + 12, y2 - 8, lines[1])
    c.setFillColor(DARK_SAGE)
    c.circle(cx, cy, 48, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(cx, cy + 6, "Learning")
    c.drawCentredString(cx, cy - 9, "compounds")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(M, 92, "A resolved refund exception should not become one more old ticket. It should become evidence for a reviewed lesson the next agent can trust.")


def page_human_control(c):
    setup_page(c, 5, "Why Humans Stay in Control")
    draw_kicker(c, "Why Humans Stay in Control", M, PAGE_H - 66)
    y = draw_heading(c, "Human Review is a trust mechanism, not a speed bump.", M, PAGE_H - 96, 440, 27)
    y -= 4
    draw_wrapped(
        c,
        "Human Review means an accountable person reviews proposed knowledge before the organization treats it as trusted memory. AI can summarize evidence, suggest wording, or identify patterns. It cannot decide what the company officially knows.",
        M,
        y,
        358,
        10.5,
        14.8,
    )
    card(
        c,
        410,
        506,
        150,
        92,
        "Governance",
        "The rules for who can see, change, validate, or apply knowledge in a given context.",
        colors.HexColor("#E5F0E8"),
        SAGE,
        10.5,
        8.4,
    )
    # Gate diagram
    ymid = 350
    round_rect(c, 55, ymid - 45, 120, 90, LIGHT_AMBER, LINE, 15)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(115, ymid + 10, "Candidate")
    c.drawCentredString(115, ymid - 6, "lesson")
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawCentredString(115, ymid - 26, "suggested, not trusted")
    arrow(c, 185, ymid, 255, ymid, SAGE, 2)
    round_rect(c, 265, ymid - 55, 118, 110, DARK_SAGE, None, 16)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(324, ymid + 21, "Human")
    c.drawCentredString(324, ymid + 5, "Review")
    c.setFont("Helvetica", 7)
    c.drawCentredString(324, ymid - 18, "approve, revise,")
    c.drawCentredString(324, ymid - 30, "reject, or escalate")
    arrow(c, 393, ymid, 463, ymid, SAGE, 2)
    round_rect(c, 475, ymid - 45, 95, 90, LIGHT_BLUE, LINE, 15)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(522, ymid + 10, "Validated")
    c.drawCentredString(522, ymid - 5, "memory")
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawCentredString(522, ymid - 25, "trusted for reuse")
    # Concern box
    round_rect(c, M, 115, PAGE_W - 2 * M, 120, WHITE, LINE, 16)
    c.setFillColor(CORAL)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(M + 18, 205, "The simple answer to 'will AI make things up?'")
    draw_wrapped(
        c,
        "The platform should not let a fluent suggestion become organizational truth. If evidence is missing, stale, conflicting, or outside policy, the system should show uncertainty and route the work toward human judgment.",
        M + 18,
        181,
        488,
        10.2,
        14.4,
        "Helvetica",
        INK,
    )
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(DARK_SAGE)
    c.drawString(M + 18, 132, "Provenance:")
    draw_wrapped(
        c,
        "the traceable history of where knowledge came from, how it changed, who reviewed it, and why it should be trusted.",
        M + 92,
        132,
        405,
        9,
        12,
        "Helvetica",
        MUTED,
    )


def page_team_change(c):
    setup_page(c, 6, "What Changes For Your Team")
    draw_kicker(c, "What Changes For Your Team", M, PAGE_H - 66)
    y = draw_heading(c, "Support stops being only a queue. It becomes a learning system.", M, PAGE_H - 96, 455, 27)
    y -= 4
    draw_wrapped(
        c,
        "For a Customer Support leader, the practical shift is not mystical. The same cases still arrive. The difference is that useful lessons are captured, reviewed, and reused instead of disappearing into old tickets.",
        M,
        y,
        455,
        10.5,
        14.5,
    )
    rows = [
        ("Agents search tickets, docs, and chat to reconstruct context.", "Agents start from validated memory and similar reviewed cases."),
        ("Senior experts repeat the same explanations.", "Expert judgment becomes reusable guidance after review."),
        ("Knowledge managers guess which articles are stale.", "Real support work shows gaps, conflicts, and candidates to review."),
        ("Managers measure volume but struggle to see learning.", "Managers can inspect reuse, review, gaps, and repeated-work signals."),
        ("New hires learn by interrupting experienced teammates.", "New hires inherit trusted explanations, evidence, and history."),
    ]
    comparison_table(c, M, 500, PAGE_W - 2 * M, rows, ("Before", "After"))
    small_icon(c, 72, 85, "Agent", LIGHT_BLUE)
    small_icon(c, 172, 85, "Lead", colors.HexColor("#E5F0E8"))
    small_icon(c, 272, 85, "Reviewer", LIGHT_AMBER)
    small_icon(c, 372, 85, "Manager", colors.HexColor("#F0DDDA"))
    small_icon(c, 472, 85, "CX", colors.HexColor("#EEE8DD"))
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(M, 55, "The promise is not fewer humans. It is better use of human expertise.")


def page_next(c):
    setup_page(c, 7, "Where This Goes Next")
    draw_kicker(c, "Where This Goes Next", M, PAGE_H - 66)
    y = draw_heading(c, "Customer Support is the first proving ground, not the final category.", M, PAGE_H - 96, 455, 27)
    y -= 4
    draw_wrapped(
        c,
        "Support is where organizational forgetting is easy to see: repeated questions, policy exceptions, product confusion, onboarding drag, and expert bottlenecks. Once the learning loop is proven there, the same pattern can apply to IT, HR, finance, legal, operations, healthcare administration, education, and public services.",
        M,
        y,
        470,
        10.5,
        14.5,
    )
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(M, 466, "The Three Knowledge Doors")
    draw_wrapped(
        c,
        "Three ways knowledge can enter one governed memory system. Each door creates candidates first; none writes directly into trusted memory.",
        M,
        446,
        395,
        9,
        12.5,
        "Helvetica",
        MUTED,
    )
    doors = [
        ("Manual Entry", "An expert teaches the organization something that was never written down.", 62, LIGHT_BLUE, BLUE),
        ("Historical Import", "Old tickets, documents, and archives rejoin the living system as low-trust clues.", 235, LIGHT_AMBER, AMBER),
        ("Live Workflow Capture", "Knowledge is captured while real work is happening and context is fresh.", 408, colors.HexColor("#E5F0E8"), DARK_SAGE),
    ]
    for title, body, x, fill, accent in doors:
        round_rect(c, x, 238, 142, 154, fill, LINE, 18)
        c.setFillColor(accent)
        c.rect(x + 18, 238, 106, 10, stroke=0, fill=1)
        c.setFillColor(accent)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(x + 71, 352, title)
        draw_wrapped(c, body, x + 16, 324, 110, 8.4, 11.5, "Helvetica", INK)
        c.setStrokeColor(accent)
        c.setLineWidth(2)
        c.roundRect(x + 31, 258, 80, 120, 36, stroke=1, fill=0)
    arrow(c, 132, 220, 300, 168, SAGE, 1.8)
    arrow(c, 306, 220, 300, 168, SAGE, 1.8)
    arrow(c, 480, 220, 300, 168, SAGE, 1.8)
    round_rect(c, 192, 113, 220, 60, DARK_SAGE, None, 18)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(302, 146, "One trusted Organizational Memory")
    c.setFont("Helvetica", 8)
    c.drawCentredString(302, 130, "validated, governed, reusable")


def page_close(c):
    setup_page(c, 8, "Closing")
    draw_kicker(c, "Closing / Simple Next Step", M, PAGE_H - 66)
    y = draw_heading(c, "The next time your team solves something hard, make sure the company learns.", M, PAGE_H - 96, 455, 29)
    y -= 8
    draw_wrapped(
        c,
        "A good pilot does not need to start with every workflow. Start with one recurring support issue family where the answer requires judgment, evidence, and review. Connect the work. Capture candidate lessons. Review them. Reuse the validated memory. Then ask whether future cases became clearer, faster, and more consistent.",
        M,
        y,
        445,
        10.5,
        14.6,
    )
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(M, 450, "Plain-language glossary")
    terms = [
        ("Organizational Entropy", "Knowledge decay as work spreads across people, systems, tools, and time."),
        ("Organizational Memory", "Validated reusable knowledge the company can trust and act on."),
        ("Knowledge Flywheel", "Work creates evidence, evidence creates candidates, review creates memory, memory improves future work."),
        ("Knowledge Candidate", "A proposed lesson. Useful maybe; trusted not yet."),
        ("Knowledge Item", "A reviewed piece of reusable knowledge with a defined trust state."),
        ("Human Review", "The accountable checkpoint before knowledge becomes official memory."),
    ]
    x1, x2 = M, 320
    y0 = 418
    for i, (term, body) in enumerate(terms):
        x = x1 if i % 2 == 0 else x2
        yy = y0 - (i // 2) * 88
        card(c, x, yy - 66, 245, 66, term, body, WHITE, SAGE if i % 2 == 0 else BLUE, 9.5, 7.6)
    round_rect(c, M, 78, PAGE_W - 2 * M, 88, DARK_SAGE, None, 18)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(M + 22, 130, "Talk to us about a pilot.")
    draw_wrapped(
        c,
        "Bring one repeated support problem, one reviewer, and a willingness to test whether governed memory can reduce repeated work.",
        M + 22,
        108,
        410,
        10,
        13,
        "Helvetica",
        colors.HexColor("#EAF3EC"),
    )
    pill(c, "Memory before automation", 408, 128, LIGHT_AMBER, INK)
    pill(c, "AI as amplifier, not authority", 408, 102, LIGHT_BLUE, INK)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=letter)
    pages = [
        page_cover,
        page_problem,
        page_definition,
        page_flywheel,
        page_human_control,
        page_team_change,
        page_next,
        page_close,
    ]
    for p in pages:
        p(c)
        c.showPage()
    c.save()


if __name__ == "__main__":
    main()
