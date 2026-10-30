"""Owned negative test: actual Win32 token/files/network, no Python audit hook."""
import ctypes
import json
import pathlib
import socket
import sys

kernel = ctypes.WinDLL("kernel32", use_last_error=True)
advapi = ctypes.WinDLL("advapi32", use_last_error=True)
kernel.GetCurrentProcess.restype = ctypes.c_void_p
token = ctypes.c_void_p()
if not advapi.OpenProcessToken(ctypes.c_void_p(kernel.GetCurrentProcess()), 8, ctypes.byref(token)):
    raise RuntimeError("token-open-failed")
is_container = ctypes.c_uint32()
needed = ctypes.c_uint32()
if not advapi.GetTokenInformation(token, 29, ctypes.byref(is_container), 4, ctypes.byref(needed)):
    raise RuntimeError("token-read-failed")
kernel.CloseHandle(token)

checks = {"appContainer": bool(is_container.value)}
# The host creates an innocuous sentinel OUTSIDE granted roots; never read a secret.
try:
    pathlib.Path(sys.argv[1]).read_bytes()
    checks["outsideReadDenied"] = False
except PermissionError:
    checks["outsideReadDenied"] = True
try:
    with pathlib.Path(sys.argv[1]).open("ab") as file:
        file.write(b"")
    checks["outsideWriteDenied"] = False
except PermissionError:
    checks["outsideWriteDenied"] = True
for name, address in [("loopbackDenied", ("127.0.0.1", int(sys.argv[2]))), ("internetDenied", ("192.0.2.1", 443))]:
    try:
        with socket.socket() as connection:
            connection.settimeout(2)
            connection.connect(address)
        checks[name] = False
    except OSError as error:
        # Timeout/refused is not proof of a security boundary. Require access denied.
        checks[name] = error.winerror == 10013 or error.errno in {13, 10013}
        # Windows can silently drop loopback for an AppContainer. This is only
        # accepted together with the HOST's successful control connection and
        # zero sandbox accepts, not as standalone proof of network isolation.
        if name == "loopbackDenied" and isinstance(error, TimeoutError):
            checks[name] = "timeout-requires-host-control"
        print(json.dumps({"check": name, "winerror": error.winerror, "errno": error.errno}), file=sys.stderr)
print(json.dumps(checks), flush=True)
sys.exit(0 if all(checks.values()) else 1)
