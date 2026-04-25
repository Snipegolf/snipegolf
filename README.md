# SnipeGolf

> Private pub league golf sweep platform for PGA Major tournaments.

## What is SnipeGolf?

SnipeGolf runs private golf sweepstakes for pub leagues across Irish Major tournaments. Each pub gets their own private leaderboard, their own PIN-protected admin page, and participant picks are tracked live against the PGA Tour field.

## Architecture

- **Backend:** Google Sheets + Google Apps Script
- **Frontend:** GitHub Pages (this repo)
- **Scoring:** ESPN PGA Tour API (live, every 1–5 min during play)
- **Admin:** PIN-protected pub admin web app (served via Apps Script Web App URL)

## Repo Structure

```
snipegolf/
├── index.html           # Landing page
├── leaderboard.html     # Private leaderboard (read-only, group-specific)
├── assets/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── leaderboard.js
├── appscript/           # Reference copies of all Apps Script modules
│   ├── 00_Setup.gs
│   ├── 01_Config.gs
│   ├── 02_Groups.gs
│   ├── 03_Entry.gs
│   ├── 04_Scores.gs
│   ├── 05_Leaderboard.gs
│   ├── 06_Admin.gs
│   └── 07_Scheduler.gs
└── README.md
```

## Tournaments Supported

- The Masters (April)
- PGA Championship (May)
- US Open (June)
- The Open Championship (July)

## Data & Privacy

All participant data is deleted after each tournament in line with GDPR data minimisation principles. Participants must re-enter for each Major. Pub admin data (email + PIN) is retained as operational data with explicit consent.

---

*© SnipeGolf 2026. Tournament data sourced from ESPN PGA Tour API.*
