#!/bin/bash
#
# Docker integration test for scripts/install.sh.
#
# Spins up a clean Debian container, copies the local install.sh into it,
# runs it against the existing v0.5.2 release, and verifies that a *fresh*
# non-interactive shell can find the binary on PATH — which is the whole
# point of the rc-file PATH setup. Exits 0 on success, 1 on failure.
#
# Run:    bash scripts/install.docker-test.sh
# Or:     bash scripts/install.docker-test.sh v0.5.2  (pin a different tag)
#
# Why a separate shell script (not a bun:test): bun:test wants to be the
# orchestrator for its tests, and the test surface here is "spawn docker,
# wait, assert" — way better expressed as a shell script. Plus it makes
# the test runnable from anywhere docker is installed without bun.

set -euo pipefail

# Default to the latest *published* release rather than the current
# in-source version, because this test downloads real binaries from
# GitHub Releases — a not-yet-tagged version would 404. Override with
# the first positional arg.
VERSION="${1:-v0.5.1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SCRIPT="$SCRIPT_DIR/install.sh"

if [ ! -f "$INSTALL_SCRIPT" ]; then
    echo "FAIL: install.sh not found at $INSTALL_SCRIPT" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "SKIP: docker not available" >&2
    exit 0
fi

echo "=== relay install.sh docker integration test ==="
echo "Version under test: $VERSION"
echo "Script path:        $INSTALL_SCRIPT"
echo ""

# Use debian:bookworm-slim as a representative cloud-sandbox base —
# minimal package set, bash as default shell, no shell rc files. Closer
# to Claude Cloud / typical Linux CI than ubuntu:latest (which ships
# more dotfiles).
IMAGE="debian:bookworm-slim"

PLATFORM="${RELAY_TEST_PLATFORM:-linux/amd64}"

echo "→ Pulling $IMAGE ($PLATFORM)..."
docker pull --platform "$PLATFORM" --quiet "$IMAGE" >/dev/null

# The container script does the actual integration test: install
# prereqs (curl, git, ca-certs), run install.sh, then verify the
# binary is reachable from a *fresh* bash invocation. We pipe it via
# stdin so we don't have to mount the whole repo.
container_script=$(cat <<'EOF'
set -euo pipefail

echo "[container] Installing prereqs..."
apt-get update -qq
apt-get install -qq -y curl git ca-certificates >/dev/null

echo "[container] Running install.sh..."
bash /tmp/install.sh --version "$VERSION"

echo ""
echo "[container] === Verification ==="

# Test 1: binary exists at the expected path.
if [ ! -x "$HOME/.local/bin/relay" ]; then
    echo "FAIL: $HOME/.local/bin/relay not executable"
    exit 1
fi
echo "PASS: binary installed at $HOME/.local/bin/relay"

# Test 2: .bashrc was modified (the meaningful change in this PR).
if [ ! -f "$HOME/.bashrc" ]; then
    echo "FAIL: $HOME/.bashrc was not created"
    exit 1
fi
if ! grep -q "Added by relay installer" "$HOME/.bashrc"; then
    echo "FAIL: marker comment not found in .bashrc"
    cat "$HOME/.bashrc"
    exit 1
fi
if ! grep -qF 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.bashrc"; then
    echo "FAIL: PATH export not found in .bashrc"
    cat "$HOME/.bashrc"
    exit 1
fi
echo "PASS: .bashrc updated with marker + export"

# Test 3: a *fresh* bash login shell finds relay on PATH. This is the
# real cloud scenario — Claude Code's Bash tool spawns a fresh shell
# per call, so anything that doesn't survive the .bashrc round-trip is
# broken in cloud environments.
echo ""
echo "[container] Spawning fresh bash to verify PATH..."
# `bash -ic` (interactive) is the closest analog to how Claude Code's
# Bash tool spawns shells — non-login but interactive, which sources
# ~/.bashrc. We don't use `bash -lc` (login) because login shells on
# Debian read ~/.profile, not ~/.bashrc, and we want to verify the
# bashrc append specifically.
output=$(bash -ic 'command -v relay && relay --help | head -1' 2>&1) || {
    echo "FAIL: fresh shell could not find relay on PATH"
    echo "Output: $output"
    echo ""
    echo ".bashrc contents:"
    cat "$HOME/.bashrc"
    exit 1
}
echo "PASS: fresh shell resolves relay"
echo "      $output" | head -2 | sed 's/^/      /'

# Test 4: idempotency — re-running install.sh should not duplicate the
# rc-file entries. (Skip the actual download, we're just exercising
# the rc-file logic.)
echo ""
echo "[container] Running install.sh a second time to test idempotency..."
bash /tmp/install.sh --version "$VERSION" >/dev/null 2>&1
marker_count=$(grep -c "Added by relay installer" "$HOME/.bashrc" || true)
if [ "$marker_count" -ne 1 ]; then
    echo "FAIL: marker appears $marker_count times in .bashrc, expected 1"
    cat "$HOME/.bashrc"
    exit 1
fi
echo "PASS: re-running install.sh leaves .bashrc unchanged (marker count: 1)"

echo ""
echo "[container] All checks passed."
EOF
)

echo "→ Running container..."
echo ""

# Mount install.sh into the container and run the test. -i so the
# heredoc'd script reaches stdin.
if docker run --rm \
    --platform "$PLATFORM" \
    -v "$INSTALL_SCRIPT:/tmp/install.sh:ro" \
    -e "VERSION=$VERSION" \
    "$IMAGE" \
    bash -c "$container_script"; then
    echo ""
    echo "=== ✓ install.sh docker integration test passed ==="
    exit 0
else
    echo ""
    echo "=== ✗ install.sh docker integration test FAILED ==="
    exit 1
fi
