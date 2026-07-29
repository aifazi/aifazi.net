"""routers/content_aggregator.py
Consolidates global site data (settings, active banners, social links) 
into a single request to reduce TTFB and frontend waterfalling.
"""
from fastapi import APIRouter
from database import supabase
from routers.site_settings import get_settings
from routers.banners import list_banners

router = APIRouter()

import asyncio

@router.get("/global")
async def get_global_content():
    # Fetch settings and banners in parallel to minimize TTFB
    settings_task = get_settings()
    banners_task = list_banners()
    
    settings, banners = await asyncio.gather(settings_task, banners_task)
    
    # Extract common social links for convenience
    social = {
        "github": settings.get("github"),
        "linkedin": settings.get("linkedin"),
        "twitter": settings.get("twitter"),
        "email": settings.get("email", "tanvir@aifazi.net")
    }
    
    return {
        "settings": settings,
        "banners": banners,
        "social": social,
        "status": "online"
    }
