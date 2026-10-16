"""routers/fivem - package split of the former routers/fivem.py.

Assembles the fivem router from the domain submodules and re-exports the
handler names for the thin wrapper modules (fivem_*_api.py), which import
them lazily inside their route bodies.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

from routers.fivem_bans_api import router as _bans_router
from routers.fivem_whitelist_api import router as _whitelist_router
from routers.fivem_status_api import router as _status_router
from routers.fivem.discord import router as _discord_router
from routers.fivem.txadmin import router as _txadmin_router
from routers.fivem.connect import router as _connect_router

router.include_router(_bans_router)
router.include_router(_whitelist_router)
router.include_router(_status_router)
router.include_router(_discord_router)
router.include_router(_txadmin_router)
router.include_router(_connect_router)

# Back-compat re-exports (F401 ignored for this package):
#   `from routers.fivem import <handler>` keeps working for the wrapper
#   modules and any external importer.

from routers.fivem.connect import (
    _CONNECT_COOLDOWN_S,
    _CONNECT_TOKEN_EXP,
    _STAFF_DIRECT_ROLES,
    _connect_ban_filters,
    _direct_staff_user,
    _forum_user_for_connect,
    _forum_user_matches_session,
    _jwt_secret,
    _normalize_discord_id,
    _session_identifier_filters,
    check_connect_session,
    generate_connect_token,
    verify_connect_token,
    verify_connect_token_get,
)

from routers.fivem.discord import (
    get_discord_member,
)

from routers.fivem.shared import (
    WL_PUBLIC_FIELDS,
    WL_PUBLIC_FIELDS_WITH_PLAY,
    _DISCORD_GUILD,
    _DISCORD_TOKEN,
    _DISCORD_WL_ROLE,
    _STAMP_INTERVAL_SECONDS,
    _active_priority,
    _build_player_record_row,
    _discord_assign_whitelist_role,
    _discord_remove_whitelist_role,
    _effective_whitelist_status,
    _now,
    _parse_dt,
    _pending_count,
    _priority_update_fields,
    _push_realtime,
    _stamp_application_activity,
    _stamp_due,
    _stamp_last_ran,
    _stamp_whitelist_activity,
    _sync_to_txadmin,
    _upsert_player_record,
    log,
)

from routers.fivem.status import (
    fivem_stats,
    get_public_status_overview,
    heartbeat_sync_players,
    record_player_join,
    record_player_leave,
    refresh_status_timestamp,
    update_players,
    update_server_status,
)

from routers.fivem.txadmin import (
    _TXADMIN_ACTIONS,
    _resolve_live_netid,
    receive_txadmin_event,
    txadmin_live_action,
    txadmin_status,
)

from routers.fivem.whitelist import (
    apply_whitelist,
    bulk_approve_whitelist,
    manual_add_whitelist,
    mark_application_action_synced,
    mark_synced,
    my_whitelist_application,
    pending_application_actions,
    pending_sync,
    refresh_server_sync,
    review_whitelist,
    update_whitelist_identifiers,
    update_whitelist_priority,
)
