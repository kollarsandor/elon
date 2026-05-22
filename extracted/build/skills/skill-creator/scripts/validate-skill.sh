#!/usr/bin/env bash
# Validate a skill directory for structural issues.
#
# Usage:
#   validate-skill.sh <skill-directory>
#
# Checks:
#   - SKILL.md exists
#   - Has YAML frontmatter
#   - Has name and description fields
#   - Name is valid kebab-case
#   - Description is non-empty and not a TODO placeholder

set -euo pipefail

die() { echo "FAIL: $*"; exit 1; }

[[ $# -ne 1 ]] && die "Usage: validate-skill.sh <skill-directory>"

SKILL_DIR="$1"
SKILL_MD="$SKILL_DIR/SKILL.md"

[[ -d "$SKILL_DIR" ]] || die "Directory does not exist: $SKILL_DIR"
[[ -f "$SKILL_MD" ]]  || die "SKILL.md not found in $SKILL_DIR"

CONTENT=$(<"$SKILL_MD")

# Check frontmatter delimiters
if [[ "$CONTENT" != ---* ]]; then
  # Detect Unicode dash-like characters that LLMs sometimes produce
  FIRST3=$(echo "$CONTENT" | head -c 12)  # up to 4 bytes per char
  if echo "$FIRST3" | LC_ALL=C grep -qP '[\x{2010}-\x{2015}\x{FE58}\x{FE63}\x{FF0D}]' 2>/dev/null; then
    die "SKILL.md starts with typographic dashes (em-dash/en-dash) instead of ASCII hyphens. Replace the opening and closing frontmatter delimiters with plain --- (three ASCII hyphens, U+002D)"
  fi
  die "SKILL.md must start with --- (YAML frontmatter)"
fi

# Extract frontmatter and body using awk
FRONTMATTER=$(echo "$CONTENT" | awk '/^---$/{n++; next} n==1' )
[[ -n "$FRONTMATTER" ]] || die "Empty or malformed frontmatter"

BODY=$(echo "$CONTENT" | awk '/^---$/{n++; next} n>=2')
BODY_TRIMMED=$(echo "$BODY" | sed '/^[[:space:]]*$/d')
[[ -n "$BODY_TRIMMED" ]] || die "SKILL.md body is empty (no content after frontmatter)"

# Extract name
NAME=$(echo "$FRONTMATTER" | grep -m1 '^name:' | sed 's/^name:[[:space:]]*//')
[[ -n "$NAME" ]] || die "Missing 'name' in frontmatter"

# Validate name format
[[ ${#NAME} -ge 2 ]] || die "Name '$NAME' is too short (min 2 characters)"
[[ ${#NAME} -le 64 ]] || die "Name '$NAME' is too long (${#NAME} chars, max 64)"
if ! echo "$NAME" | grep -qE '^[a-z0-9][a-z0-9-]*[a-z0-9]$'; then
  die "Name '$NAME' must use only lowercase letters (a-z), digits (0-9), and hyphens (-), and must start and end with a letter or digit (e.g. 'my-skill')"
fi

# Extract description — handle both quoted and unquoted values
DESC_LINE=$(echo "$FRONTMATTER" | grep -m1 '^description:')
[[ -n "$DESC_LINE" ]] || die "Missing 'description' in frontmatter"
DESCRIPTION=$(echo "$DESC_LINE" | sed 's/^description:[[:space:]]*//')

# Strip surrounding quotes if present
if [[ "$DESCRIPTION" =~ ^\"(.*)\"$ ]] || [[ "$DESCRIPTION" =~ ^\'(.*)\'$ ]]; then
  DESCRIPTION="${BASH_REMATCH[1]}"
fi

[[ -n "$DESCRIPTION" ]] || die "Missing 'description' in frontmatter"

# Check for unquoted colons — these break YAML parsing server-side.
# A bare ": " (colon-space) inside the value is ambiguous in YAML.
RAW_VALUE=$(echo "$DESC_LINE" | sed 's/^description:[[:space:]]*//')
if echo "$RAW_VALUE" | grep -q ': ' && [[ ! "$RAW_VALUE" =~ ^\" ]] && [[ ! "$RAW_VALUE" =~ ^\' ]]; then
  die "Description contains ': ' (colon-space) which breaks YAML parsing. Wrap the value in quotes, e.g.: description: \"$RAW_VALUE\""
fi

# Check for placeholder descriptions
if echo "$DESCRIPTION" | grep -qi 'TODO'; then
  die "Description is still a TODO placeholder"
fi

# Check description length (max 1024 characters)
DESC_LEN=${#DESCRIPTION}
if [[ "$DESC_LEN" -gt 1024 ]]; then
  die "Description is too long ($DESC_LEN chars, max 1024)"
fi

# Count lines
LINE_COUNT=$(echo "$CONTENT" | wc -l | tr -d ' ')
if [[ "$LINE_COUNT" -gt 500 ]]; then
  echo "WARN: SKILL.md is $LINE_COUNT lines (recommended max 500). Consider moving content to references/."
fi

echo "OK: Skill '$NAME' is valid ($LINE_COUNT lines)"
