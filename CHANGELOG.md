## [1.0.2](https://github.com/yedoma-labs/kulyn-flags/compare/v1.0.1...v1.0.2) (2026-10-28)


### Bug Fixes

* **scan:** recognize optional-chaining calls and flags access ([f92e034](https://github.com/yedoma-labs/kulyn-flags/commit/f92e0344e57d75473b474f847f8fb4abe2821a14))

## [1.0.1](https://github.com/yedoma-labs/kulyn-flags/compare/v1.0.0...v1.0.1) (2026-10-28)


### Bug Fixes

* **scan:** ignore calls and flags access inside quoted strings ([5103f1d](https://github.com/yedoma-labs/kulyn-flags/commit/5103f1d5a99f6d66276bffbed2d97f247ad000a8))

# 1.0.0 (2026-10-27)


### Bug Fixes

* **scan:** only read string literals that are whole call arguments ([e3c653e](https://github.com/yedoma-labs/kulyn-flags/commit/e3c653e981b3416be90275619023dca33dbdc672))


### Features

* **hygiene:** add checkFlagHygiene and assertFlagHygiene ([bb7862f](https://github.com/yedoma-labs/kulyn-flags/commit/bb7862f99136141db994e3018b9295f91af96517))
* **registry:** add defineFlags with key, owner, date and lifetime validation ([c280736](https://github.com/yedoma-labs/kulyn-flags/commit/c280736f22ff6213bd7ab3f4f82d460b4d9f7702))
* **scan:** add findFlagKeysInSource with comment and template literal masking ([82e5eef](https://github.com/yedoma-labs/kulyn-flags/commit/82e5eeff973d350c4daa12971b378ffb40e763ae))
