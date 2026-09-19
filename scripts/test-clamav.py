import os

import pyclamd

# ClamAV host/port from env (compose service name by default).
CLAMD_HOST = os.environ.get("CLAMD_HOST", "clamav")
CLAMD_PORT = int(os.environ.get("CLAMD_PORT", "3310"))

# Try IPv4 directly
cd = pyclamd.ClamdNetworkSocket(CLAMD_HOST, CLAMD_PORT)
print("ping:", cd.ping())
print("version:", cd.version())

# EICAR test file
eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
result = cd.scan_stream(eicar)
print("eicar scan:", result)
