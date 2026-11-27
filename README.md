# CampusFest Sponsor Growth Center

**RISA Labs · Growth APM assignment**
**Submitted by:** Megha Singhal · Roll no. 22AE30035
**Challenge:** B, Sponsorship Growth (maximise sponsorship cash collected before the festival)
**City:** Mumbai

| # | Deliverable | Where |
|---|---|---|
| 1 | Three-slide strategy PDF | [`deliverables/RISA_Growth_APM_Sponsorship_Strategy.pdf`](deliverables/RISA_Growth_APM_Sponsorship_Strategy.pdf) (source: `deliverables/slides.html`) |
| 2 | Working product: analytics dashboard, campaign and task manager, embedded AI analyst | Live link: **https://campusfest-growth-center-nmt1.onrender.com** · code in [`app/`](app/) |
| 3 | README: research, assumptions, calculations, data sources, framework, setup, tools, testing, limitations | This file |

---

## Contents
1. [Why Challenge B and why Mumbai](#1-why-challenge-b-and-why-mumbai)
2. [Research: what the dataset says](#2-research-what-the-dataset-says-sourced-facts)
3. [Assumptions](#3-assumptions-labelled-and-editable-in-the-app)
4. [Target model and calculations (slide 1)](#4-target-model-and-calculations-slide-1)
5. [Prioritisation framework (slide 2)](#5-prioritisation-framework-slide-2-ice-r)
6. [Experiments and thresholds (slide 3)](#6-experiments-and-thresholds-slide-3)
7. [The product](#7-the-product)
8. [The AI analyst](#8-the-ai-analyst)
9. [Testing](#9-testing)
10. [Setup: run it locally](#10-setup-run-it-locally)
11. [Deploy on Render](#11-deploy-on-render)
12. [Tools used](#12-tools-used-and-what-was-reused)
13. [Known limitations](#13-known-limitations)

---

## 1. Why Challenge B and why Mumbai

- **Why B:** sponsorship is a B2B sales pipeline, the same motion RISA runs when it sells to institutions. Its numbers (stage, value, cash) are exact, so the dashboard and the AI analyst can be checked precisely instead of argued about.
- **Why Mumbai:** the funnel is limited by **decision-makers**, not audience. Mumbai has the densest concentration of people who sign sponsorships: FMCG, BFSI, media and D2C marketing teams and their agencies. Meetings take 1–2 days to arrange, which matters because warm deals in the data close in about 10 days.

## 2. Research: what the dataset says (sourced facts)

**Source:** the RISA *Sponsorship Growth Dataset* (Google Sheet → [`data/sponsorship_original.xlsx`](data/sponsorship_original.xlsx) → CSVs in [`app/db/source/`](app/db/source/)). It is synthetic and covers *CampusFest 2025* (12–13 Apr 2025), with records from 15 Jan to 20 Apr 2025. The original file stays in the repo so the chatbot can be tested against it, and `npm run db:reset` restores it at any time.

| Fact | Value | How computed |
|---|---|---|
| Brands / contacts / campaigns | 180 / 270 / 6 | row counts |
| Interactions | 950 unique (953 rows, 3 import retries dropped) | dedupe on `interaction_id` |
| Qualification / opportunity versions | 433 / 228 (1 and 2 retries dropped) | dedupe on `history_id` |
| Opportunities | 58 | |
| Confirmed partnerships (latest stage) | **24**, worth **₹22,40,000** (₹20,00,000 cash, ₹2,40,000 in kind) | latest `opportunity_history` version per opportunity |
| Average confirmed deal | ₹93,333 | 22,40,000 ÷ 24 |
| Targets | 40 qualified / 20 confirmed, revised on 15 Mar to **55 / 28** | `targets.csv` |
| Qualified brands (latest) | 60, which is 109% of 55 | latest qualification per brand |
| Cold outreach | 322 sends → 36 positive replies (11%) → **0 deals** | |
| **Win rate by originating campaign** | Warm intros 8/9 · Creator referrals 9/9 · Partner form 7/7 · **Cold email 0/11 · LinkedIn 0/12 · Revival 0/10** | won ÷ opportunities |
| Warm-entry brands → deals | 44 brands with an intro or inbound form → 24 deals (55%) | |
| Days from opportunity to confirmed | about 10 on average | |
| **Not in the data** | marketing spend, bank receipts, causal effect of activations | flagged in the app and by the chatbot |

**Data-handling rules** (from the dataset's own Read me), all applied in [`app/src/lib/metrics.ts`](app/src/lib/metrics.ts):
1. A snapshot date means the end of that day in IST (`< D+1 00:00 +05:30`). Later records are excluded, so outcomes never leak into earlier snapshots.
2. History tables are full-state: use the latest version per entity at or before the cutoff. Versions are never summed.
3. Identical rows with the same ID are import retries and are dropped. A conflicting payload would be logged (none were found). The log is on the *Assumptions and data* page.
4. Attempts, contacts, responding brands, qualified brands and confirmed deals are different populations. Brand stages count distinct brands; deal stages count opportunities.
5. Confirmed value is **not** cash. Cash collected counts only receipts logged in the app (`app_payment`).

## 3. Assumptions (labelled, and editable in the app)

| Assumption | Value | Why |
|---|---|---|
| Campaign budget / spent / team hours | SC01 ₹1.2L/₹95k · SC02 ₹60k/₹30k · SC03 ₹1.5L/₹1.3L · SC04 ₹80k/₹55k · SC05 ₹90k/₹60k · SC06 ₹40k/₹25k (₹5.4L in total) | The source has no spend. These are plausible tool, data and event costs for a student team |
| Stage win probabilities | prospecting 0.10 · contacted 0.20 · proposal 0.40 · negotiating 0.65 · confirmed 1 | Conservative against the observed 52% proposal-to-win rate |
| Collection rate (forecast) | 80% of confirmed cash collected before the fest | No receipts exist in the source |
| Confirmed-value goal | ₹30L | Source targets are counts only; ≈ 28 deals × ₹1.07L |
| Stall threshold | 14 days without a stage change | Warm deals close in about 10 days |
| Signal thresholds | scale: win ≥ 60% and cost per deal ≤ ₹40k · stop: win < 25% · test more: fewer than 5 closed deals | See slide 3 |

## 4. Target model and calculations (slide 1)

Constants from the data: average deal **A = ₹93,333**, cash share **c = 20,00,000 ÷ 22,40,000 = 0.893**, warm brand-to-deal rate **24 ÷ 44 = 55%**.

**Base case: ₹24.1L cash collected**
- Renewals: 24 past sponsors × 50% = **12 deals**
- New warm entries: 50 brands × 45% (a haircut from 55%) = 22.5 → **22 deals**
- Signed: 34 × ₹93,333 = **₹31.73L** → cash value 31.73 × 0.893 = **₹28.33L** → 85% collected = **₹24.08L**

**Stretch case: ₹48.2L cash collected**
- Renewals: 24 × 70% = 16.8 → **17 deals** at ₹1.1L (tier upsell, +18%) = ₹18.7L
- New warm: 80 × 50% = **40 deals** at ₹1.0L (+7% from tiers) = ₹40.0L (intros 18, creators 14, inbound 8)
- Signed = **₹58.7L** → cash value 58.7 × 0.893 = **₹52.41L** → 92% collected (50% advance at signing) = **₹48.22L**

**Funnel:** prospects 300 / 400 → meetings ~85 / ~140 → proposals ~55 / ~85 → signed 34 / 57 (base / stretch).

**Capacity check:** 2025 needed 60 meetings for 24 deals (2.5 per deal). The stretch needs ~140 meetings in 12 weeks, about 12 a week or 3 per owner per week for 4 owners. Sellable inventory is about 60 slots, so 57 deals is close to the ceiling.

## 5. Prioritisation framework (slide 2): ICE-R

Score = Impact × Confidence × Ease ÷ Risk, each on a 1–5 scale. **Confidence comes from the 2025 win rates**, not opinion.

| Rank | Bet | I | C | E | R | Score | Adds (stretch) | Budget | Call |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Renewal and upsell sprint | 5 | 5 | 5 | 1 | 125 | 17 deals · ₹18.7L | ₹40k | Double down |
| 2 | Alumni and partner intro engine | 5 | 5 | 3 | 1 | 75 | 18 deals · ₹18.0L | ₹60k | Double down |
| 5 | Cash collection discipline | 3 | 4 | 5 | 1 | 60 | protects ≈ ₹3.7L | ₹10k | Always on |
| 3 | Creator and community referrals | 4 | 5 | 3 | 1.5 | 40 | 14 deals · ₹14.0L | ₹90k | Invest |
| 4 | Inbound page and tiered packages | 3 | 4 | 4 | 1.5 | 32 | 8 deals · ₹8.0L | ₹80k | Invest, lean |
| – | Cold email / LinkedIn InMail / revival email | – | 0 of 33 won | – | – | – | – | – | Stop, or keep a 10% test cell |

Value per rupee: renewals 47×, collections 37×, intros 30×, creators 16×, inbound 10×. ₹2.8L is committed and ₹3.2L is held in reserve for whichever bet hits its scale threshold. Bet #5 is numbered last because it adds no deals, but it runs alongside everything because it protects the target metric.

## 6. Experiments and thresholds (slide 3)

The leading chain is: asks and intros → meeting within 7 days → proposal → signed within 21 days → advance within 7 days → cash collected.

| Bet | Scale if | Change if | Stop if |
|---|---|---|---|
| Renewals | renewal ≥ 60% and upsell ≥ 25% | 35–60%: lead with a results report and a lower tier | < 35% after 12 contacts |
| Warm intros | win ≥ 60% and cost per deal ≤ ₹40k | 25–60%: tighter fit brief | win < 25% with ≥ 5 closed |
| Creators | fee ROI ≥ 10× and win ≥ 60% | volume but low fit: pay only at "qualified" | < 3 opportunities from 5 creators by week 4 |
| Inbound + tiers | ≥ 8 forms a week and ≥ 50% to opportunity | traffic without meetings: booking link, 24-hour reply | < 2 forms a week by week 4 |
| Collections | ≥ 90% collected at T-14 | < 70% advance: 3% early-pay discount | always on |

The win-rate and cost thresholds are live settings in the app (*Assumptions and data*), and they drive the scale / change / stop / test-more signal on every campaign.

## 7. The product

**Stack:** Next.js 15 (React 19, Tailwind 4, Recharts) · PostgreSQL · an LLM through Groq's free API. All UI controls are hand-built: select, date picker, donut charts, drag and drop.

| Brief requirement | Where it lives |
|---|---|
| **Measure:** funnel, campaign KPIs, targets vs actuals, conversion, budgets, projections | **Overview**: the sponsor pass (cash collected vs confirmed, with a barcode made of the real deals), target cards, confirmed value by source over time against the goal, funnel with step conversion, owner table, campaign signal table |
| **Diagnose:** winners, losers, bottlenecks, what changed | Scale / change / stop / test-more signal with reasons · the **as-of date** replays any past day without future leakage · "Needs a decision" alerts · per-campaign funnel bars · `compare_snapshots` in the analyst |
| **Decide:** prioritise, allocate, scale or stop | **Campaigns**: spend vs confirmed value chart, value-share and spend-share donuts, editable status, budget, spend and team hours, one-click "Reallocate budget" and "Diagnose" prompts |
| **Execute:** campaigns, tasks, owners, deadlines | **Tasks**: Kanban with drag-and-drop between To do / In progress / Blocked / Done, owner, due date, priority, links to deals and campaigns, overdue flags · **Pipeline**: drag deals between stages on a board, or use the table view; the deal panel updates stage, value and owner, logs cash receipts, adds follow-ups and shows a timeline |
| **Changes update analytics** | Every write goes to Postgres, and every view and the analyst recompute from one metrics engine. Deal edits append a dated version, so earlier snapshots stay reproducible. The audit log is on *Assumptions and data* |
| Look and feel | Green and white theme with a dark-mode toggle; design pass based on [unslop](https://github.com/heydamir/unslop) |

**Architecture**
```
app/
├─ db/schema.sql          source tables + app_* tables + *_latest views + read-only role
├─ db/source/*.csv        original RISA dataset
├─ scripts/seed.ts        loads the CSVs (IST timestamps, dedupe, conflict log) and app defaults
├─ src/lib/metrics.ts     single snapshot engine used by every page AND the analyst
├─ src/lib/mutations.ts   every write (UI and analyst), audit log, append-only deal history
├─ src/lib/copilot.ts     LLM tool loop, read-only SQL sandbox, calculator, payload validation
├─ src/components/        app shell, analyst panel, hand-built UI controls
└─ src/app/               pages (Overview, Campaigns, Pipeline, Tasks, Assumptions) + API routes
```

## 8. The AI analyst

A panel on every page. It is not a decorative chatbot: every answer is computed from current database state through tools.

- **Grounded:** 10 tools over live Postgres, using the same engine as the dashboard: `get_overview`, `get_campaign_performance`, `list_opportunities`, `get_weekly_trend`, `compare_snapshots`, `list_tasks`, `get_assumptions`, `run_sql` (one `SELECT`, READ ONLY transaction, read-only role, 4-second timeout, ≤ 200 rows, `*_latest` views so it can't double-count history), `calculate` (exact arithmetic) and `propose_action`.
- **Transparent:** each answer shows a "data calls" trail (tool, arguments, snapshot date) and is structured as answer, evidence, assumptions and caveats, then recommendation.
- **Honest:** the prompt lists what the data cannot answer (bank receipts, spend, sentiment, causal uplift), flags small samples, and prefers the purpose-built tools over its own SQL.
- **Insight to action:** `propose_action` creates a Confirm card (task, campaign change, deal move or payment). Payloads are flattened and validated before the card is shown. **Nothing is written until a person clicks Confirm.** The write is then audited as `copilot` and every view refreshes.
- **Robust on free tiers:** retries on rate limits and busy errors, falls back across models, times out each call at 45 seconds, skips repeated identical lookups, and forces a written answer on the final step.

**Demo workflow (end to end)**
1. *"Which campaigns should we scale or stop?"* → the campaign tool finds 0 wins in 33 cold opportunities against 24 of 25 warm.
2. Follow-up: *"For the ones you said to stop, how much have we spent?"* → ₹95,000 + ₹1,30,000 + ₹25,000 = ₹2,50,000, computed with the calculator.
3. *"Create a high-priority task for Riya to push stalled deals, due 22 Apr"* → a Confirm card appears → Confirm → the task is on the board and the audit log shows `copilot`.
4. *"How much cash has Beardo actually paid us, and did their activation bring more attendees?"* → ₹0 logged, and attendee uplift is not measurable from this data.

## 9. Testing

**Metrics:** checked against an independent pandas recomputation of the raw CSVs: 24 confirmed, ₹22.4L, per-campaign won and lost counts, 950 interactions after dedupe.

**No leakage:** on 15 Mar a LinkedIn deal shows as confirmed; by 20 Apr it shows as lost. The target version switches on 15 Mar.

**Writes:** moving O055 to confirmed (₹60k) and logging ₹30k raised the 20 Apr snapshot to 25 deals, ₹23.0L and ₹30k cash, while 19 Apr stayed unchanged. Due dates round-trip exactly.

**AI analyst test log** (Groq free tier, as of 20 Apr 2025):

| Test type | Question | Result |
|---|---|---|
| Status | Are we on track? Biggest gap? | ✅ 24 of 28 deals, ₹7.6L short of the ₹30L goal, ₹0 of ₹20L cash logged; caveats on confirmed vs cash (1 tool call, ~4 s) |
| Calculation | Average deal value, warm vs cold | ❌ First run wrote its own SQL and double-counted history. **Fixed** by adding `*_latest` views, a warm/cold tag and tool-preference rules. ✅ Re-run: ₹93,333 warm (24 deals) vs no cold deals |
| Follow-up | Total spend on the campaigns to stop | ❌ First run looped on the same tool. **Fixed** with repeated-call detection and a forced final answer. ✅ Re-run: ₹2,50,000, with the calculation shown |
| Data can't answer | Beardo's cash paid, and attendee uplift | ✅ ₹0 logged; uplift not measurable; suggests logging receipts and capturing footfall |
| Changed data | After confirming O055 and logging ₹75k: how many deals and how much cash? | ✅ 25 deals and ₹75,000 cash; names O055 as the most recent change |
| Action | Create a high-priority task for Riya | ✅ Confirm card with a flat payload; confirm saved it with the correct due date, audited as `copilot` |

The data was reset to the original dataset after testing.

## 10. Setup: run it locally

Prerequisites: Node 20+, PostgreSQL 14+, and a free Groq API key from https://console.groq.com/keys (no card needed).

```bash
cd app
npm install
createdb campusfest
```

Create `app/.env.local`:

```
DATABASE_URL=postgres://localhost/campusfest
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_key
GROQ_MODEL=openai/gpt-oss-120b
GROQ_FALLBACK_MODELS=llama-3.3-70b-versatile,openai/gpt-oss-20b
# Alternatives: LLM_PROVIDER=openrouter (OPENROUTER_API_KEY),
# mistral (MISTRAL_API_KEY) or gemini (GEMINI_API_KEY, GEMINI_MODEL)
```

Load the original dataset (rerun at any time to reset):

```bash
npm run db:reset
```

Start the app, then open http://localhost:3000:

```bash
npm run dev
```

## 11. Deploy on Render

**Live:** https://campusfest-growth-center-nmt1.onrender.com (free plan: the first load after idling takes ~30–60 s)


The repo includes a [`render.yaml`](render.yaml) Blueprint that creates **both** a free PostgreSQL database and the web service, and wires them together.

1. Push this folder to a GitHub repository.
2. In Render: **New → Blueprint**, pick the repository, and click **Apply**. Render creates:
   - `campusfest-db`, a free PostgreSQL database
   - `campusfest-growth-center`, a Node web service in `app/`, with `DATABASE_URL` linked to the database automatically
3. When asked, paste your `GROQ_API_KEY` (it is marked `sync: false`, so it never lives in the repo).
4. On first start the service runs `npm run db:init`, which loads the original dataset into the empty database. Later restarts skip seeding, so the team's edits survive.

| Setting | Value |
|---|---|
| Root directory | `app` |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm run db:init && npm run start` |
| Environment | `DATABASE_URL` (from the database), `GROQ_API_KEY`, `LLM_PROVIDER=groq`, `NODE_VERSION=20` |

To restore the original data on Render, open the service **Shell** and run `npm run db:reset`.

Free-plan caveats: the web service sleeps after 15 minutes idle (the first request takes ~30–60 s to wake), and Render's free Postgres expires after 30 days.

## 12. Tools used, and what was reused

| Tool | Plan | Used for |
|---|---|---|
| Claude Code (Anthropic) | paid | Pair-built the code, data pipeline, deck and README, under my direction and review |
| Next.js 15, React 19, Tailwind 4, Recharts, lucide-react, react-markdown | open source | App framework, charts, icons, chat rendering |
| PostgreSQL 16 (`pg` driver) | open source | Persistent store |
| **Groq API** (`openai/gpt-oss-120b`, falls back to `llama-3.3-70b-versatile` and `openai/gpt-oss-20b`) | free tier | AI analyst. OpenRouter, Mistral and Google Gemini can be swapped in through `LLM_PROVIDER` |
| [unslop](https://github.com/heydamir/unslop) skill by Damir Sokolovsky (CC BY 4.0) | free | Design direction: quiet chrome, colour only in the moments, one signature detail (ticket-stub perforation on commitments) |
| pandas, openpyxl | open source | Profiling and independently checking the dataset |
| Headless Chrome | free | Rendering the slides to PDF |
| Render | free | Hosting (web service and Postgres) |

**Reused:** only the `create-next-app` scaffold. Everything else (metrics engine, UI components, analyst tool loop, deck) was written for this assignment and verified as described in §9.

## 13. Known limitations

- Budgets and spend are assumptions, so cost-per-deal and ROI signals are only as good as those inputs.
- Win rates come from small samples (n = 7–12 per campaign). Anything under 5 closed deals is labelled "test more".
- Attribution is observational (the originating campaign at opportunity creation), not multi-touch.
- App edits are dated to the working snapshot date (18:00 IST), so the team can simulate "today" inside the 2025 timeline.
- There is no login (it's a single-team tool); a real deployment would add authentication.
- The analyst runs on free LLM tiers: under load it may wait for a rate limit, or answer with a smaller fallback model. The numbers always come from tools, but the wording can vary between runs.
