---
name: sticky-finger-testing
description: Eddie's testing methodology — systematic destructive testing like "a drunk raccoon with admin privileges and a jam sandwich." Touch every surface, touch it wrong, touch it while another thing is touching it, see what catches fire.
when_to_use: After any major refactor, before ship, or when the stack feels too quiet.
purpclaw_wiring: Manual QA protocol — run against any running service
---

# Sticky Finger Testing Protocol

1. Touch every UI element
2. Touch it wrong (bad input, edge cases)
3. Touch it while another thing is touching it (race conditions)
4. See what catches fire