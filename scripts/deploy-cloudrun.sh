#!/usr/bin/env bash
#
# Deploy to Cloud Run, reading the Firebase config from .env.local.
#
# The seven NEXT_PUBLIC_FIREBASE_* values are compiled into the client bundle
# at build time, so they have to be passed as build args — they cannot be added
# afterwards as runtime env vars. Typing them by hand on the gcloud command
# line is how one of them ends up empty, and an empty one does not fail the
# build: it produces a service that starts, serves pages, and never reaches
# Firestore. So this reads them from the file and refuses to deploy if any are
# missing.
#
#   ./scripts/deploy-cloudrun.sh            # deploy
#   ./scripts/deploy-cloudrun.sh --check    # validate only, deploy nothing
#
# Secrets (GEMINI_API_KEY, ADMIN_DASHBOARD_TOKEN, the Cloudflare TURN keys) are
# runtime env vars on the service and are deliberately not touched here —
# cloudbuild.yaml uses --update-env-vars, which merges rather than replaces, so
# whatever is already set on the service survives a deploy.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.local}"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

fail() { printf '\n  %s\n\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null 2>&1 \
  || fail "gcloud is not installed. See https://cloud.google.com/sdk/docs/install"

[[ -f "$ENV_FILE" ]] \
  || fail "No $ENV_FILE. Copy .env.local.example to $ENV_FILE and fill in the Firebase values."

# Only read the keys we need, so nothing else in the file is evaluated.
declare -A VALUES=()
REQUIRED=(
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY
)

for key in "${REQUIRED[@]}"; do
  line=$(grep -E "^${key}=" "$ENV_FILE" | tail -1 || true)
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"        # tolerate quoted values
  value="${value%\'}"; value="${value#\'}"
  VALUES[$key]="$value"
done

missing=()
for key in "${REQUIRED[@]}"; do
  [[ -z "${VALUES[$key]}" ]] && missing+=("$key")
done

if (( ${#missing[@]} > 0 )); then
  printf '\n  %s is missing %d value(s):\n\n' "$ENV_FILE" "${#missing[@]}" >&2
  printf '    %s\n' "${missing[@]}" >&2
  printf '\n  Firebase console -> Project settings -> Your apps -> SDK setup and configuration.\n' >&2
  fail "Refusing to deploy: an empty value builds a bundle that cannot reach Firebase."
fi

# Lengths only. The values are not secret — they ship to every browser — but
# echoing them into a terminal scrollback or CI log is still a bad habit.
echo "Firebase config in $ENV_FILE:"
for key in "${REQUIRED[@]}"; do
  printf '  %-42s %s chars\n' "$key" "${#VALUES[$key]}"
done

SHA=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
DIRTY=""
[[ -n "$(git status --porcelain)" ]] && DIRTY="  (uncommitted changes present)"

echo
echo "Deploying $BRANCH @ $SHA$DIRTY"
echo "Project:  $(gcloud config get-value project 2>/dev/null || echo '<unset>')"
echo "Account:  $(gcloud config get-value account 2>/dev/null || echo '<unset>')"

if [[ "$CHECK_ONLY" == true ]]; then
  echo
  echo "--check: everything needed is present. Nothing deployed."
  exit 0
fi

read -r -p $'\nDeploy this to Cloud Run? [y/N] ' reply
[[ "$reply" == "y" || "$reply" == "Y" ]] || fail "Cancelled."

gcloud builds submit --config cloudbuild.yaml --substitutions=\
_GIT_SHA="$SHA",\
_FIREBASE_API_KEY="${VALUES[NEXT_PUBLIC_FIREBASE_API_KEY]}",\
_FIREBASE_AUTH_DOMAIN="${VALUES[NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN]}",\
_FIREBASE_PROJECT_ID="${VALUES[NEXT_PUBLIC_FIREBASE_PROJECT_ID]}",\
_FIREBASE_STORAGE_BUCKET="${VALUES[NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET]}",\
_FIREBASE_MESSAGING_SENDER_ID="${VALUES[NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID]}",\
_FIREBASE_APP_ID="${VALUES[NEXT_PUBLIC_FIREBASE_APP_ID]}",\
_FIREBASE_MEASUREMENT_ID="${VALUES[NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID]}",\
_RECAPTCHA_SITE_KEY="${VALUES[NEXT_PUBLIC_RECAPTCHA_SITE_KEY]}"
