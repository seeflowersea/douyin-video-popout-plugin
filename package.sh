#!/usr/bin/env bash
set -euo pipefail

mkdir -p dist
rm -f dist/douyin-video-popout.zip

zip -r dist/douyin-video-popout.zip \
  manifest.json \
  content-script.js \
  content-style.css \
  README.md

printf "\nZIP created at: %s\n" "dist/douyin-video-popout.zip"
