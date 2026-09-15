# 🪰 Flappy Fly

Fruit fly Flappy Bird — inspired by [TuragaLab/flybody](https://github.com/TuragaLab/flybody),
the DeepMind × HHMI Janelia neuromechanical fruit fly model published in Nature (2025).

**Play online:** https://realjustadev.github.io/flappy-fly/

## How to play

| Action | Keys |
|---|---|
| Flap to rise | `Space` / `↑` / `W` / click / tap |
| Mute | `M` or the speaker button |
| Restart | `Space` after death, `R` mid-game |

- Fly through Mario-style green pipes: +1 per pipe, speed ramps up and gaps narrow
- **Ground contact is fatal** (a nod to flybody's `floor_contacts_fatal=True`)
- Speed-up hint every 10 points; best score stored locally

## 🧠 Synapse monitor (side panel)

A live **synaptic activity monitor** sits next to the game:

- Every flap fires a burst through the neuron network — pulses travel along synapses
- The EEG trace at the bottom follows activity in real time
- **Crash = instant brain death**: pulses vanish, neurons gray out, the EEG flatlines, `BRAIN DEAD`
- Restarting revives the brain

## 🏆 Global leaderboard

After death, leave a name (≤8 chars) and submit to the global board; TOP 5 shows in the panel.

- Backend: a free Val Town HTTP val + its project SQLite; the server clamps names and scores
- The browser talks `GET/POST` directly — no accounts, no API keys; the board is cached in `localStorage`
- Falls back to **offline mode** automatically when the network is unavailable
- Privacy: only a name, a score and a timestamp are submitted — nothing else

## Relation to flybody

flybody is a 59-dim joint-torque fruit fly running in Python + [MuJoCo](https://mujoco.readthedocs.io/) —
it can't run in a browser. This project is a **2D web homage** that keeps the spirit:
flapping for lift, vision-guided flight over trench-like obstacles, and fatal ground contact,
implemented in dependency-free vanilla Canvas with WebAudio-synthesized sound.

For the real 3D physics model, see the upstream `fly-env-examples.ipynb`
(`vision_guided_flight` is the prototype of this game).

## Run locally

No build step — point any static server at this directory:

```bash
python -m http.server 8000
# open http://localhost:8000
```

Or just double-click `index.html`.
