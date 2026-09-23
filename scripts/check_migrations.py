import os
import sys
import asyncio

# Allow running from repo root as `python scripts/check_migrations.py`
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'aifazi.net-backend-fastapi'))

from database import supabase

async def check():
    try:
        res = await supabase.table('chat_room_user_keys').select('*').limit(1).execute()
        print('chat_room_user_keys exists:', len(res.data) >= 0)
    except Exception as e:
        print('chat_room_user_keys error:', e)
    
    try:
        res = await supabase.table('store_downloads').select('expires_at').limit(1).execute()
        data = res.data[0] if res.data else {}
        print('store_downloads.expires_at exists:', 'expires_at' in data)
    except Exception as e:
        print('store_downloads error:', e)

    try:
        res = await supabase.table('chat_rooms').select('e2ee_enabled').limit(1).execute()
        data = res.data[0] if res.data else {}
        print('chat_rooms.e2ee_enabled exists:', 'e2ee_enabled' in data)
    except Exception as e:
        print('chat_rooms.e2ee_enabled error:', e)

    try:
        res = await supabase.table('vpn_peers').select('status').limit(1).execute()
        data = res.data[0] if res.data else {}
        print('vpn_peers.status exists:', 'status' in data)
    except Exception as e:
        print('vpn_peers error:', e)

    try:
        res = await supabase.table('store_wishlist').select('*').limit(1).execute()
        print('store_wishlist exists:', len(res.data) >= 0)
    except Exception as e:
        print('store_wishlist error:', e)

    try:
        res = await supabase.table('blog_comments').select('content').limit(1).execute()
        data = res.data[0] if res.data else {}
        print('blog_comments.content exists:', 'content' in data)
    except Exception as e:
        print('blog_comments error:', e)

    try:
        res = await supabase.table('chat_messages').select('*').limit(1).execute()
        print('chat_messages exists:', len(res.data) >= 0)
    except Exception as e:
        print('chat_messages error:', e)

    try:
        res = await supabase.table('monitor_checks').select('*').limit(1).execute()
        print('monitor_checks exists:', len(res.data) >= 0)
    except Exception as e:
        print('monitor_checks error:', e)

    try:
        res = await supabase.table('uptime_checks').select('*').limit(1).execute()
        print('uptime_checks exists:', len(res.data) >= 0)
    except Exception as e:
        print('uptime_checks error:', e)

asyncio.run(check())