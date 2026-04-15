# SPIDER Operational Protocols

## Collection Architecture Protocol

### Spider Web Design
1. **Hub Nodes (5 primary)**
   - Central coordination servers in 5 jurisdictions
   - 99.9% uptime SLA, geographic distribution
   - Encrypted mesh communication between hubs
   - Automated failover with sub-60-second recovery

2. **Collector Nodes (100+ distributed)**
   - Residential proxy rotation for surface web
   - Tor bridges for dark web access
   - Dedicated infrastructure for high-value sources
   - Dynamic scaling based on collection demand

3. **Processing Nodes (10 primary)**
   - Normalization engine for raw data
   - Deduplication and correlation engine
   - ML-powered classification and tagging
   - Alert generation and routing

### Collection Schedule
| Source Type | Frequency | Priority Override |
|-------------|-----------|-------------------|
| News/Media | Every 15 min | Real-time for breaking |
| Social Media | Every 5 min | Real-time for threats |
| Forums | Every 30 min | Hourly for active threads |
| Dark Web | Every hour | 15-min for urgent |
| Data Breaches | Continuous | Immediate for critical |
| Corporate | Daily | Weekly for monitoring |

## Dark Web Operations Protocol

### Access Methodology
1. Establish Tor circuit through hardened relay network
2. Deploy separate collector identity per forum/marketplace
3. Use platform-native browsers (Tor Browser, Firefox) for interaction
4. Rotate exit nodes every 4 hours minimum
5. Never access dark web from infrastructure also used for non-dark operations

### Forum Monitoring Standards
- Maintain minimum 72-hour presence before active collection
- Profile individual forums for optimal posting/collection times
- Mirror entire forum content for offline analysis capability
- Track all actor nicknames with cross-reference to known identities
- Document forum moderation patterns and trigger thresholds

### Marketplace Monitoring Standards
- Track vendor reputation scores over time
- Monitor product pricing across multiple marketplaces
- Document shipping methods and geographical patterns
- Correlate vendor activity with external events
- Archive all product listings before removal

## Data Processing Protocol

### Ingestion Pipeline
1. Raw data intake from all collector nodes
2. Initial classification (auto-tag with ML, human review for ambiguous)
3. Deduplication against existing corpus (simhash + manual review)
4. Normalization to standard schema
5. Cross-reference against existing intelligence
6. Alert generation for high-confidence matches
7. Long-term storage with appropriate retention

### Quality Standards
| Data Type | Minimum Fields | Completeness Threshold |
|-----------|----------------|------------------------|
| Breach Data | Email, hash, source | 95% |
| Social Media | Platform, handle, content, timestamp | 90% |
| Forum Posts | Platform, author, content, timestamp | 85% |
| Dark Web Items | Platform, vendor, product, price | 80% |
| Corporate Intel | Organization, event type, source, timestamp | 90% |

## Retention and Deletion Protocol

### Data Retention Schedule
- **Hot cache:** 90 days (frequently accessed intelligence)
- **Warm storage:** 1 year (historical reference)
- **Cold archive:** 7 years (long-term trend analysis)
- **Permanent:** Breach data, actor profiles, strategic intelligence

### Deletion Triggers
- Source requests removal of their content
- Legal compliance requires purge (GDPR, CCPA, etc.)
- Data assessed as operationally compromised
- Intelligence superseded and no historical value

## Alert Protocol

### Priority Classification
| Priority | Latency | Dissemination |
|----------|---------|---------------|
| Critical | < 5 min | Direct to analysts + automated response |
| High | < 15 min | Analyst queue + dashboard update |
| Medium | < 1 hour | Batch digest |
| Low | Daily summary | Weekly integration |

### Alert Criteria
- **Critical:** Active exploitation of 0-day, imminent physical threat, urgent HUMINT correlation
- **High:** New breach containing priority target data, dark web chatter mentioning priority targets
- **Medium:** Industry-wide trends, general threat actor activity, routine corporate intelligence
- **Low:** Long-term trend shifts, strategic landscape changes

## Source Protection Protocol

### Operational Security
- No collector IP addresses logged in collection metadata
- All dark web identities isolated from organizational identity
- Payment for dark web sources through approved anonymization methods only
- Source compartmentalization: collectors cannot access source identities

### Burn Response
If a source is compromised or at risk:
1. Immediately isolate affected collector
2. Preserve all collected data from that source
3. Do not access source with any infrastructure that can be linked to organization
4. 30-day cooling period before any re-engagement attempt
5. Full debrief and protocol review within 72 hours
