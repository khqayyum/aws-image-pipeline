#!/usr/bin/env bash
BASE="https://juib1bkup0.execute-api.us-east-1.amazonaws.com"
curl -s "$BASE/images" | jq .
