#!/usr/bin/env bash
# Mirrors monorepo subdirectories onto their standalone deploy repos.
#
# The deploy repos own the CI/CD pipeline (GitHub Actions -> GHCR -> morpheus /
# snswserver):
#   backend/   -> github.com/South-NSW-Conference-Office/education-backend
#   dashboard/ -> github.com/South-NSW-Conference-Office/education-frontend
#
# Deploy-only files that live solely in the deploy repo (.github/workflows,
# deploy/) are preserved; everything else is snapshotted from the monorepo,
# which is the source of truth. The Dockerfiles live in the subtrees here, so
# they mirror like any other source file.
#
# Mirrors from `git archive`, NOT the raw working tree: the working tree can
# hold untracked scratch files (one-off debug scripts, local secrets) that
# .gitignore keeps out of the monorepo but a plain copy would still see and
# ship. Archiving HEAD guarantees only what is actually committed goes out.
#
# Each push fast-forwards the deploy repo and triggers its deploy workflow.
#
# Usage: bash scripts/ship-to-deploy-repos.sh [branch]   (default: main)
set -euo pipefail

BRANCH="${1:-main}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MONO_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
MONO_SUBJECT="$(git -C "$ROOT" log -1 --pretty=%s)"

mirror() {
  local src_dir="$1" repo="$2"
  shift 2
  # Remaining args: receiver paths to protect (deploy-only files).
  local protects=("$@")

  local src_extract
  src_extract="$(mktemp -d)"
  trap 'rm -rf "$src_extract"' RETURN

  echo "==> ${src_dir}/ -> ${repo} (branch ${BRANCH})"
  git -C "$ROOT" archive HEAD -- "$src_dir" | tar -x -C "$src_extract"

  local tmp
  tmp="$(mktemp -d)"

  git clone --quiet --depth 1 --branch "$BRANCH" "git@github.com:${repo}.git" "$tmp"

  # Delete everything in $tmp except .git and the protected (deploy-only)
  # paths, then copy the fresh archive contents over the top. Same net effect
  # as `rsync -a --delete` with excludes. dotglob so dotfiles (.dockerignore,
  # .gitignore) are actually considered, not silently left by the `*` glob.
  shopt -s dotglob
  local entry
  for entry in "$tmp"/*; do
    local base
    base="$(basename "$entry")"
    [[ "$base" == ".git" ]] && continue
    local keep=false
    local p
    for p in "${protects[@]}"; do
      [[ "$base" == "$p" ]] && keep=true && break
    done
    $keep || rm -rf "$entry"
  done
  cp -a "$src_extract/$src_dir/." "$tmp/"

  # Emptiness is judged on the ADDED index, not the raw worktree: on a Windows
  # checkout, autocrlf materialises CRLF while the archive extract is LF, so
  # `status --porcelain` reports phantom eol-only diffs that normalise away on
  # `git add` — the commit then fails "nothing to commit" and set -e aborts the
  # whole ship before the next repo mirrors.
  git -C "$tmp" add -A
  if git -C "$tmp" diff --cached --quiet; then
    echo "    no changes; skipping"
    rm -rf "$tmp"
    return 0
  fi

  git -C "$tmp" -c user.name="bemorchestrator" -c user.email="snswcomms@adventist.org.au" \
    commit --quiet -m "Ship ${MONO_SHA}: ${MONO_SUBJECT}"
  git -C "$tmp" show --stat --oneline HEAD | sed 's/^/    /'
  git -C "$tmp" push --quiet origin "$BRANCH"
  echo "    pushed -> deploy workflow triggered"
  rm -rf "$tmp"
}

mirror backend South-NSW-Conference-Office/education-backend \
  '.github' 'deploy'

mirror dashboard South-NSW-Conference-Office/education-frontend \
  '.github' 'deploy'
