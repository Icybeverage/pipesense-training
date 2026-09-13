# Presentation page — Weights & Biases is the learning loop

Use this as one dedicated 16:9 presentation page and as the content model for
the in-app judge view. Keep it to one page; do not split the proof across
architecture and sponsor-logo slides.

## Headline

**Weights & Biases turns each plumbing attempt into a better next attempt**

PipeSense keeps task correctness deterministic, then uses Weights & Biases to observe the
failure, generate concise coaching, apply a different training intervention,
and measure whether the retry improved.

## Main loop

```text
OBSERVE              COACH                 ADAPT                 RETRY                 EVALUATE
Geometry + sequence  Weights & Biases      Strategy selected     Simulation changes    Score delta
telemetry captured   rewrites the hint     from bounded options  before the next run   compared in Weave
```

Show the five stages as one continuous horizontal loop. The **Adapt → Retry**
arrow should be visually strongest because that is the product distinction:
the agent changes the next practice attempt instead of merely producing chat.

## What Weights & Biases actually does

- **Weave traces** `pipesense/attempt-loop` and its nested observer, coach,
  evaluator, and inference operations.
- **Weights & Biases Inference** turns structured failure evidence into brief coaching
  language. It cannot alter the score or declare a fitting correct.
- **The retry policy** selects one bounded intervention: visual target,
  kinesthetic snap assistance, or a step-by-step reset.
- **Evaluation** compares the new deterministic score with the prior attempt
  and keeps or replaces the strategy.

## Evidence panel

Use a real run captured from the app or Weights & Biases, never illustrative fake values.

```text
Attempt       [real attempt number]
Issue         [sequence | height alignment | connection gap | none]
Score         [previous] → [current]  ([signed delta])
Intervention  [visual | kinesthetic | step reset | reinforce]
Inference     [actual provider name; used / fallback]
Weave         [active project and trace link or trace screenshot]
Result        [improved / did not improve]
```

## Presenter line

“The simulation measures whether the plumbing is correct. Weights & Biases learns how to
coach the learner better on the next attempt—and Weave gives us the trace that
proves the whole loop happened.”

## Required screenshot sequence

1. Failed connection with deterministic issue and baseline score.
2. Weights & Biases Weave evidence showing the traced attempt-loop.
3. The intervention visibly active in the retry workspace.
4. Improved result with the exact score delta.

The final page may include Weights & Biases branding, but branding is secondary to these
four pieces of run evidence.
