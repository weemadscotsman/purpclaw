---
name: purpclaw-feature-parity-build
description: Class-level workflow for closing gaps in PURPCLAW. Run lib/feature-parity.js, ship against its missing checks, update the checks.
when_to_use: "go balls deep", "almost finished", "finish the build", "no fakes", "no stubs", "no mocks"
purpclaw_wiring: lib/feature-parity.js, lib/commands/harness.js
---

# Feature Parity Build

```bash
node lib/feature-parity.js
```
Ship against the 'missing' checks. Update checks after shipping.