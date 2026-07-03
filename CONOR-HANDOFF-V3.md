# SnipeGolf — Conor Handoff Runbook (v3)

**For The Open 2026 (Jul 16–19) while Baden is offline from Mon Jul 13.**

Everything below is copy-paste. If something is not listed here, don't touch it — text Baden.

---

## The five links you actually need

| What                 | URL                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------- |
| Public site          | https://snipegolf.pages.dev                                                            |
| Add-entry form       | https://snipegolf.pages.dev/admin.html?key=YOUR_ADMIN_KEY                              |
| Master sheet         | https://docs.google.com/spreadsheets/d/1RQTUZROazdcH2mYavJ3mEceKcgqSzqhmYsI3V_zW4Lw    |
| Apps Script editor   | https://script.google.com/home/projects/1BitIqSOo-CxFY44VNfRs8IUz8pnb44UepSYnHoPI8MRZ0g5So05hZQH4 |
| Worker health        | https://twilight-recipe-e213.badenmaher.workers.dev/api                                |

Your admin key was emailed to Conorcoyne94@gmail.com. Bookmark the add-entry link **with the key already in it** on your phone.

---

## Daily entry flow (Mon Jul 13 → Wed Jul 15)

1. Open the add-entry form on your phone.
2. Fill name / email / league. Pick payment method + status. Tap **Add entry & send email**.
3. Watch for the green "Added" banner. If red, see "When it breaks" below.
4. The player gets a confirmation email with their edit link automatically.

**Duplicate names** — if the form pops "Already entered" for someone with the same name (but a different person), tap **Update** only if it's genuinely the same person. Otherwise cancel, add a middle initial to the display name, and try again.

**MC/WD/DQ scoring** — last score + 5. Baked into the scorer. Don't touch.

---

## When it breaks — decision tree

### 🔴 Add-entry form shows "Submit failed"

1. **First** try again — Google's Apps Script has intermittent 30-second outages. Wait 2 minutes, retry.
2. If the form's own crash-fallback banner appears with a **"Tap here to email entry instead"** link, tap it. That opens Gmail pre-filled with the entry details. Send it to snipegolfclothing@gmail.com. Baden will add manually.
3. If neither works, open the sheet directly → **Participants** tab → paste a new row at the bottom with these columns filled:
   - `league_slug` = e.g. `the-open-2026-cobh-gc`
   - `comp_slug` = `the-open-2026`
   - `display_name`, `email`, `phone`
   - `paid_status` = `paid` / `unpaid`
   - `paid_method` = `cash` / `revolut` / `pending`  ← lowercase, exactly one of these
   - `entered_by` = your name
   - `entered_at` = today's date

Leave `pid`, `edit_token`, `email_status` blank — a cron fills them.

### 🔴 The site (snipegolf.pages.dev) shows 404 or the wrong page

1. Wait 90 seconds. Cloudflare Pages sometimes redeploys.
2. Fallback URL: https://snipegolf.github.io/snipegolf/  (same content, older hosting)
3. Still broken? Text Baden.

### 🔴 Leaderboard shows "upstream_unavailable"

Cache issue. Force a refresh:

- Open https://twilight-recipe-e213.badenmaher.workers.dev/api/leaderboard?league=the-open-2026-cobh-gc in a browser
- If that JSON responds `{ok:true, ...}` with entries, the leaderboard will fix itself within a minute (worker is warming). Refresh the page.
- If it still errors after 5 minutes, in the Apps Script editor click **runAutoLockNow** in the file `35_AutoLock.js`, then **Run**. Ignore output. Refresh again.

### 🔴 Confirmation emails not sending

1. Check MailApp quota: in the Apps Script editor open any file → **Run → sendBulkTestToBaden** (from `37_BulkEmailTest.js`). If it errors "quota exceeded" — you're locked out for 24h; add missing entries manually to the sheet and Baden will backfill emails.
2. If quota is fine, the email is queued and will send within 5 minutes. Don't re-send from the form.

### 🔴 Prizes need editing

Two ways:

1. **Preferred:** add-entry form → scroll to "Prizes (free text)" card → pick league → type/edit → **Save prizes**.
2. **Manual:** master sheet → **Leagues** tab → find the row → column `prizes_text` → edit → Cmd/Ctrl-S.

Both write to the same cell. Line breaks are preserved on the public league page.

### 🔴 Wrong or accidental email went out

Don't panic and don't re-freeze anything. Just note the timestamp and the recipient list. Baden can identify the trigger from logs after the tournament.

---

## Do NOT touch

- The **Comps** tab `status` column (`picks_open` / `ready_to_freeze` / `frozen`). Auto-managed by an hourly cron. Changing it manually will fire mass emails.
- The `owner_admin_key` cell in the **Config** tab. That's Baden's break-glass key.
- Anything in the `worker/` or `apps-script/` folders on GitHub. Deploys are wired.

---

## Contact chain

1. Baden — WhatsApp / text
2. If Baden unreachable > 4h and it's blocking entries: sheet-direct method above works for everything except the automated welcome email.

---

## Post-tournament (Sun Jul 19 evening)

Do nothing. The auto-freeze cron will:

1. Mark comp status `ready_to_freeze` when picks_lock_datetime passes.
2. 10 hours later, run `freezeCompetition_`: sends "final leaderboard" email to every entrant, purges emails from the sheet for GDPR, sets status to `frozen`.

If you want to hold off the emails (e.g. play-off delayed final position), open Apps Script → **Menu → SnipeGolf → Delete auto-lock trigger**. Text Baden the same day.

---

_Last updated: 2026-07-03 by Baden. Rev 3._
