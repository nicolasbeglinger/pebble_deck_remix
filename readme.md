# pebble_deck

is a watch face for the pebble time 2. (I may consider porting it to others, but that is not on the cards yet (prs are welcome tho!))

I just wanted a simple, customizable, information dense watch with the ability to make api calls.
Also I'm a big fan of the cyberpunk / cyber deck aesthetic hence why it looks like it does.

Also many apologies as a lot of this code is vibe coded. tbh I wanted this to work more than I cared about learning c properly

## Reading the display

- `[MET]` shows the temperature and the METAR code for the conditions (CLR, FEW, SCT, OVC, FG, FZFG, DZ, FZDZ, RA, FZRA, SN, SG, SHRA, SHSN, TS, TSGR). If the phone hasn't delivered a fresh reading for over an hour the line ends with its age, e.g. `12C OVC 3H`.
- `[PWR]` fills its bar with `+` instead of `|` while the watch is on the charger.
- `NO LINK` replaces the tab at the top of the screen when the phone is out of reach. Weather and the custom API can't update until it's back.
- Each line fits 22 characters; the step bar is 5 segments wide so a 5-digit count still fits.
