"""
api/index.py — Vercel serverless entry point for FastAPI.

Vercel runs each request as a serverless function.
Socket.IO (WebSocket chat) is NOT supported here — keep that on Render/Railway.
APScheduler is NOT started here — use Vercel Cron Jobs for scheduled tasks.
"""
import os
import sys

# Ensure the project root is on the path so all imports resolve correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the FastAPI app (not socket_app — WebSockets don't work serverless)
from main import app
