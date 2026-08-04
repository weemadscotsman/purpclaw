# Current Troubleshooting

Last updated: 2026-07-20.

1. Run `purpclaw status` to inspect declared/runtime process state.
2. Run `purpclaw doctor` for bounded read-only checks.
3. Run `purpclaw bughunt` for deeper service probes.
4. Use `purpclaw safe-start --core` to recover the required profile.
5. Run `purpclaw smoke --json` to verify end-to-end behavior.

Do not interpret PM2 presence as health. Do not require optional voice, cognitive,
vision, messaging, or companion lanes unless the selected profile claims them.
If Next build output appears stale, stop the relevant dev process before removing
only this repository's resolved `.next` cache and rebuilding.

For file rollback, use the checkpoint associated with a direct governed mutation.
Shell-created mutations may require Git/manual recovery because shell activity is
not automatically checkpointed.
