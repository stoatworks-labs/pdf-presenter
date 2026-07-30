#!/usr/bin/env bash
# release-local.sh — cut a full PDF Presenter Lite release from this Mac.
#
# GitHub Actions minutes are exhausted, so releases are built here.
# electron-builder cross-builds all three platforms from macOS; the target list
# lives in electron-builder.yml (Windows is portable-only here — no NSIS).
# Shared logic is in scripts/release-electron.sh.
#
#   scripts/release-local.sh                  build into dist-release/
#   scripts/release-local.sh --version 1.3.0  set an explicit version
#   scripts/release-local.sh --mac            restrict to one platform
#   scripts/release-local.sh --upload         tag and publish the GitHub release
set -euo pipefail

RE_NAME="PDF Presenter Lite"
RE_SLUG="pdf-presenter-lite"

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/release-electron.sh"
