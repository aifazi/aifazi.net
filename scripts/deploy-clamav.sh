#!/bin/bash
set -euo pipefail

# Deploy ClamAV daemon on the VPS for backend malware scanning.
# Connects to the 'coolify' Docker network so the backend can reach clamd.

mkdir -p /opt/clamav

cat > /opt/clamav/clamd.conf << 'CLAMD_EOF'
TCPSocket 3310
TCPAddr 0.0.0.0
MaxFileSize 50M
StreamMaxLength 50M
DatabaseDirectory /var/lib/clamav
Foreground yes
LogTime yes
CLAMD_EOF

cat > /opt/clamav/docker-compose.yml << 'COMPOSE_EOF'
services:
  clamav:
    image: clamav/clamav:1.4
    container_name: clamav
    restart: unless-stopped
    networks:
      - coolify
    volumes:
      - clamav-data:/var/lib/clamav
      - /opt/clamav/clamd.conf:/etc/clamav/clamd.conf:ro
    healthcheck:
      test: ["CMD-SHELL", "clamdscan --version 2>/dev/null || exit 1"]
      interval: 60s
      timeout: 15s
      retries: 5
      start_period: 300s

volumes:
  clamav-data:

networks:
  coolify:
    external: true
COMPOSE_EOF

cd /opt/clamav
docker compose pull
docker compose up -d
echo "ClamAV deployed. Virus definitions will download on first start (~5-10 min)."
echo "Check status: docker logs -f clamav"
