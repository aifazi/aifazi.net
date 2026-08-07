# ── aifazi.net Backend Production Dockerfile (Railway) ─────────────────────────
# Runs a persistent FastAPI/uvicorn process (NOT serverless).
# Assumes the build context is the backend directory (aifazi.net-backend-fastapi).
# The scheduler starts in lifespan because VERCEL env is unset on Railway.
FROM python:3.12.9-slim

WORKDIR /app

# System deps for PDF tools, Pillow, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libffi-dev libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y build-essential libffi-dev libjpeg-dev zlib1g-dev \
    && apt-get autoremove -y

# Copy application source into the image (no bind mount in production)
COPY . .

# Create non-root user
RUN addgroup --system app && adduser --system --group app \
    && mkdir -p /app && chown -R app:app /app
USER app

ENV PORT=8000

EXPOSE 8000

# No --reload in production. Uvicorn serves main:app; the lifespan() handler
# starts the background scheduler when _IS_SERVERLESS is False.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]