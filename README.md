# Lantern Road

A tiny idle RPG with choose-your-own-adventure forks. The wanderer travels,
fights, rests and levels up on their own; the story pauses at each fork until
you choose (or turn on Auto-choose). Progress saves to the browser and keeps
going while you're away (up to 8 hours).

## Run

    npm install
    npm run dev      # http://localhost:5173, and on the LAN via the box's IP
    npm run build    # type-check + production build to dist/

## Where things live

- `src/story.ts`: all content (enemies, story nodes, choices, effects).
- `src/game.ts`: the engine (tick loop, combat, levelling, shop, offline catch-up). No DOM.
- `src/sound.ts`: hook your sound engine into the game's events here.
- `src/main.ts`: UI rendering, save/load, speed controls.
