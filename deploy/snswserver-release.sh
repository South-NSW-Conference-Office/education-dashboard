#!/usr/bin/env bash
#
# Frontend release on snswserver — a verbatim copy of login-adventistbot's
# release script with only the deploy directory changed. It lives in a file
# because appleboy/ssh-action mangles multi-line `script:` blocks (a `case`
# lost its `;;`, an `until` loop ran once), and because a pull can fail while
# leaving an older image that `up -d` happily starts: a green run must mean
# the NEW release is serving, so the tag is asserted at the end.
#
# Expects in the environment: IMAGE_TAG, GHCR_USER and GHCR_TOKEN.
set -euo pipefail

cd /opt/education-dashboard

# The workflow's scp step lands both files under deploy/; compose expects the
# compose file beside it at the root.
if [ -f deploy/docker-compose.snswserver.yml ]; then
  mv deploy/docker-compose.snswserver.yml docker-compose.yml
fi

: "${IMAGE_TAG:?IMAGE_TAG must be set — without it compose resolves the tag to :latest and deploys the wrong release}"

# snswserver reaches ghcr.io over IPv4 only and that path drops packets
# intermittently — retry both the login and the pull, patiently.
retry() {
  local label="$1"
  shift
  local attempt=1
  local max=4

  while true; do
    if "$@"; then
      return 0
    fi

    if [ "$attempt" -ge "$max" ]; then
      echo "${label} failed after ${attempt} attempts" >&2
      return 1
    fi

    local pause=$(( attempt * 15 ))
    echo "${label} failed (attempt ${attempt} of ${max}) — retrying in ${pause}s" >&2
    sleep "$pause"
    attempt=$(( attempt + 1 ))
  done
}

ghcr_login() {
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
}

retry "docker login" ghcr_login
retry "docker compose pull" docker compose pull
docker compose up -d --remove-orphans

running="$(docker compose ps --format '{{.Image}}' | head -1)"
if [ "${running%":$IMAGE_TAG"}" = "$running" ]; then
  echo "DEPLOY VERIFICATION FAILED: expected an image tagged ${IMAGE_TAG}, but the container is running ${running}" >&2
  exit 1
fi
echo "verified: serving ${running}"

docker image prune -f
