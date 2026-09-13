#!/bin/zsh
set -eu
cd -- "${0:A:h}/.." || exit 1
printf '%s\n' "Configure PipeSense live voice in Supabase. Input remains hidden."
read -rs "eleven_key?ElevenLabs API key: "
printf '\n'
read -r "eleven_agent?ElevenLabs agent ID: "
if [[ -z "$eleven_key" || -z "$eleven_agent" ]]; then
  printf '%s\n' "Both values are required; nothing changed."
  exit 1
fi
secret_file=$(mktemp)
chmod 600 "$secret_file"
trap 'rm -f "$secret_file"' EXIT
printf 'ELEVENLABS_API_KEY=%s\nELEVENLABS_AGENT_ID=%s\n' "$eleven_key" "$eleven_agent" > "$secret_file"
unset eleven_key eleven_agent
npx --yes supabase@latest secrets set --project-ref zcahokqhmmsjpcfrxfly --env-file "$secret_file"
printf '%s\n' "ElevenLabs secrets stored in Supabase hive."
