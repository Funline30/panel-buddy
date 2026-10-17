#!/usr/bin/env python3
"""Write the ASC_KEY_P8 secret to a .p8 file in clean PEM form. Never prints the key."""
import os, re, sys

raw = os.environ.get("ASC_KEY_P8", "")
raw = raw.replace("\\n", "\n").replace("\r", "")
m = re.search(r"-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----", raw, re.S)
body = m.group(1) if m else raw
b64 = re.sub(r"[^A-Za-z0-9+/=]", "", body)
if len(b64) < 100:
    print("::error::ASC_KEY_P8 does not look like an App Store Connect .p8 key (too short)")
    sys.exit(1)
lines = [b64[i:i + 64] for i in range(0, len(b64), 64)]
pem = "-----BEGIN PRIVATE KEY-----\n" + "\n".join(lines) + "\n-----END PRIVATE KEY-----\n"
with open(sys.argv[1], "w") as f:
    f.write(pem)
print("API key written (%d base64 chars, had PEM header: %s)" % (len(b64), bool(m)))
