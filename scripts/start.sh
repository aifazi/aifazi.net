#!/bin/bash
# Quick start — already set up? just bring containers up
set -e

COMPOSE="docker compose"
if ! docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker-compose"
fi

$COMPOSE up -d
echo " Frontend:    http://localhost:3000"
echo " Backend:     http://localhost:8000"
echo " Supabase:    http://localhost:54323"
echo " Mailpit:     http://localhost:54324"
