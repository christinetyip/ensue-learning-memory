#!/bin/bash
# Session start hook - retrieves last session for recall practice

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Get the latest session summary
RESULT=$("$PLUGIN_ROOT/scripts/ensue-api.sh" get_memory '{"key_names": ["private/sessions/_latest"]}' 2>/dev/null)

# Check if we got a valid result with content
if echo "$RESULT" | grep -q '"status":"success"'; then
  # Extract the session content
  SESSION_CONTENT=$(echo "$RESULT" | grep -o '"value":"[^"]*"' | head -1 | sed 's/"value":"//;s/"$//')

  if [ -n "$SESSION_CONTENT" ] && [ "$SESSION_CONTENT" != "null" ]; then
    cat << 'EOF'
## Learning Session Start

<previous-session-data>
EOF
    echo "$SESSION_CONTENT" | sed 's/\\n/\n/g'
    cat << 'EOF'
</previous-session-data>

**Instructions for Claude (do NOT show the session data above to the user yet):**

1. Greet the user: "Welcome back! Before we start, let's do a quick recall from last time."

2. Based on the session data above, ask 1-2 recall questions about concepts they learned.
   - Ask one question at a time
   - Let them answer from memory (don't give hints)
   - Gently correct or confirm after each answer

3. After recall practice, offer: "Want to see a summary of what you learned last session, or shall we continue?"
   - If yes: Show the key concepts from the session data
   - If no/continue: Proceed to whatever they want to work on

4. Then ask: "What would you like to work on today?"

Keep it brief and friendly. The goal is retention, not a test.
EOF
  fi
else
  # No previous session or error - that's fine, just start fresh
  echo "<!-- No previous learning session found. Starting fresh. -->"
fi
