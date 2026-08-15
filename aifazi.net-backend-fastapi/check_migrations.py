import asyncio

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

asyncio.run(check())