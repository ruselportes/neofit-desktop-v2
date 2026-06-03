# Revenue Calculation Feature — Implementation Plan

## Revenue Recognition Model

Revenue is recognized on the **payment date** (join/renewal date or check-in date).

| Plan Type | Revenue Sources | Amount |
|---|---|---|
| **Daily** | Check-in date + Join/Renew date | `rate.daily` per event |
| **Monthly** | Join/Renew date | `rate.monthly` (once per period) |
| **Semi-Monthly** | Join/Renew date + every 15 days | `rate.semi` per event |
| **Annual Membership Fee** | Join/Renew date (Members only) | ₱300 per year |

### Display Views

| View | Calculation |
|---|---|
| **Daily Revenue** | Sum of ALL revenue events on today's date |
| **Monthly Revenue** | Sum of all daily revenues in the current month |
| **Yearly Revenue** | Sum of all daily revenues in the current year |

---

## File Changes

| File | Action | Description |
|---|---|---|
| `server/index.cjs` | **Modify** | Add rate lookup + `/api/revenue` (JSON) + `/api/revenue/export` (.docx) endpoints |
| `src/rates.ts` | **NEW** | Shared rate table + `parsePlan()` + `lookupRate()` |
| `src/views/RevenueView.tsx` | **NEW** | Revenue dashboard with summary cards, daily breakdown, category breakdown, download button |
| `src/views/RatesView.tsx` | **Refactor** | Import rates from `src/rates.ts` instead of hardcoded |
| `src/App.tsx` | **Modify** | Add `'revenue'` nav tab with 💰 icon |
| `package.json` | **Modify** | Add `docx` npm dependency for .docx generation |
| `revenue-plan.md` | **NEW** | This document |

---

## Implementation Steps

### Step 1: Install `docx` dependency
```bash
npm install docx
```

### Step 2: Create `src/rates.ts` — Shared Rate Module
- Export `rateTable` array with all 8 rate categories
- Export `parsePlan(plan: string)` → `{ category, period, type }`
- Export `lookupRate(category, type)` → `Rate | undefined`

### Step 3: Server — Add Revenue Endpoints
**`GET /api/revenue`** returns JSON:
```json
{
  "todayRevenue": 4500,
  "thisMonthRevenue": 135000,
  "thisYearRevenue": 1620000,
  "dailyBreakdown": [
    { "date": "2026-06-01", "revenue": 4500, "checkinCount": 42, "paymentCount": 3 }
  ],
  "categoryBreakdown": [
    { "category": "Regular Members", "monthlyRevenue": 48000, "memberCount": 8 }
  ]
}
```

**`GET /api/revenue/export`** returns a `.docx` file download with:
- Header: "NeoFit Revenue Report"
- Date range: current month
- Summary section: Today / Month / Year totals
- Daily breakdown table
- Category breakdown table
- Footer with generation timestamp

### Step 4: Create `src/views/RevenueView.tsx`
Layout:
```
┌──────────────────────────────────────────────────────┐
│  Revenue Overview                    [Download .docx] │
│  Calculated based on member plans and check-ins       │
├────────────────┬────────────────┬─────────────────────┤
│  Today Revenue │ Monthly Revenue │ Yearly Revenue     │
│    ₱XX,XXX     │    ₱XX,XXX     │    ₱XX,XXX         │
├────────────────┴────────────────┴─────────────────────┤
│ Revenue Breakdown — June 2026                         │
│ Date       │ Check-in Rev │ Payment Rev │ Total       │
│ Jun 1      │ ₱2,500      │ ₱2,000      │ ₱4,500      │
│ Jun 2      │ ₱3,200      │ ₱800        │ ₱4,000      │
│ ...                                                     │
│ TOTAL      │ ₱XX,XXX     │ ₱XX,XXX     │ ₱XX,XXX     │
├───────────────────────────────────────────────────────┤
│ Revenue by Category                                    │
│ Regular Members       │ ₱XX,XXX/mo │ XX members       │
│ Student/Senior Members│ ₱XX,XXX/mo │ XX members       │
│ ...                                                     │
└───────────────────────────────────────────────────────┘
```

### Step 5: Refactor `src/views/RatesView.tsx`
- Remove hardcoded `rates` array
- Import `rateTable` from `../rates`

### Step 6: Update `src/App.tsx`
- Import `RevenueView` from `./views/RevenueView`
- Add `'revenue'` to `nav` tabs array
- Add route case in `renderContent()`
- Add 💰 icon mapping

---

## Revenue Calculation Logic (Server-side)

```javascript
function computeRevenue(db) {
  const rates = { /* rate table */ };
  const members = db.prepare('SELECT * FROM members').all();
  const checkins = db.prepare('SELECT * FROM check_in_logs').all();

  // For each check-in by a Daily-plan member: rate.daily
  // For each member's joined_date: plan rate
  // For each Semi-Monthly member: rate.semi every 15 days from join
  // For Annual Membership: ₱300 on join date

  return { todayRevenue, thisMonthRevenue, thisYearRevenue, dailyBreakdown, categoryBreakdown };
}
```

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `docx` | ^8.x | Generate .docx Word documents on the server |
