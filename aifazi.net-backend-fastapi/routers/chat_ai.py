"""
routers/chat_ai.py — AI chat disabled (OpenAI removed).
"""
from fastapi import APIRouter, HTTPException

router = APIRouter()

@router.post("/public")
async def chat_ai_public():
    raise HTTPException(503, "AI chat is not available")

@router.post("")
async def chat_ai():
    raise HTTPException(503, "AI chat is not available")
