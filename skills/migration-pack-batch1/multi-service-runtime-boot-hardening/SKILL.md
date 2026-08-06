---
name: multi-service-runtime-boot-hardening
description: Harden the boot of a multi-service runtime using PM2 with Node.js and Python services plus Next.js frontend. Silent boot: no console windows, no surprise browser tabs, no cascade crashes.
when_to_use: Starting up the stack, adding a new service, or fixing noisy boot.
purpclaw_wiring: boot.js, ecosystem.config.js, lib/child-registry.js
---

# Boot Hardening

1. All spawns through lib/child-registry.js
2. No detached:true
3. No shell:true
4. windowsHide:true on Python services
5. safe-start for ordered boot