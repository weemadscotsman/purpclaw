# SNAKE Operational Protocols

## Entry Protocol

### Phase 1: Reconnaissance (Days 1-14)
1. Map target's external attack surface using passive reconnaissance only
2. Identify vendor relationships, shared infrastructure, trusted third parties
3. Profile target's security vendor stack through job postings, LinkedIn, conference talks
4. Document authentication providers, SSO implementations, MFA methods
5. Compile 90-day behavioral baseline of target's normal access patterns

**Forbidden:** No active scanning. No login attempts. No honeypot interaction.

### Phase 2: Approach (Days 15-45)
1. Select 2-3 initial entry vectors from supply chain or third-party exposure
2. Establish recon presence on target's periphery (vendor portals, partner logins)
3. Validate target's monitoring gaps through timing analysis and response patterns
4. Identify authentication flow weaknesses in OAuth/SAML implementations
5. Prepare 3 fallback entry points for every primary vector

**Entry threshold:** Operation proceeds only when 2+ independent paths confirmed.

### Phase 3: Installation (Days 46-90)
1. Deploy access mechanisms during low-activity windows (weekends, holidays, 2-4 AM local)
2. Layer persistence across multiple system components (registry, scheduled tasks, WMI)
3. Establish primary and secondary C2 channels using approved protocols
4. Validate all persistence points survive target system reboots
5. Document installation timeline for operational recreation

**Success criteria:** Persistent access confirmed through 3 independent verification methods.

## Covert Channel Protocol

### DNS Tunnel Operations
- Query timing: Randomize intervals between 50-500ms
- Subdomain entropy: Use 8-character minimum, high compression encoding
- Refresh cycle: Rotate tunnel domains every 72 hours minimum
- Volume limits: Max 2MB/hour to avoid DNS query threshold alerts

### HTTPS C2 Channels
- Certificate: Use legitimate-looking certs with 1+ year validity
- Domain aging: Minimum 6 months pre-operated domains only
- Traffic patterns: Mimic legitimate CDN or cloud provider egress
- Heartbeat: 15-30 minute randomized intervals

## Persistence Protocol

### Primary Persistence Tier
- Boot-level registry modifications with genuine-appearing keys
- Scheduled tasks named after legitimate system functions
- Service installations with proper signing and descriptions

### Secondary Persistence Tier
- DLL hijacking points in non-monitored application paths
- WMI event subscriptions with benign-appearing filters
- COM object hijacking for long-term stability

### Verification Schedule
- Weekly: Confirm all persistence points active via C2 callback
- Monthly: Test persistence across target security vendor updates
- Quarterly: Full persistence suite validation and refresh

## Exfiltration Protocol

1. Stage data locally in encrypted containers before transmission
2. Chunk large datasets into segments under 10MB
3. Transmit during target's business hours using target's own bandwidth
4. Use victim IP for all exfiltration traffic
5. Delete staging artifacts within 6 hours of completion

## Burn Protocol (Emergency Extraction)

When cover is compromised:
1. Sever C2 connections immediately
2. Disable—do not delete—persistence mechanisms
3. Preserve access channel for future re-entry if possible
4. Initiate 30-day cooling period before any re-engagement
5. File compromise report within 24 hours

**Burn threshold:** If any single persistence point triggers EDR alert, full burn is mandatory.
