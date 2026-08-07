# SetRoom packaged release

The ordered `setroom.b64.*` files reconstruct the validated SetRoom source ZIP. The GitHub Actions workflow verifies SHA-256, extracts the real source into `/setroom/`, checks `app.js`, and commits the result without changing the existing weather app at the repository root.

SHA-256:

```text
2d5f16c3e2a9e0ae67ebed6ed60f47709ccc54bae143ae501da1938051e1ca12
```
