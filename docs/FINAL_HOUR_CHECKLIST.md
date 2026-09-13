# PipeSense final-hour checklist

Update this file only from verified artifacts or live responses.

- [x] Frontend syntax and deterministic simulation tests pass.
- [x] Backend agent and API tests pass (13 tests).
- [x] MediaPipe glove-control helpers cover persistent identity, neutral
  calibration, depth clamping, pinch hysteresis, dynamic fingertip contact and
  short tracking-loss pose hold.
- [ ] Complete one physical webcam test with two hands, crossed hands, tool
  pickup and P-trap seating.
- [x] W&B Inference returned coaching from `openai/gpt-oss-20b` in the verified
  local run.
- [x] Weave tracing reported active for
  `productmaster-nimbus/pipesense-hackathon` in the verified local run.
- [x] Maya is configured as the opt-in ElevenLabs live conversational coach.
- [x] Final Maya narration rendered through ElevenLabs' live conversational
  speech stream; output is 62.37 seconds with a verified non-silent audio track.
- [x] Silent demo backup recorded and encoded.
- [x] Dedicated W&B story page shows the real run, score delta, provider use
  and trace status without fabricated values.
- [x] Narrated demo assembled and media-probed: H.264 video plus AAC Maya audio,
  62.37 seconds.
- [x] Vercel production URL deployed and smoke-tested in Chromium:
  <https://pipesense-training.vercel.app>. The full automated lesson completed
  at score 100 with live W&B Inference and an active Weave trace.
- [x] Public repository URL confirmed:
  <https://github.com/Icybeverage/pipesense-training>.
- [x] Public narrated video, silent backup and W&B proof-image URLs included in
  both the deployed site and repository.
- [x] Submission-form discovery intentionally deferred at the user's direction;
  final effort is focused on working demos, repositories and websites.
