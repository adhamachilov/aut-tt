# Table Tennis League

A simple round-robin table tennis league that runs entirely inside a Telegram Mini App. Nobody signs up with an email or a password: every person is identified by their Telegram account.

## How it works

**Players**

1. Open the bot and press **Start**, then **Open League**.
2. Register once: name, major and year.
3. Tap **Join season** while registration is open (also after the season has started, unless the organizer closed it).
4. As the season goes on, see:
   - **Home**: your rank, wins, losses, win rate and your next matches.
   - **Matches**: your matches as simple "You vs Opponent" cards, or every match grouped by day.
   - **Table**: the standings (played, won, lost, games difference, points). Tap a player to see their results and who they beat or lost to.

**Organizers** are the Telegram IDs listed in `ADMIN_TELEGRAM_IDS`. They see the same app as players, plus an **Admin** tab, so an organizer can also play. In the Admin tab you can:

- **Create a season** and choose how many games each match has: 3 (default), 5 or 7. Every game is played, so with 3 games a match ends 3–0, 2–1, 1–2 or 0–3. Registration opens straight away. The format can be changed until the first result is entered.
- **Control registration.** Open or close it with a switch, and optionally set a date and time when it closes automatically.
- **Manage who's in.** Add a registered player yourself (also after the season has started), or remove (kick) one. Removing a player from a running season deletes their matches in it.
- **Start the season.** Registration stays open, so latecomers can still join and are picked for the next match days. Close it with the switch whenever you want.
- **Plan match days.** For each day, pick the date, tick who's here, and choose either matches per player or a total number of matches for the day. Pairing is fair over the whole season: whoever has played least goes first, and players who haven't met are paired first, so nobody meets the same opponent twice until all n×(n−1)/2 pairings have been played. Matches are ordered so nobody plays twice in a row when it can be avoided. Add as many days as you like; "Remove unplayed" clears a day's matches that weren't played.
- **Enter results.** Results are shown one day at a time (pick the day, or search a player across all days). Tap the result, for example 2–1, or tap **Add game scores** and type each game's points (11–9, 7–11, 11–4: the result 2–1 is worked out for you), then **Save**; saved results fold into a short list where you can edit them. Only scores that add up to the number of games are accepted. You can edit or clear a result at any time.
- **Finish the season,** or delete it.
- **Manage players.** Edit a player's name, major or year, or ban them. A banned player can't join seasons and is taken out of any season that hasn't started yet.

**Ranking:** every game won is 1 point, so a 3–0 win gives 3 points and a 2–1 gives 2 to the winner and 1 to the loser. Most points first. Ties are broken by the points from matches between the tied players, then matches won, then games difference (+/-).

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
