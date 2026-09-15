import pyclamd

# Try IPv4 directly
cd = pyclamd.ClamdNetworkSocket("10.0.1.9", 3310)
print("ping:", cd.ping())
print("version:", cd.version())

# EICAR test file
eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
result = cd.scan_stream(eicar)
print("eicar scan:", result)
