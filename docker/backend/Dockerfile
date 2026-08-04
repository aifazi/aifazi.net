# ── Backend Dev Dockerfile — hot-reload FastAPI server ────────────────────────
FROM python:3.12-slim

WORKDIR /app

# System deps for PDF tools, Pillow, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libffi-dev libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY aifazi.net-backend-fastapi/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

# Uvicorn with hot-reload enabled
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
