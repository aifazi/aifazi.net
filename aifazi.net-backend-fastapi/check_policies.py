from database import supabase

# Check if policies exist on chat_messages
res = supabase.table('pg_policies').select('policyname').eq('schemaname', 'public').eq('tablename', 'chat_messages').execute()
print('Policies on chat_messages:', res.data)

# Check if chat_members table exists and has required columns
try:
    res = supabase.table('chat_members').select('*').limit(1).execute()
    print('chat_members columns:', list(res.data[0].keys()) if res.data else 'empty')
except Exception as e:
    print('chat_members error:', e)

# Check if store_downloads has expires_at
try:
    res = supabase.table('store_downloads').select('expires_at').limit(1).execute()
    data = res.data[0] if res.data else {}
    print('store_downloads.expires_at exists:', 'expires_at' in data)
except Exception as e:
    print('store_downloads error:', e)

# Check if chat_rooms has e2ee_enabled
try:
    res = supabase.table('chat_rooms').select('e2ee_enabled').limit(1).execute()
    data = res.data[0] if res.data else {}
    print('chat_rooms.e2ee_enabled exists:', 'e2ee_enabled' in data)
except Exception as e:
    print('chat_rooms.e2ee_enabled error:', e)