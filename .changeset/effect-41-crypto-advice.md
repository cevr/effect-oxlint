---
"oxlint-plugin-effect": minor
---

Require Effect >=4.1.0 <5 so diagnostics recommend APIs available in the supported peer range. The plugin does not detect Effect minor versions.

Replace removed Crypto advice with SecureRandom and Digest from effect/crypto. Node crypto diagnostics now also recommend Mac, Signature, Aead/Cipher, Kdf, KeyAgreement and the matching key-generation services for supported operations. Provide the required crypto layers at your application entry point; runtime services bundles no longer include them. Unsupported algorithms still belong in platform adapters.

Point existing Bun glob, terminal stream and environment bans to FileSystem.glob, Terminal.size and UserDirectories where applicable. Update development dependencies to Effect and @effect/vitest 4.1.2 with Vitest 5 to satisfy the test integration peer dependency, while retaining the Effect 4.0.0 regression-test alias.
