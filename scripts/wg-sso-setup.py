#!/usr/bin/env python3
"""WireGuard SSO policy for Authentik.

Creates an expression policy that auto-authenticates users connecting
from the WireGuard subnet. Their WG key already proves identity.

Usage: docker exec -i authentik-server-<uuid> ak shell < /tmp/wg-sso-setup.py
"""
from authentik.policies.expression.models import ExpressionPolicy
from authentik.core.models import User

WG_EXPRESSION = '''
# WireGuard Identity SSO
# If source IP is from a known WireGuard peer, auto-authenticate.
wg_users = {
    "10.8.0.3": "tanvir",
}

source_ip = request.http_request.META.get("REMOTE_ADDR", "")

if source_ip in wg_users:
    username = wg_users[source_ip]
    try:
        user = User.objects.get(username=username)
        request.context["pending_user"] = user
    except User.DoesNotExist:
        return False
    return True

return True
'''

existing = ExpressionPolicy.objects.filter(name="wg-identity-sso")
if existing.exists():
    p = existing.first()
    p.expression = WG_EXPRESSION
    p.save()
    print(f"Updated existing policy: {p.name} (pk={p.pk})")
else:
    p = ExpressionPolicy.objects.create(
        name="wg-identity-sso",
        expression=WG_EXPRESSION,
    )
    print(f"Created new policy: {p.name} (pk={p.pk})")

print(f"POLICY_PK={p.pk}")
