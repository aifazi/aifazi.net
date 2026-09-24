from pathlib import Path

p = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\ForumThread.jsx")
t = p.read_text(encoding="utf-8")

# 1) import ErrorRetry
if "core/Feedback" not in t:
    t = t.replace(
        "import { useNavigate }",
        "import { ErrorRetry } from '@/core/Feedback'\nimport { useNavigate }",
        1,
    )

# 2) add loadError state near loading
if "loadError" not in t:
    t = t.replace(
        "const [loading, setLoading]   = useState(true)",
        "const [loading, setLoading]   = useState(true)\n  const [loadError, setLoadError] = useState(false)",
        1,
    )

# 3) replace silent navigate on fetch fail
t = t.replace(
    ".catch(() => navigate('/forum'))",
    ".catch(() => { setLoadError(true); setLoading(false) })",
    1,
)

# 4) render ErrorRetry before loading UI when loadError
old_loading = "  if (loading) return <div className=\"page-container community-page\" style={{ zIndex: 1, position: 'relative' }}>"
new_loading = """  if (loadError) return (
    <div className="page-container community-page" style={{ zIndex: 1, position: 'relative' }}>
      <ErrorRetry
        title="Could not load this thread"
        hint="The forum API did not return a thread. Check your connection and try again."
        onRetry={() => window.location.reload()}
      />
    </div>
  )

  if (loading) return <div className="page-container community-page\" style={{ zIndex: 1, position: 'relative' }}>"""
if old_loading in t and "if (loadError)" not in t:
    t = t.replace(old_loading, new_loading, 1)

p.write_text(t, encoding="utf-8")
print("ForumThread ErrorRetry adopted")
print("loadError", t.count("loadError"), "ErrorRetry", t.count("ErrorRetry"))
