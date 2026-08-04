# PurpClaw Startup Operating Plan

## Rule

Prove the product before scaling outreach, spending, credit, or fundraising.
PurpClaw may research, draft, score, organize, and test autonomously. A human
must approve legal filings, account creation, purchases, credit applications,
contracts, and outbound messages.

## Proof Gates

1. Reproducible installation and recovery.
2. Honest service-health and rendered-page checks.
3. Three repeatable customer workflows with measured outcomes.
4. Operator approval and audit logs for external actions.
5. A pilot offer, price hypothesis, onboarding runbook, and support boundary.
6. At least one documented design-partner or pilot result before broad claims.

## Company Sequence

1. Choose jurisdiction and entity structure with legal and tax advice.
2. Register the entity and obtain the applicable tax identifier.
3. Open a dedicated bank account and bookkeeping system.
4. Publish website identity, privacy, terms, contact, and messaging consent.
5. Configure payments, insurance review, vendor policy, and expense approvals.
6. Establish credit only against a written budget and repayment plan.

## Products

- Local AI workstation setup.
- Managed agent operations subscription.
- Portable Pocket OS deployment.

Keep products in draft until their proof requirements in
`agent_work/business/products.json` are satisfied.

## Marketing System

1. Define one ideal customer profile.
2. Build a consented CRM and evidence-backed lead score.
3. Draft personalized email, LinkedIn, and SMS copy.
4. Use SMS only for documented opt-ins.
5. Run small pilot cohorts and measure reply, meeting, activation, and revenue.
6. Stop channels that do not produce qualified outcomes.

## Funding System

Create one source of truth for traction, pricing, costs, raise size, use of
funds, milestones, and team details. Generate the deck, memo, model, data room,
and investor outreach from that source. Do not claim fabricated UI metrics as
traction.

## Twilio

Configure:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`
- `PURPCLAW_MESSAGE_BRAND`

US application-to-person SMS generally requires sender registration and a
documented opt-in/opt-out flow. The CLI records consent and refuses sends to
unconsented recipients.

## Primary References

- Twilio A2P 10DLC: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
- Twilio Consent Management: https://www.twilio.com/docs/messaging/features/consent-api
- Shopify GraphQL Admin API: https://shopify.dev/docs/api/admin-graphql/latest
- SBA business bank accounts: https://www.sba.gov/business-guide/launch-your-business/open-business-bank-account
- SBA business credit: https://www.sba.gov/business-guide/plan-your-business/establish-business-credit
