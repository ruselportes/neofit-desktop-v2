# Loop Runbook: SMS Auto/Manual Toggle

## Metadata
- **Branch:** `feature/supabase`
- **Pattern:** `sequential`
- **Mode:** `safe`
- **Created:** 2026-06-14
- **Stop Condition:** All 3 phases implemented, tests passing (58/58), TypeScript clean (0 errors)

---

## Checkpoint 0 — Pre-loop Setup (DONE)
- [x] Repository state confirmed
- [x] Uncommitted changes stashed (`checkpoint-pre-loop-sms-toggle`)
- [x] Tests verified: 58/58 passing
- [x] TypeScript verified: 0 errors

---

## Phase 1 — Settings Persistence Utility

**Objective:** Create `phone-app/lib/settings.ts` with AsyncStorage-backed mode storage.

**Files:**
- `phone-app/lib/settings.ts` (NEW)

**Steps:**
1. Create module with `SEND_MODE_KEY` constant
2. Export `SendMode` type (`'auto' | 'manual'`)
3. Export `getSendMode()` — reads from AsyncStorage, defaults to `'auto'`
4. Export `setSendMode(mode)` — writes to AsyncStorage

**Quality Gates:**
- `tsc --noEmit` clean
- App loads without error

---

## Phase 2 — Background Task Conditional Logic

**Objective:** Modify the polling task to respect the mode setting and export a manual-send function.

**Files:**
- `phone-app/lib/background.ts` (MODIFY)

**Steps:**
1. Import `getSendMode` from `./settings`
2. In the `defineTask` callback: if mode is `'manual'`, skip claiming/sending (leave items pending)
3. Export `sendAllPending()` — processes all pending SMS regardless of mode

**Quality Gates:**
- `tsc --noEmit` clean
- Auto mode behavior unchanged
- Manual mode skips auto-send

---

## Phase 3 — Dashboard Toggle UI

**Objective:** Add mode toggle and manual send button to the Dashboard.

**Files:**
- `phone-app/app/index.tsx` (MODIFY)

**Steps:**
1. Import `getSendMode`, `setSendMode`, `sendAllPending`
2. Add `sendMode` state (initialized from AsyncStorage on mount)
3. Add toggle button — shows current mode, switches on tap
4. Add "Send All Pending" button (visible only in manual mode AND pendingCount > 0)
5. Update `onRefresh` to respect manual mode

**Quality Gates:**
- `tsc --noEmit` clean
- Full test suite: 58/58 passing
- Build succeeds

---

## Final Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx vitest run` — 58/58 passing
- [ ] `vite build` (or phone-app build) succeeds

---

## Commands
```bash
# Run tests
npx vitest run

# Type check
npx tsc --noEmit

# Monitor loop status
opencode loop-status
```
