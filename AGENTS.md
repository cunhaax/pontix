# Pontix: notes for agents

Static page (no build, no back end) for parents to track a child's task points. All state lives in the URL fragment (`#...`), so a "link" is the data. See `README.md` and `requirements.md` for the product; `app.js` for the state shape (comment above `emptyState`).

## Privacy: this repo is public

- Never commit a real share link, a decoded state, a child's name, or task/reward lists from a real family. Work with them in a scratch directory outside the repo.
- Use made-up names and data in docs, tests and examples.

## Reading or editing a share link

`tools/link.js` (Node 18+, no dependencies) wraps `codec.js`, the same encode/decode the page loads, so the format lives in one place. Don't open the page in a browser to read a link.

```sh
node tools/link.js decode '<url or fragment>' > /path/outside/repo/state.json
# edit state.json
node tools/link.js encode /path/outside/repo/state.json     # prints the new link
```

`encode` sets `t` (last change, ms) to now, so the new link wins over data saved on the device. Pass a base URL as the third argument to point at a local server.

## Link format

`#` + `z` + base64url(deflate-raw(JSON)). A `j` prefix means plain base64url JSON. The JSON is the state: `v:1`, `t`, `ws` (Monday of the current week), `kid`, `th`, `md`, `tasks[{id,n,p}]`, `rewards[{id,n,c}]`, `cur`/`prev` (taskId to 7 ints, Mon..Sun), `base`, `spent`.

- `p` is points per tap; `cur`/`prev` cells hold points, not taps.
- Keep `cur`/`prev` and `base`/`spent` when changing tasks or rewards, unless asked to reset. Give new tasks `id`s (6 random chars) and an entry of seven zeros in `cur` and `prev`.
- Leave `ws` as is. The app rolls weeks over itself.

## Reviewing a points setup

When asked whether points and prizes are well balanced:

1. Decode the link and list tasks (`p`) and rewards (`c`).
2. Ask how many days a week the child is with the parents and which tasks happen on which days. Don't assume daily.
3. Estimate points per day, per week and per fortnight, then the time to afford each reward.
4. Rank tasks by effort (1 small habit, 2 needs discipline, 3 real effort, 4 hard) and check points follow that order.
5. Suggest costs so small rewards take about a fortnight and big ones several weeks, plus an optional cheap reward for quick wins.
6. Only build a new link after the user agrees to the numbers.
