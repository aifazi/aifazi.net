"""utils/ssrf.py — Shared SSRF guard for staff/admin network tools.

Prevents a compromised staff token (or a misconfigured target) from being used
to probe private / loopback / link-local / cloud-metadata space. Hostnames are
resolved once, every candidate address validated against the blocklist, and the
connection must use a PINNED public IP (see _resolve_safe_ip) so a DNS-rebinding
attacker can't swap the target between validation and connect.
"""
import ipaddress
import socket

BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),        # "this host" / unspecified
    ipaddress.ip_network("10.0.0.0/8"),       # RFC1918
    ipaddress.ip_network("100.64.0.0/10"),    # CGNAT
    ipaddress.ip_network("127.0.0.0/8"),      # loopback
    ipaddress.ip_network("169.254.0.0/16"),   # link-local + AWS/GCP/Azure IMDS
    ipaddress.ip_network("172.16.0.0/12"),    # RFC1918
    ipaddress.ip_network("192.0.0.0/24"),     # IETF protocol assignments
    ipaddress.ip_network("192.168.0.0/16"),   # RFC1918
    ipaddress.ip_network("198.18.0.0/15"),    # benchmark testing
    ipaddress.ip_network("224.0.0.0/4"),      # multicast
    ipaddress.ip_network("240.0.0.0/4"),      # reserved
    ipaddress.ip_network("::/128"),           # IPv6 unspecified
    ipaddress.ip_network("::1/128"),          # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),         # IPv6 ULA
    ipaddress.ip_network("fe80::/10"),        # IPv6 link-local
    ipaddress.ip_network("ff00::/8"),         # IPv6 multicast
]


def is_blocked_ip(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any(ip_obj in net for net in BLOCKED_NETWORKS)


def resolve_public_ips(host: str) -> list[str]:
    """Resolve host → list of public IPs; empty list if any/all are blocked or
    the host is unresolvable."""
    try:
        ip_obj = ipaddress.ip_address(host)
        return [host] if not is_blocked_ip(ip_obj) else []
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except Exception:
        return []
    out: list[str] = []
    for info in infos:
        try:
            ip_obj = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if is_blocked_ip(ip_obj):
            return []
        out.append(info[4][0])
    return out


def resolve_safe_ip(host: str) -> str | None:
    """First public IP for host, or None if blocked/unresolvable (pinned target)."""
    ips = resolve_public_ips(host)
    return ips[0] if ips else None
