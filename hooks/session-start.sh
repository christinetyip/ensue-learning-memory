#!/bin/bash
# Session start hook - retrieves last session for recall practice
# Outputs JSON with hookSpecificOutput for Claude to act on

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Get the latest session summary
RESULT=$("$PLUGIN_ROOT/scripts/ensue-api.sh" get_memory '{"key_names": ["private/sessions/_latest"]}' 2>/dev/null)

# Check if we got a valid result with content
if echo "$RESULT" | grep -q '"status":"success"'; then
  # Extract the session content - handle multiline properly
  SESSION_CONTENT=$(echo "$RESULT" | jq -r '.result.structuredContent.results[0].value // empty' 2>/dev/null)

  if [ -n "$SESSION_CONTENT" ] && [ "$SESSION_CONTENT" != "null" ]; then
    # Build the full context message
    CONTEXT="LEARNING SESSION RECALL - ACT ON THIS IMMEDIATELY:

You have previous session data. Your FIRST response to the user MUST be:

1. Greet them: \"Welcome back! Before we start, let's do a quick recall from last time.\"

2. Ask ONE recall question based on the concepts below (pick something they should remember):

<session-data>
$SESSION_CONTENT
</session-data>

3. Wait for their answer, then gently confirm or correct.

4. After recall, ask: \"What would you like to work on today?\"

DO NOT skip this. DO NOT just say hi. Start with recall practice."

    # Use jq to properly escape and build JSON
    echo "$CONTEXT" | jq -Rs '{
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: .
      }
    }'
  else
    # No session data
    echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"No previous learning session found. Greet the user normally."}}'
  fi
else
  # API error or no data
  echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"No previous learning session found. Greet the user normally."}}'
fi
