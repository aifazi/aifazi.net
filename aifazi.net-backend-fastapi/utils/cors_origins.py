"""CORS allowed-origin construction (B16).

Subdomains of the configured frontend root (store/fivem/status/cdn/...) are
trusted on ANY deployment — not just aifazi.net — so a fresh clone on its own
domain gets working cross-subdomain CORS without editing code. Production keeps
that subdomain pattern; the old inline code wiped it in an `else` branch, which
CORS-blocked subdomain frontends that call the API directly.

Localhost origins are dev-only: they must never be trusted in production,
where a permissive ACAO would let any local process read credentialed API
responses.
"""
import re

# Public frontend origins, trusted on every deployment.
_PROD_STATIC = {
    "https://aifazi.net",
    "https://www.aifazi.net",
    "https://admin.aifazi.net",
}

# Dev-only localhost origins.
_DEV_LOCALHOST = {
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
}

# Development only — allow Vercel preview deploys.
_DEV_DYNAMIC = [
    re.compile(r"^https://[a-z0-9\-]+\.vercel\.app$"),
    re.compile(r"^https://[a-z0-9\-]+\.aifazi\.net$"),
]


def build_cors(
    frontend_url: str, is_production: bool
) -> tuple[set[str], list[re.Pattern]]:
    """Return (static origins, dynamic patterns) for the given deployment."""
    static: set[str] = set(_PROD_STATIC)
    static.add(frontend_url)
    if not is_production:
        static |= set(_DEV_LOCALHOST)

    patterns: list[re.Pattern] = []
    root = frontend_url.split("//", 1)[-1].split("/", 1)[0]
    # Subdomains of the configured frontend root are trusted. Skip numeric
    # hosts (IPs) and localhost, which have no meaningful subdomain set.
    if (
        "." in root
        and not root.replace(".", "").isdigit()
        and not root.startswith("localhost")
    ):
        static.add(f"https://{root}")
        static.add(f"https://www.{root}")
        patterns.append(re.compile(rf"^https://[a-z0-9\-]+\.{re.escape(root)}$"))

    if not is_production:
        # In dev the subdomain pattern above was never appended (the root is
        # localhost), so a plain reassignment is safe here.
        patterns = list(_DEV_DYNAMIC)
    return static, patterns


def is_allowed_origin(origin: str, static: set[str], patterns: list[re.Pattern]) -> bool:
    """Fail-closed origin check: exact static match or a compiled subdomain pattern."""
    if origin in static:
        return True
    return any(p.match(origin) for p in patterns)
