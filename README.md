# How Well Do You Know Me?

A host-paced family game. Phones are for typing answers. After everyone locks, the TV and the host carry the round. The host decides what counts as a match.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- `/host` creates the room and runs the game.
- `/play` is the phone. Join with the room code and a name.
- `/tv` is the big screen. Enter the same room code. Standings stay up the whole game.

The SQLite file is `data/game.db` unless you set `DATABASE_PATH`. A sample question pack lives in `data/sample-questions.csv`. The host can load it instead of importing questions.

Questions can be pasted one per line. Add an optional category with a pipe: `What song do they sing in the car? | music`. A CSV with a `prompt,category` header works too.

## Test

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

## Deploy

Tests run on every push and pull request. A push to `main` can deploy to `https://know-me.hobbybin.xyz` after those tests pass. Setup is by hand. See [DEPLOY.md](DEPLOY.md) and [docs/SERVER-SETUP.md](docs/SERVER-SETUP.md).
