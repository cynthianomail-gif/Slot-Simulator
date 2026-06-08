# Slot Simulator

A config-driven, Web-based Slot **simulator / prototyping / math-validation** tool
for game designers, math designers and QA. Not a production client — a tool for
prototype validation, RTP verification, feature tuning and pacing demos.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build (tsc -b + vite build)
npm test           # engine unit tests (vitest)
```

## Architecture

UI and game logic are **fully decoupled**. The engine is pure TypeScript with no
React/DOM dependency, so the exact same code powers the live client and the
headless high-speed simulation.

```
src/
├── types/            # All TypeScript interfaces (the contract)
│   ├── symbol.ts     #   SymbolDefinition, SymbolType, WildConfig
│   ├── grid.ts       #   GridShape, GridResult (regular + irregular)
│   ├── config.ts     #   GameConfig schema, triggers, features, buy, animation
│   ├── events.ts     #   GameEvent / event types
│   ├── state.ts      #   GameState, FeatureState
│   └── result.ts     #   WinLine, EvalResult, SpinResult, RoundResult
│
├── engine/           # Pure, deterministic, UI-free game logic
│   ├── rng.ts        #   Seedable RNG (xmur3 + mulberry32), Random/Fixed modes
│   ├── grid.ts       #   Grid generator (regular & irregular shapes)
│   ├── reel.ts       #   Reel engine (weight-based + reel-strip-based)
│   ├── wild.ts       #   Wild engine helpers
│   ├── pay.ts        #   Pay engine: payline / ways / cluster
│   ├── trigger.ts    #   Trigger engine: AND / OR / NOT condition tree
│   ├── stateMachine.ts # Declarative game state transitions
│   ├── gameEngine.ts #   Orchestrator: round → spin → cascade → trigger → feature
│   ├── eventLog.ts   #   Event Log system (ring buffer)
│   ├── statistics.ts #   Incremental statistics engine
│   ├── simulation.ts #   Headless 10K/100K/1M simulation
│   ├── cheats.ts     #   Developer cheat engine
│   ├── buyFeature.ts #   Buy Feature engine
│   └── animation.ts  #   Animation controller (timing only; can be disabled)
│
├── features/         # Feature Plugin System (open for extension)
│   ├── types.ts      #   FeaturePlugin interface + per-feature state machine
│   ├── registry.ts   #   Plugin registry — add features without touching engine
│   ├── freeGame.ts   #   Free Game (retriggerable, win multiplier)
│   ├── respin.ts     #   Respin
│   └── holdAndSpin.ts#   Hold & Spin / collect
│
├── config/
│   └── defaultConfig.ts  # Complete playable GameConfig (drives everything)
│
├── store/
│   ├── session.ts    #   Non-reactive engine/log/stats handles
│   └── gameStore.ts  #   Zustand store (thin view layer over the engine)
│
└── components/       # UI (reads store only; no game rules here)
    ├── ConfigPanel/  #   Left panel: all editors (config-driven)
    ├── SlotCanvas/   #   Center board (Framer Motion) + Floating Win
    ├── ControlBar/   #   Bottom bar: user / bet / win / buttons / auto / spin
    ├── Stats/        #   Statistics dashboard (Recharts)
    ├── Debug/        #   Debug panel
    └── modals/       #   Info (paytable) / History / Event Log viewer
```

## Lifecycle (3 levels)

- **Round** — largest unit. A normal spin, a full Free Game session, a full Bonus
  session. Round Total Win / Round RTP / Round Event Log settle on round end.
- **Spin** — one reel turn (Normal Spin, FG Spin #1, #2, …).
- **Cascade / Respin** — follow-on behaviour inside a single spin.

## Adding a new Feature (extension example)

```ts
// 1. implement the plugin
export class WheelFeature implements FeaturePlugin {
  readonly type = 'wheel';
  state: FeatureState = 'INACTIVE';
  run(entry, ctx) { /* advance state, produce spins, return win */ }
}

// 2. register it (features/registry.ts)
registerFeature('wheel', () => new WheelFeature());

// 3. reference it from GameConfig.features[].type === 'wheel'
```

No engine or UI change required.

## Requirement → file map

| # | Deliverable | File(s) |
|---|---|---|
| 1 | Project structure | this repo |
| 2 | TypeScript Interfaces | `src/types/**` |
| 3 | Zustand Store | `src/store/gameStore.ts` |
| 4 | GameConfig Schema | `src/types/config.ts`, `src/config/defaultConfig.ts` |
| 5 | State Machine | `src/engine/stateMachine.ts`, `gameEngine.ts` |
| 6 | RNG Engine | `src/engine/rng.ts` |
| 7 | Reel Engine | `src/engine/reel.ts` |
| 8 | Grid Generator (irregular) | `src/engine/grid.ts` |
| 9 | Pay Engine | `src/engine/pay.ts` |
| 10 | Trigger Engine | `src/engine/trigger.ts` |
| 11 | Feature Plugin System | `src/features/**` |
| 12 | Event Log System | `src/engine/eventLog.ts` |
| 13 | Statistics Engine | `src/engine/statistics.ts` |
| 14 | Simulation Engine | `src/engine/simulation.ts` |
| 15 | Cheat Engine | `src/engine/cheats.ts` |
| 16 | Buy Feature Engine | `src/engine/buyFeature.ts` |
| 17 | Animation Controller | `src/engine/animation.ts` |
| 18 | Config Panel UI | `src/components/ConfigPanel/**` |
| 19 | Slot Canvas UI | `src/components/SlotCanvas/**` |
| 20 | Bottom Control Bar UI | `src/components/ControlBar/**` |

## Note on the default config (tuned)

The bundled `defaultConfig` is **math-tuned** and verified by simulation:

| Metric | Target | Measured (400k rounds) |
|---|---|---|
| RTP | 96.0% | **96.22%** |
| BF | 1 in 150 | **1 in 156** |
| Hit rate | — | 29.3% |

Tuning method (decoupled levers), reproducible via `src/config/__tuning__`:

1. **BF** is set by scatter frequency — `SC: 3` per length-100 strip
   (`src/config/strips.ts → DEFAULT_STRIP_SPEC`).
2. **RTP** is set by Wild density and the FG win multiplier:
   asymmetric per-reel wilds `DEFAULT_WILD_PER_REEL = [4,4,4,3,3]` plus
   `features.fg.params.winMultiplier = 1.5`.

Reel strips are generated from the spec by `buildDefaultStrips()`, so designers
tune *counts* (data), not hand-laid strips. `npm test` re-verifies convergence.
