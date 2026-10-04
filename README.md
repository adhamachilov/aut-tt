# Table Tennis League

A simple round-robin table tennis league that runs entirely inside a Telegram Mini App. Nobody signs up with an email or a password: every person is identified by their Telegram account.

## How it works

**Players**

1. Open the bot and press **Start**, then **Open League**.
2. Register once: name, major and year.
3. Tap **Join season** while registration is open.
4. As the season goes on, see:
   - **Home**: your rank, wins, losses, win rate and your next matches.
   - **Matches**: your matches as simple "You vs Opponent" cards, or every match grouped by day.
   - **Table**: the standings (played, won, lost, games difference, points). Tap a player to see their results and who they beat or lost to.

**Organizers** are the Telegram IDs listed in `ADMIN_TELEGRAM_IDS`. They see the same app as players, plus an **Admin** tab, so an organizer can also play. In the Admin tab you can:

- **Create a season** and choose how many games each match has: 3 (default), 5 or 7. Every game is played, so with 3 games a match ends 3–0, 2–1, 1–2 or 0–3. Registration opens straight away. The format can be changed until the first result is entered.
- **Control registration.** Open or close it with a switch, and optionally set a date and time when it closes automatically.
- **Manage who's in.** Add a registered player yourself (also after the season has started), or remove (kick) one. Removing a player from a running season deletes their matches in it.
- **Start the season.** This closes registration.
- **Add match days.** For each day, pick the date, tick who's here and set how many matches each player plays. The app pairs players with the opponents they've met least, and orders the matches so nobody plays twice in a row when it can be avoided. If the total is odd, one player gets one match fewer. Add as many days as you like; "Remove unplayed" clears a day's matches that weren't played.
- **Enter results.** Tap the result, for example 2–1, then **Save**. Only scores that add up to the number of games are accepted. You can edit or clear a result at any time.
- **Finish the season,** or delete it.
- **Manage players.** Edit a player's name, major or year, or ban them. A banned player can't join seasons and is taken out of any season that hasn't started yet.

**Ranking:** a win is worth 1 point, a loss 0. Most points first. Ties are broken by the points from matches between the tied players, then games difference (+/-), then games won.

Only one season can be open or running at a time. Past seasons stay viewable from the season picker.

## Setup

Requirements: Node 20.9+, a Supabase project and a Telegram bot from [@BotFather](https://t.me/BotFather).

```bash
npm install
cp .env.example .env.local        # fill it in (see below)
npx supabase link --project-ref <your-project-ref>
npx supabase db push              # creates the tables
npm run dev                       # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database. Server-only. |
| `TELEGRAM_BOT_TOKEN` | Verifies who opened the app, and lets the bot reply to /start. |
| `ADMIN_TELEGRAM_IDS` | Organizers' Telegram user IDs, comma-separated. Message [@userinfobot](https://t.me/userinfobot) to find yours. |
| `APP_URL` | Public `https://` URL of the app. |
| `TELEGRAM_WEBHOOK_SECRET` | Any random 16+ character string (`openssl rand -hex 32`). |
| `LEAGUE_NAME` | Shown in the app and in the bot's messages. |
| `ALLOW_DEV_TELEGRAM_LOGIN`, `DEV_TELEGRAM_USER_ID` | Development only: open the app in a normal browser as that Telegram user. Ignored in production. |

### Put it in Telegram

Telegram only opens Mini Apps from a public `https://` URL. You can deploy (for example to Vercel), or expose your local server with a tunnel such as `npx cloudflared tunnel --url http://localhost:3000`. Then:

1. Set `APP_URL` to that URL.
2. Run `npm run bot:setup`. It registers the webhook, so the bot answers /start with an **Open League** button, and sets the bot's menu button.
3. Post the bot link (`https://t.me/<your_bot>`) in your group with the announcement.

## Security

- The browser never receives a database key or the bot token.
- Every API request carries Telegram's signed init data. The server checks the signature with the bot token, so a user can't pretend to be someone else or claim admin rights.
- Admin actions are allowed only for Telegram IDs in `ADMIN_TELEGRAM_IDS`.
- The database denies all access to the public (anon) role.

## Tests

```bash
npm test
npm run typecheck
npm run lint
```

The tests cover:

- Match days: everyone gets the requested number of matches, new opponents are preferred, and nobody plays twice in a row when avoidable.
- Standings and tie-breaks.
- Telegram identity checks.
- The database rules, run against the real migration: registration open/closed and the deadline, bans, starting a season, adding match days, score validation, removals, and anonymous access being denied.
