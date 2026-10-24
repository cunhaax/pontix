# Pontix

A tiny, free, static web page for parents to track a points system that motivates a child to do chores.

- One child, configurable tasks and rewards.
- Weekly grid (Mon–Sun) with **+ / −** buttons per task and day; points can go negative.
- Detail kept for the current and previous week only; older weeks are folded into a running total.
- Redeeming a reward subtracts its cost from the balance immediately.
- Bar chart of the last 14 days.
- English and Portuguese (PT-PT) UI; follows the browser language, switchable on the page.
- Mobile first (made for iPhone Safari). No framework, no build step, no back-end.

## How data is stored

The whole state is JSON, deflate-compressed when the browser supports it, base64url-encoded and put in the URL fragment (after `#`), which is never sent to a server. It is also mirrored in `localStorage`.

Every change updates the link. **After recording points, tap "Share link"** so both parents have the same version. If you open a link while the device holds newer local data, the page asks which one to keep.

Behaviour notes:

- Weeks start on Monday, in the device's local time zone.
- Removing a task keeps its already-recorded points in the balance and chart.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy

Push to GitHub, then *Settings → Pages → Deploy from branch → `main` / root*.

## Resumo em português

O Pontix é uma página estática e gratuita para os pais registarem pontos de tarefas de uma criança. Define tarefas e prémios, regista pontos (com **+**/**−**) numa grelha semanal, vê o saldo e um gráfico dos últimos 14 dias, e troca prémios. Só a semana atual e a anterior ficam com detalhe; o resto passa para um total acumulado.

Os dados vão no próprio link (depois do `#`) e também no `localStorage`. **Depois de registar pontos, use "Partilhar link"** para que os dois pais tenham a mesma versão. A interface existe em português de Portugal e em inglês.
