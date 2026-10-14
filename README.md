# Booster OS

Single-page music app (HTML/CSS/JS, no build step). Design by Raj Pawar.

## Run
Open `index.html` through any static server (`npx serve .` or `python3 -m http.server`).

## Structure
```
index.html        app UI + logic
lyrics.js         your own lyrics (override online lyrics)
sources/itunes.js music source: iTunes Search API
LICENSE           all rights reserved
```

## Sources
`sources/*.js` are plug-in music sources. Each registers itself on
`window.BoosterSources` and implements the interface described at the top of
`sources/itunes.js`. The app uses `window.BoosterSources.active`.

Current source: **iTunes Search API** (search, albums, artists, artwork,
30-second previews). Lyrics come from LRCLIB and other lyric services already
wired in `index.html`.

Only add sources that use official/open APIs or media you own the rights to.

## Keep it private
Browser code is always visible to anyone who loads the page, so it can't be made
copy-proof. Use a **private** GitHub repo (Settings → General → Danger Zone →
Change visibility) and keep the all-rights-reserved `LICENSE`.
