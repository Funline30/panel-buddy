# Firestore rules test (emulator)

Not part of `npm test` (it needs Java and the Firestore emulator). 120 checks: owner access, old
sharing, edit codes (hash compare, wrong code, change/turn off/expiry kill sessions), the
10-tries-per-hour lockout, homeowner hand-off (claim) and People with access.

```
cd test/rules
npm i firebase-tools@13 @firebase/rules-unit-testing@4 firebase@11
echo '{"firestore":{"rules":"../../firestore.rules"},"emulators":{"firestore":{"host":"127.0.0.1","port":8085},"ui":{"enabled":false}}}' > firebase.json
npx firebase emulators:exec --only firestore --project demo-ampmap 'node rules.emulator.mjs'
```
