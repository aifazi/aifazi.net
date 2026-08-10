"""
routers/network.py — Network utilities (Ping, Traceroute, DNS Lookup)
Proves networking expertise via live backend tools.
"""
import asyncio
import socket
import platform
from fastapi import APIRouter, Query, HTTPException, Depends
from dependencies import require_staff
from utils.ssrf import resolve_public_ips

router = APIRouter()

def _validate_host(host: str):
    """Sanitize + reject hosts that resolve into private/loopback/metadata space
    so a compromised staff token can't turn these tools into an internal scanner."""
    clean_host = "".join(c for c in host if c.isalnum() or c in ".-")
    if not clean_host:
        raise HTTPException(400, "Invalid host")
    if not resolve_public_ips(clean_host):
        raise HTTPException(400, "Host is not resolvable to a public address")
    return clean_host

@router.get("/ping")
async def ping(host: str = Query(..., min_length=1), _: dict = Depends(require_staff)):
    clean_host = _validate_host(host)

    cmd = ["ping", "-c", "4", clean_host]
    if platform.system() == "Windows":
        cmd = ["ping", "-n", "4", clean_host]
        
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        except asyncio.TimeoutError:
            proc.kill()
            return {"host": clean_host, "output": "Request timed out.", "status": "timeout"}
        return {
            "host": clean_host,
            "output": stdout.decode() if stdout else stderr.decode(),
            "status": "success" if proc.returncode == 0 else "failed"
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"error": str(e), "status": "error"}

@router.get("/dns")
async def dns_lookup(host: str = Query(..., min_length=1), _: dict = Depends(require_staff)):
    clean_host = _validate_host(host)
    try:
        # Get A records
        addr_info = socket.getaddrinfo(clean_host, None)
        ips = list(set([info[4][0] for info in addr_info]))
        return {
            "host": clean_host,
            "ips": ips,
            "status": "success"
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"error": str(e), "status": "error"}

@router.get("/whois")
async def whois(host: str = Query(..., min_length=1), _: dict = Depends(require_staff)):
    # Note: Real WHOIS usually requires a library or external API
    # For now, we'll use a simple socket-based approach or a mock
    # because installing 'whois' binary might not be possible in all envs
    return {"message": "Whois tool coming soon", "host": host}
