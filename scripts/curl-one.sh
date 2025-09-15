#!/usr/bin/env bash
BASE="https://juib1bkup0.execute-api.us-east-1.amazonaws.com"

ID="${1:-ss.png}"  # pass a filename as the first arg, default ss.png
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$ID'))")

curl -s "$BASE/images?id=$ENCODED" | jq .
