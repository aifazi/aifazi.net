# ── aifazi.net Backend Production Dockerfile ───────────────────────────────────
# Runs a persistent FastAPI/uvicorn process (NOT serverless).
# Assumes the build context is the backend directory (aifazi.net-backend-fastapi).
# Deployed via Coolify on VPS. Scheduler starts in lifespan when VERCEL is unset.
# WireGuard full-tunnel VPN runs inside this container (requires NET_ADMIN cap).
FROM python:3.12.9-slim

WORKDIR /app

# System deps: PDF tools, Pillow, Tesseract OCR, WireGuard, iptables for VPN NAT.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libffi-dev libjpeg-dev zlib1g-dev \
    tesseract-ocr tesseract-ocr-eng \
    wireguard-tools iptables iproute2 gosu \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y build-essential libffi-dev libjpeg-dev zlib1g-dev \
    && apt-get autoremove -y

# Copy application source into the image (no bind mount in production)
COPY . .

# WireGuard init script runs as root before dropping privileges.
COPY scripts/init-wireguard.sh /usr/local/bin/init-wireguard.sh
RUN chmod +x /usr/local/bin/init-wireguard.sh && mkdir -p /data/wireguard

# Create non-root user
RUN addgroup --system app && adduser --system --group app \
    && mkdir -p /app && chown -R app:app /app \
    && chown -R app:app /data/wireguard

ENV PORT=8000

EXPOSE 8000 51820/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-8000}/api/monitor/ping')"]

# Entrypoint: init WireGuard as root, then drop to app user for uvicorn.
# WireGuard is skipped when WG_ENABLED=false (e.g. local dev without caps).
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]