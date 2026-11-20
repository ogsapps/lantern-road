# Lantern Road

A tiny idle RPG with choose-your-own-adventure forks. The wanderer travels,
fights, rests and levels up on their own; the story pauses at each fork until
you choose (or turn on Auto-choose). Progress saves to the browser and keeps
going while you're away (up to 8 hours).

## Run

    npm install
    npm run dev      # http://localhost:5173, and on the LAN via the box's IP
    npm run build    # type-check + production build to dist/
    npm run check    # type-check only

## Playing

- **Speed**: `Pause`, `1×`, `2×`, `4×`, `8×`, `16×` in the header.
  Keyboard: `Space` pauses/resumes, `0`–`5` pick those buttons left to right.
  The last running speed is remembered between visits.
- **Auto-choose** picks a fork for you after a short beat, and only ever from
  the choices you qualify for.
- Close the tab and come back: the gap is simulated on return (capped at
  8 hours) and summarised in a toast. A hidden tab never ticks, so offline
  progress is never counted twice.

## Where things live

- `src/story.ts`: all content (enemies, story nodes, choices, effects).
- `src/game.ts`: the engine (tick loop, combat, levelling, shop, offline catch-up).
  No DOM. `BALANCE` holds the per-journey difficulty knobs — see below.
- `src/sound.ts`: hook your sound engine into the game's events here.
- `src/main.ts`: UI rendering, save/load, and the frame loop behind the speed controls.

## Balancing a journey

`BALANCE` in `src/game.ts` splits difficulty growth into separate multipliers on
purpose. A foe's HP and XP — what makes a fight *last*, and what feeds the
hero's levels — grow at `1.8×` per journey, while its attack and armour (the
two numbers that decide whether you can hurt it and survive it) grow more
slowly, and lighting a beacon multiplies the hero's stats by `heroJourney`.

Those curves used to be one flat `1.8×` for everything: hero stats grew slower
than foe armour, damage collapsed to the 1-per-hit floor, and journey 5 turned
into two hours of 4× play and thousands of deaths. If you touch a multiplier,
simulate a handful of journeys (auto-choose on, buying upgrades as gold allows)
and check that journey length and death count stay flat.
