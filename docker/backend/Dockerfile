# ── Backend Dev Dockerfile — hot-reload FastAPI server ────────────────────────
FROM python:3.12.9-slim

WORKDIR /app

# System deps for PDF tools, Pillow, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libffi-dev libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY aifazi.net-backend-fastapi/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y build-essential libffi-dev libjpeg-dev zlib1g-dev \
    && apt-get autoremove -y

# Create non-root user
RUN addgroup --system app && adduser --system --group app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/monitor/ping')"]

# Uvicorn with hot-reload enabled
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
