from authentik.policies.expression.models import ExpressionPolicy
p = ExpressionPolicy.objects.filter(name="wg-identity-sso")
if p.exists():
    print("EXISTS pk=" + str(p.first().pk))
else:
    print("NOT_FOUND")
