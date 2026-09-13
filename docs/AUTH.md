# Live service authentication

W&B's signed-in browser session does not authenticate the local backend.
From `backend/`, run `.venv/bin/python authenticate.py` and paste the API key
from https://wandb.ai/authorize into the hidden terminal prompt, never chat.
The official SDK verifies and stores it outside this repository.

`run.py` reads the official CLI's netrc credential into the server process;
it does not copy the key into source, frontend, or an env file.
Default team/project: `productmaster-nimbus/pipesense-hackathon`.

After authentication, opt in to live calls and trace uploads:

```sh
PIPESENSE_ENABLE_WANDB_INFERENCE=true PIPESENSE_ENABLE_WEAVE_TRACING=true .venv/bin/python run.py
```

This command spends included inference credits and uploads coaching traces.
Leave both flags unset for offline development. Do not activate pay-as-you-go.
Authentication alone is not evidence of a successful inference or uploaded trace.

ElevenLabs live voice separately needs a server-side API key and configured
conversational agent ID with a verified female Australian voice. Run
`backend/Configure ElevenLabs.command`; it prompts locally and stores both values
as Supabase Edge Function secrets in the existing `hive` project. Never put its
API key in browser code. `pipesense-elevenlabs-token` returns only ElevenLabs'
short-lived signed conversation URL and accepts the local demo origins by
default. Add the deployed demo origin through `PIPESENSE_ALLOWED_ORIGINS` before
hosting publicly.
