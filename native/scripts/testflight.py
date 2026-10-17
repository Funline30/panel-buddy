#!/usr/bin/env python3
"""TestFlight setup through the App Store Connect API (runs in GitHub Actions).

1. find the app by bundle id
2. wait for the build (BUILD_NUMBER, or the newest) to finish processing
3. answer export compliance if still open
4. find or create an internal testing group (GROUP_NAME) and add the build
5. add TESTER_EMAIL to the group (must be an App Store Connect user on the team) and send the invite
Prints a summary as GitHub annotations. Never prints the key or tokens.
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

import jwt

API = "https://api.appstoreconnect.apple.com"
KEY_ID = os.environ["ASC_KEY_ID"]
ISSUER = os.environ["ASC_ISSUER_ID"]
raw = os.environ["ASC_KEY_P8"].replace("\\n", "\n").replace("\r", "")
m = re.search(r"-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----", raw, re.S)
b64 = re.sub(r"[^A-Za-z0-9+/=]", "", m.group(1) if m else raw)
PEM = "-----BEGIN PRIVATE KEY-----\n" + "\n".join(b64[i:i + 64] for i in range(0, len(b64), 64)) + "\n-----END PRIVATE KEY-----\n"
BUNDLE_ID = os.environ.get("BUNDLE_ID", "com.funline30.ampmap")
BUILD_NUMBER = (os.environ.get("BUILD_NUMBER") or "").strip()
TESTER_EMAIL = (os.environ.get("TESTER_EMAIL") or "").strip()
GROUP_NAME = (os.environ.get("GROUP_NAME") or "Caleb").strip()


def note(kind, title, msg):
    msg = str(msg).replace("%", "%25").replace("\r", "").replace("\n", "%0A")
    print(f"::{kind} title={title}::{msg}", flush=True)


def token():
    now = int(time.time())
    return jwt.encode({"iss": ISSUER, "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
                      PEM, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})


def call(method, path, body=None, ok=(200, 201, 204)):
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode() or "{}"
            return r.status, json.loads(txt)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            j = json.loads(txt)
        except Exception:
            j = {"raw": txt[:500]}
        return e.code, j


def errs(j):
    return "; ".join(f"{e.get('status')} {e.get('code')}: {e.get('detail') or e.get('title')}" for e in j.get("errors", [])) or json.dumps(j)[:400]


# 1. app
st, j = call("GET", f"/v1/apps?filter[bundleId]={BUNDLE_ID}&fields[apps]=name,bundleId,sku")
if st != 200 or not j.get("data"):
    note("error", "app", f"App {BUNDLE_ID} not found in App Store Connect ({st}): {errs(j) if st != 200 else 'no app record'}")
    sys.exit(1)
app = j["data"][0]
APP_ID = app["id"]
note("notice", "app", f"{app['attributes'].get('name')} ({BUNDLE_ID}) app id {APP_ID}")

# 2. build
deadline = time.time() + 50 * 60
build = None
last_state = None
while time.time() < deadline:
    q = f"/v1/builds?filter[app]={APP_ID}&sort=-uploadedDate&limit=5&fields[builds]=version,processingState,uploadedDate,usesNonExemptEncryption,expired"
    if BUILD_NUMBER:
        q += f"&filter[version]={BUILD_NUMBER}"
    st, j = call("GET", q)
    if st == 200 and j.get("data"):
        build = j["data"][0]
        state = build["attributes"].get("processingState")
        if state != last_state:
            print(f"build {build['attributes'].get('version')} processingState={state}", flush=True)
            last_state = state
        if state == "VALID":
            break
        if state in ("FAILED", "INVALID"):
            note("error", "build", f"Build {build['attributes'].get('version')} processing ended {state}. Check App Store Connect email from Apple for the reason.")
            sys.exit(1)
    elif st != 200:
        print("builds query", st, errs(j), flush=True)
    else:
        print("build not visible in App Store Connect yet", flush=True)
    time.sleep(30)
else:
    note("error", "build", f"Build {BUILD_NUMBER or '(newest)'} did not finish processing in 50 min (last state {last_state}). Re-run with skip_build to continue.")
    sys.exit(1)

BID = build["id"]
ver = build["attributes"].get("version")
note("notice", "build", f"Build {ver} processed: VALID (uploaded {build['attributes'].get('uploadedDate')})")

# 3. export compliance
if build["attributes"].get("usesNonExemptEncryption") is None:
    st, j = call("PATCH", f"/v1/builds/{BID}", {"data": {"type": "builds", "id": BID, "attributes": {"usesNonExemptEncryption": False}}})
    print("export compliance set:", st, "" if st == 200 else errs(j), flush=True)

# 4. internal group
st, j = call("GET", f"/v1/betaGroups?filter[app]={APP_ID}&limit=50&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds")
groups = j.get("data", []) if st == 200 else []
internal = [g for g in groups if g["attributes"].get("isInternalGroup")]
group = next((g for g in internal if g["attributes"].get("name") == GROUP_NAME), None) or (internal[0] if internal else None)
if group is None:
    st, j = call("POST", "/v1/betaGroups", {"data": {"type": "betaGroups",
                                                    "attributes": {"name": GROUP_NAME, "isInternalGroup": True, "hasAccessToAllBuilds": True},
                                                    "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})
    if st not in (200, 201):
        note("error", "group", f"Could not create internal group '{GROUP_NAME}' ({st}): {errs(j)}")
        sys.exit(1)
    group = j["data"]
    note("notice", "group", f"Created internal group '{GROUP_NAME}'")
else:
    note("notice", "group", f"Using internal group '{group['attributes'].get('name')}'")
GID = group["id"]

st, j = call("POST", f"/v1/betaGroups/{GID}/relationships/builds", {"data": [{"type": "builds", "id": BID}]})
print("add build to group:", st, "" if st in (200, 204) else errs(j), flush=True)

# 5. tester
users = []
st, j = call("GET", "/v1/users?limit=50&fields[users]=username,firstName,lastName,roles")
if st == 200:
    users = j.get("data", [])
    note("notice", "team users", ", ".join(f"{u['attributes'].get('username')} ({','.join(u['attributes'].get('roles') or [])})" for u in users))
else:
    print("users list", st, errs(j), flush=True)
email = TESTER_EMAIL
if users and email.lower() not in [(u["attributes"].get("username") or "").lower() for u in users]:
    holder = next((u for u in users if "ACCOUNT_HOLDER" in (u["attributes"].get("roles") or [])), users[0])
    note("warning", "tester", f"{email} is not an App Store Connect user on this team; using the account holder {holder['attributes'].get('username')} instead")
    email = holder["attributes"].get("username")
first = next((u["attributes"].get("firstName") for u in users if (u["attributes"].get("username") or "").lower() == email.lower()), None) or "Caleb"
last = next((u["attributes"].get("lastName") for u in users if (u["attributes"].get("username") or "").lower() == email.lower()), None) or "Margoitta"

st, j = call("GET", f"/v1/betaTesters?filter[email]={urllib.parse.quote(email)}&limit=5")
tester = (j.get("data") or [None])[0] if st == 200 else None
if tester is None:
    st, j = call("POST", "/v1/betaTesters", {"data": {"type": "betaTesters",
                                                     "attributes": {"email": email, "firstName": first, "lastName": last},
                                                     "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": GID}]}}}})
    if st in (200, 201):
        tester = j["data"]
        note("notice", "tester", f"Added {email} to '{group['attributes'].get('name')}' (Apple emails the TestFlight invite)")
    else:
        note("error", "tester", f"Could not add tester {email} ({st}): {errs(j)}")
        sys.exit(1)
else:
    st, j = call("POST", f"/v1/betaGroups/{GID}/relationships/betaTesters", {"data": [{"type": "betaTesters", "id": tester["id"]}]})
    note("notice", "tester", f"{email} already a tester; group add: {st} {'' if st in (200, 204) else errs(j)}")
    if st not in (200, 204):
        # The tester record may belong to another app's groups (e.g. Runs Ledger). Creating the tester
        # again with this group attached is Apple's documented way to add an existing person to a group.
        st2, j2 = call("POST", "/v1/betaTesters", {"data": {"type": "betaTesters",
                                                         "attributes": {"email": email, "firstName": first, "lastName": last},
                                                         "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": GID}]}}}})
        note("notice", "tester", f"re-create with group '{group['attributes'].get('name')}': {st2} {'' if st2 in (200, 201) else errs(j2)}")
        if st2 in (200, 201):
            tester = j2["data"]

# who is in the group now
st, j = call("GET", f"/v1/betaGroups/{GID}/betaTesters?limit=50&fields[betaTesters]=email,inviteType,state")
if st == 200:
    note("notice", "group members", ", ".join(f"{t['attributes'].get('email')} ({t['attributes'].get('inviteType')}, {t['attributes'].get('state')})" for t in j.get("data", [])) or "(none)")
else:
    print("group members", st, errs(j), flush=True)

st, j = call("POST", "/v1/betaTesterInvitations", {"data": {"type": "betaTesterInvitations", "relationships": {
    "app": {"data": {"type": "apps", "id": APP_ID}},
    "betaTester": {"data": {"type": "betaTesters", "id": tester["id"]}}}}})
note("notice", "invite", f"Invitation to {email}: {st} {'sent' if st in (200, 201) else errs(j)}")

# summary
st, j = call("GET", f"/v1/builds/{BID}/buildBetaDetail")
if st == 200:
    a = j["data"]["attributes"]
    note("notice", "summary", f"Build {ver}: internal TestFlight state {a.get('internalBuildState')}, external {a.get('externalBuildState')}; tester {email}; group {group['attributes'].get('name')}")
