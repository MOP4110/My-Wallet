# My Wallet

My Wallet is a simple mobile-first personal finance tracker. It works offline, stores everything locally in IndexedDB, and can be installed as a PWA on mobile or desktop.

## What it does

- Add expenses quickly with amount, category, date, and note
- Add incomes too, so you can see a real balance
- Edit and delete manual transactions
- Track recurring expenses without duplicating them into storage
- Show today, weekly, and monthly totals
- View yearly charts for income, balance, and expense breakdowns
- Search and filter transactions
- Edit categories locally
- Export and import a JSON backup

## Tech stack

- Plain HTML, CSS, and ES modules
- IndexedDB for local persistence
- Service worker for offline support
- Web App Manifest for installability
- No backend
- No paid APIs
- No cloud database

## Local data

All user data stays on the device where the app is opened.

Stored locally:

- manual transactions
- recurring expense definitions
- categories
- app settings

Recurring expenses are stored as rules, not duplicated entries. The app generates their occurrences when it calculates totals and recent activity.

## Backup and restore

The app includes two backup actions:

- `Export backup` downloads a JSON file with all local data from that device.
- `Import backup` restores the data from a JSON file into the current device.
- `Import CSV expenses` lets you add historical transactions from a CSV file with columns like `date,amount,category,note,type`.
- The CSV importer accepts comma, semicolon, or tab separated files.

The exported file is plain JSON, so you can open it in any text editor if you want to inspect it.
If that file contains transactions from 2024 or 2025, importing it will keep those dates and they will appear in the annual history and charts.

Suggested use:

1. Export a backup before clearing browser data or changing devices.
2. Copy the file to another phone or computer if you want the same data there.
3. Import the file in My Wallet on the target device.

Important:

- Importing a backup replaces the current local data on that device.
- There is no automatic sync between devices.
- If you want the same data on mobile and desktop, use export/import manually.

## Repository layout

- [`index.html`](/Users/marcolmospenarroja/Documents/Codex/2026-04-18-build-a-simple-mobile-first-personal/index.html)
- [`styles.css`](/Users/marcolmospenarroja/Documents/Codex/2026-04-18-build-a-simple-mobile-first-personal/styles.css)
- [`app.js`](/Users/marcolmospenarroja/Documents/Codex/2026-04-18-build-a-simple-mobile-first-personal/app.js)
- [`db.js`](/Users/marcolmospenarroja/Documents/Codex/2026-04-18-build-a-simple-mobile-first-personal/db.js)
- [`recurring.js`](/Users/marcolmospenarroja/Documents/Codex/2026-04-18-build-a-simple-mobile-first-personal/recurring.js)
- [`sw.js`](/Users/marcolmospenarroja/Documents/Codex/2026-04-18-build-a-simple-mobile-first-personal/sw.js)
- [`manifest.webmanifest`](/Users/marcolmospenarroja/Documents/Codex/2026-04-18-build-a-simple-mobile-first-personal/manifest.webmanifest)
- [`vercel.json`](/Users/marcolmospenarroja/Documents/Codex/2026-04-18-build-a-simple-mobile-first-personal/vercel.json)

## Run locally

1. Make the server script executable if needed: `chmod +x serve.sh`
2. Start the local server: `./serve.sh`
3. Open `http://localhost:8000`

## Publish on GitHub and Vercel

1. Create a new GitHub repository.
2. Push this project to that repository.
3. Import the GitHub repo into Vercel.
4. Let Vercel deploy the root of the repo as a static site.
5. Open the Vercel URL on your phone or desktop.
6. Install the app from the browser menu.

This setup works well because Vercel serves the app over HTTPS, which is important for PWA installation and offline support.

## Install on mobile

1. Open the deployed URL in Safari on iPhone or Chrome on Android.
2. Use the browser menu to add the app to the home screen or install it.
3. After the first load, the app can open and work offline.

## Notes

- Currency is set to EUR.
- The UI is intentionally minimal and optimized for quick entry on mobile.
- If you clear browser storage or uninstall the app, the local data on that device can be lost unless you have exported a backup.
