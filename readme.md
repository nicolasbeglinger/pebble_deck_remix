# pebble_deck

is a watch face for the pebble time 2. (I may consider porting it to others, but that is not on the cards yet (prs are welcome tho!))

I just wanted a simple, customizable, information dense watch with the ability to make api calls.
Also I'm a big fan of the cyberpunk / cyber deck aesthetic hence why it looks like it does.

Also many apologies as a lot of this code is vibe coded. tbh I wanted this to work more than I cared about learning c properly

## Reading the display

- `[MET]` shows the temperature and the conditions in plain words (CLEAR, CLOUDY, FOG, DRIZZLE, FRZ DRZL, RAIN, FRZ RAIN, SNOW, SHOWERS, T-STORM). The "Pilot weather" setting switches to METAR codes instead (CLR, FEW, SCT, OVC, FG, FZFG, DZ, FZDZ, RA, FZRA, SN, SG, SHRA, SHSN, TS, TSGR). If the phone hasn't delivered a fresh reading for over an hour the `>>` is replaced by its age, e.g. `[MET] 3H 12C OVC`, or `9+` beyond nine hours.
- `[PWR]` fills its bar with `+` instead of `|` while the watch is on the charger.
- `NO LINK` replaces the tab at the top of the screen when the phone is out of reach. Weather and the custom API can't update until it's back.
- Each line fits 22 characters; the step bar is 5 segments wide so a 5-digit count still fits.
- The "Density" setting picks 10 lines (High, with the clock moved up) or 8 (Low). In Low, slots 9 and 10 are hidden and whatever they're set to stops running.

## Plugins

The face can show readings from [Pebble plugins](https://developer.repebble.com/guides/plugins/preview/) (a preview, off by default in the Pebble app):

1. In the Pebble app, turn on Settings > Plugins > Plugins / permissions preview, then pick up to five readings under Settings > Plugins > Complications.
2. In the face's settings, set any slot to Plugin Reading 1-5. Reading 1 is the first one you picked.

A line's tag is the first three letters of the reading, so the temperature shows as `[TEM] >> 12C`. Until there's a reading the tag is `[PL1]` to `[PL5]`, and the line says why: `NO PLUGINS` (the preview is off), `NOT SET` (you picked fewer readings than that) or `NO DATA`. `NEEDS PERM` means the Pebble app is waiting for you to allow it.

With the preview on, the Pebble app also asks before the custom API can reach a new host, because the face only declares the weather API up front.

Plugins are still unstable, so don't `pebble publish` this until Core says apps using them can go on the appstore.
