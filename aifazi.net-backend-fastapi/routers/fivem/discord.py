"""routers/fivem/discord.py - extracted from routers/fivem.py."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

from routers.fivem.shared import _DISCORD_GUILD, _DISCORD_TOKEN
from dependencies import require_staff
from fastapi import Depends, HTTPException
import httpx

@router.get("/discord/member/{discord_id}")
async def get_discord_member(discord_id: str, _: dict = Depends(require_staff)):
    """
    Look up a Discord member's presence and roles in the configured guild.
    Returns: { in_server, username, avatar, roles: [{id, name, color}] }
    """
    if not all([_DISCORD_TOKEN, _DISCORD_GUILD]):
        raise HTTPException(503, "Discord bot not configured")

    headers = {"Authorization": f"Bot {_DISCORD_TOKEN}"}

    async with httpx.AsyncClient(timeout=8) as client:
        # Get member info
        member_r = await client.get(
            f"https://discord.com/api/v10/guilds/{_DISCORD_GUILD}/members/{discord_id}",
            headers=headers,
        )
        if member_r.status_code == 404:
            return {"in_server": False}
        if member_r.status_code != 200:
            raise HTTPException(502, f"Discord API {member_r.status_code}")

        member = member_r.json()

        # Get guild roles to resolve role names & colors
        roles_r = await client.get(
            f"https://discord.com/api/v10/guilds/{_DISCORD_GUILD}/roles",
            headers=headers,
        )
        guild_roles = {r["id"]: r for r in (roles_r.json() if roles_r.status_code == 200 else [])}

    member_role_ids = member.get("roles", [])
    resolved_roles = [
        {
            "id":    rid,
            "name":  guild_roles[rid]["name"],
            "color": f"#{guild_roles[rid]['color']:06x}" if guild_roles[rid]["color"] else "#888",
        }
        for rid in member_role_ids
        if rid in guild_roles and guild_roles[rid]["name"] != "@everyone"
    ]

    user = member.get("user", {})
    avatar_hash = member.get("avatar") or user.get("avatar")
    avatar_id   = user.get("id", discord_id)
    avatar_url  = f"https://cdn.discordapp.com/avatars/{avatar_id}/{avatar_hash}.webp?size=64" if avatar_hash else None

    return {
        "in_server":   True,
        "username":    user.get("username", "Unknown"),
        "display_name": member.get("nick") or user.get("global_name") or user.get("username"),
        "avatar":      avatar_url,
        "roles":       resolved_roles,
    }
