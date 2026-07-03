# OIP Demo Script — Organizational Learning Platform

**Story in one sentence:**
OIP does not start as a know-it-all chatbot. It starts empty, learns from approved human work, tracks where every answer came from, earns trust over time, and eventually resolves tickets automatically — without live AI.

---

## Setup

Before the demo, do a full **Reset Organization** to start from zero:
- No seeded knowledge
- No seeded tickets
- All metrics at zero

This is intentional. The power of the demo is watching the organization learn from scratch.

---

## Act 1 — The First Ticket (Path A: Create New Knowledge)

**Step 1 — Start**

Click **Start** and enter this custom ticket in the text box:

> "I reset my password but I still cannot log in. The site just says my credentials are invalid."

Click **Start with my ticket**.

**What to say:**
> "This is a brand new organization. No memory, no approved knowledge, nothing. OIP starts cold."

---

**Step 2 — Analysis (Step 3 in the app)**

Click **Analyze ticket**.

OIP will identify:
- Category: **Login**
- Canonical Problem: **Login Issue**
- Signals: `log in`, `password`, `credentials`

**What to say:**
> "OIP identified this as a Login issue. It used deterministic rules — no AI call needed for this."

---

**Step 3 — Memory Retrieval (Step 4)**

Click **Retrieve memory**.

Result: **0 knowledge matches found**

**What to say:**
> "No organizational memory yet. OIP can't reuse anything because nothing has been approved."

---

**Step 4 — Draft Response (Step 5)**

Click **Generate draft response**.

At the bottom of this screen, the **Why this response?** panel will show:
> "No approved knowledge available yet — response drafted from the category template."

**What to say:**
> "The draft is based on the Login category template. Notice OIP is transparent about where the answer came from."

---

**Step 5 — Human Review (Step 6)**

Click **Review response**, then approve the draft as-is or with minor edits.

Click **Approve and Save as Knowledge**.

**What to say:**
> "A human reviews the response before it becomes organizational knowledge. Nothing goes into memory without a human approval."

---

**Step 6 — Resolution Approved (Step 7)**

OIP shows a **Reflection Preview**:
- Learning Event: **Yes**
- Action: **New Knowledge Entry**
- Rationale: No existing knowledge matched — this will be the first entry.

Click **View Reflection Analysis**.

**What to say:**
> "OIP doesn't save blindly. It first reflects: Is this worth saving? Is it new? Does it improve what we already know?"

---

**Step 7 — Reflection (Step 8)**

The Reflection panel shows:
- **New Knowledge Entry** — creates the organization's first approved knowledge for Login issues
- Trust will start at 20/100 (Learning state)

Click **Confirm & Save to Org Memory**.

**What to say:**
> "The reflection decided this is a genuine learning event. The organization now has its first approved knowledge entry."

---

**Step 8 — Organizational Memory Updated (Step 9)**

The knowledge base shows **Login Issue**:
- Trust: 20/100 (Learning)
- Version 1
- 1 supporting ticket
- Provenance: links back to the original ticket and human approval

**What to say:**
> "The knowledge is live. It has a version number, a source ticket, and a trust score. The organization remembers where this answer came from."

---

## Act 2 — The Same Issue Again (Path B: Trust Confirmed)

**Still on Step 9 — Organizational Memory Updated**

In the **Try a similar ticket** box, enter:

> "I just changed my password and now I cannot sign in at all. It keeps rejecting my credentials."

Click **Process reuse ticket**.

OIP will:
1. Detect category: Login
2. Retrieve: Login Issue (80%+ match)
3. Evaluate trust: 20/100 — Human Review required

**What to say:**
> "OIP found the Login Issue knowledge immediately. But trust is only 20 — it still needs a human to confirm."

The human approves the reuse → trust increases.

**After trust grows (run it 3–4 times):**

Eventually trust exceeds the auto-resolution threshold (default 80/100). OIP resolves automatically.

**What to say:**
> "After 3–4 confirmed resolutions, trust crossed 80. OIP now resolves Login tickets automatically — no human needed, no live AI."

---

## Act 3 — An Improved Answer (Path C: Knowledge Evolves)

**Reset Session** (keeps the Login Issue knowledge) and enter:

> "I reset my password but still cannot log in. The error says my account is locked."

Go through the full workflow. In **Human Review**, edit the draft to add:

> "Also, please wait 10 minutes after a failed login attempt — accounts are temporarily locked after 5 failed tries. Then try resetting your password again."

Click **Approve and Save as Knowledge**.

In the **Reflection** step:
- OIP detects: same Login Issue, but the response is meaningfully different
- Action: **Improved Version**
- A new version (v2) is created

**What to say:**
> "OIP detected that this human-approved response adds new information the previous version didn't have. Instead of overwriting, it creates Version 2 — and preserves Version 1. The organization's knowledge evolved."

---

## The 4 Reflection Paths (Summary for Q&A)

| Path | When it happens | What OIP does |
|------|----------------|---------------|
| **New Knowledge Entry** | No matching knowledge exists | Creates the first entry for this problem type |
| **Trust Confirmed** | Same problem, same solution approved again | No new content — trust score increases |
| **Improved Version** | Same problem, meaningfully better answer | Saves a new version, preserves the old one |
| **Add Supporting Evidence** | Partially matching problem, same solution | Adds the ticket as a supporting case, no new version |

> Path 4 (Add Supporting Evidence) occurs when a ticket matches an existing knowledge entry at 58–79% similarity — typically a problem that is related but not identical.

---

## Key Provenance Questions OIP Can Answer

After any resolved ticket, a support manager can ask:

- "Why did OIP generate this response?" → See **Why this response?** on the Draft Response step
- "Which version of the knowledge was used?" → Version badge on the knowledge item card
- "Which tickets contributed to this knowledge?" → Supporting Tickets in the Provenance panel
- "Who approved this knowledge?" → Resolution Mode badge (Human / Automatic)
- "When was this knowledge last validated?" → Last Updated date in the provenance panel

---

## What makes OIP different from a chatbot

| Chatbot | OIP |
|---------|-----|
| Answers from training data | Answers from approved human work |
| Black box — no provenance | Full provenance — every answer traceable |
| Doesn't improve from your team's decisions | Learns from your team's approved resolutions |
| Confidence is opaque | Trust score is explicit and earned |
| Knows everything on day 1 | Starts empty, earns authority through use |

---

## Demo Tips

- Always **Reset Organization** before a fresh demo run
- Use the **Reset Session** button (not Reset Organization) between Acts 2 and 3 — it preserves org memory while clearing the workflow
- The auto-resolution threshold is 80 by default — you can lower it in the Organization Profile panel to speed up the trust demo
- The **Intelligence Log** (bottom of every screen) shows every decision OIP made and why
