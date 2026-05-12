# BOSS SiteOps and Wordfriends Delivery Plan

Last updated: 2026-05-12

## 1. Product Split

### siteops.09car.co.kr

Internal BOSS operations console.

Primary users:

- BOSS admin
- BOSS operators
- Support or content staff later

Purpose:

- Manage domains, sites, WordPress setup, Search Console, sitemap submissions, content queues, risk review, settlements, notifications, and logs.
- Keep sensitive operational data away from customers.

Do not expose:

- Raw credentials
- Google refresh tokens
- N8N internals
- Server errors
- Internal domain risk notes that could be misunderstood by customers

### wordfriends.co.kr

Customer portal and public customer-facing site.

Primary users:

- Leads
- Customers
- Referrers
- BOSS support staff through admin view

Purpose:

- Customer signup
- Customer login
- Contract and policy confirmation
- Site operation status
- Settlement notices
- Support requests
- Public trust pages

Do not promise:

- AdSense approval
- Search ranking
- Traffic
- Revenue
- Specific domain value increase
- VPN, IP, or server safety guarantees

## 2. Final Menu Scope

### Internal Admin Menus

Keep in `siteops.09car.co.kr`.

1. Operations Overview
   - 68 domain/site summary
   - Review-required count
   - High-risk hold count
   - Unclassified count
   - Setup pipeline count
   - Sitemap success/failure status
   - Notification drafts

2. Site Management
   - Domain
   - Site key
   - WordPress URL
   - Portfolio status
   - Approval status
   - Risk level
   - Monetization mode
   - WordPress setup status
   - Next action

3. Domain Risk Center
   - DR
   - Backlink quality
   - Spam signals
   - History score
   - Index status
   - Trademark risk
   - YMYL risk
   - Disavow status
   - Evidence attached
   - Final grade

4. Domain Expiry and DNS
   - Registrar
   - Expiry date
   - Cloudflare status
   - Nameserver status
   - Renewal reminder
   - DNS risk notes

5. WordPress Setup Queue
   - Pending, processing, done, failed, skipped
   - Theme/plugin baseline
   - Rank Math status
   - Sitemap URL
   - WP app password reference only

6. Sitemap and Search Console
   - Google submitted
   - Google ready
   - Google failed with short reason
   - Naver manual required
   - Property URL
   - Command hint

7. Content Queue
   - READY, PROCESSING, VALIDATION_FAILED, REVIEW_REQUIRED, APPROVED, PUBLISHED, FAILED
   - Site filter
   - Keyword filter
   - Retry request
   - Manual review gate

8. Keyword Management
   - Keyword map
   - Duplicate detection
   - Site assignment
   - Category mapping
   - Restricted keyword flags

9. SEO and Indexing
   - Rank Math status
   - Search Console ownership
   - Sitemap submit status
   - Indexed page tracking later
   - URL inspection request status later

10. Monetization Status
    - AdSense owner type
    - AdSense status
    - Monetization mode
    - Review required
    - No revenue guarantee wording

11. Customers and Contracts
    - Customer profile
    - Portal account status
    - Contract status
    - Assigned sites
    - AdSense owner type
    - Notes

12. Settlements and Referrals
    - Monthly settlement
    - Agency fee
    - Referral reward
    - Withholding reference
    - Payment status
    - Held/voided status

13. Customer Portal Management
    - Public notices
    - Customer notices
    - Contract template versions
    - Policy versions
    - Support ticket status
    - AI answer review status

14. Notification Center
    - Notice
    - Settlement notice
    - Payment notice
    - Contract notice
    - Account action
    - Internal-only automation alerts

15. N8N Execution
    - Workflow status
    - Manual trigger later
    - Last run time
    - Last result
    - Retry later

16. Error Center
    - WordPress connection failed
    - N8N failed
    - Search Console permission failed
    - Sitemap failed
    - Validation failed
    - Token or credential issue

17. Security and Backup
    - Cloudflare status
    - SSL status
    - WP app password status
    - Last backup
    - Admin access notes
    - Secret storage checklist

18. Policies and Documents
    - Privacy policy
    - Terms of service
    - Service risk notice
    - Contract template
    - Internal safety standard

### Customer Portal Menus

Build in `wordfriends.co.kr`.

1. Public Home
   - Service introduction
   - Safe, conservative wording
   - No income promise
   - Lead inquiry CTA

2. Signup
   - Email
   - Name
   - Phone
   - Consent to terms
   - Consent to privacy policy
   - Optional marketing consent

3. Login
   - Email login first
   - Password or magic link later
   - Account lock status

4. My Sites
   - Site/domain list
   - Operation status
   - Content status
   - Sitemap/Search Console status summary
   - AdSense readiness summary

5. Contract
   - Contract status
   - Electronic contract file/link
   - Agreement history
   - Version number

6. Settlements
   - Monthly notice
   - Revenue records entered by BOSS or customer-provided report
   - Agency fee
   - Payment status
   - Tax reference notice

7. Notices
   - Public notices
   - Customer-specific notices
   - Settlement notices
   - Contract notices

8. Support
   - Inquiry form
   - AI chat draft support
   - Human review before sensitive answers
   - Ticket status

9. Referral
   - Referral code
   - Direct referral only in MVP
   - Reward history
   - Legal/tax review notice

10. Policies
    - Privacy policy
    - Terms of service
    - Service risk notice
    - AI usage notice
    - Marketing consent page

## 3. MVP Inclusion Rules

### Include in MVP 1

- Internal admin dashboard
- Site and domain management
- Domain risk center basic fields
- Sitemap/Search Console management
- Customer and contract status
- Notification drafts
- Customer portal menu design
- Basic customer portal placeholder pages
- Privacy/terms/risk notice placeholders
- Support request model

### Include in MVP 2

- Customer login
- Customer site status page
- Contract status page
- Notice display
- Support ticket form
- Settlement view
- Portal admin controls in SiteOps

### Include Later

- Real electronic signature provider integration
- SMS/Kakao/Telegram send automation
- Ahrefs paid API
- Search Console URL inspection automation
- N8N manual trigger buttons
- Customer-to-customer domain brokerage
- Payment gateway
- Full AI chat automation

### Exclude or Keep Manual

- Revenue prediction
- Revenue guarantee
- AdSense approval guarantee
- Fully automatic publish without review
- Customer-facing domain value promises
- Multi-level referral reward display
- Storing customer Google or AdSense passwords

## 4. Domain Risk Model

### A Grade

Use first.

Conditions:

- Clean history
- Relevant backlinks
- No serious spam footprint
- Clear niche
- Low legal risk
- Indexable

Use:

- Main customer operation
- AdSense readiness
- Public recommendation only after manual review

### B Grade

Use carefully.

Conditions:

- Some good backlinks
- Some spam noise
- Recoverable history
- Niche still usable

Use:

- Disavow review
- Draft-only content
- Long-term recovery
- Internal/BOSS-owned test before customer use

### C Grade

Limited use.

Conditions:

- Weak DR
- Mixed backlinks
- Niche unclear
- Needs manual cleanup

Use:

- Test site
- Recovery experiment
- Non-customer operation

### D Grade

Hold.

Conditions:

- Very low value
- No clear niche
- Heavy cleanup cost

Use:

- Hold or drop on renewal

### Reject

Do not use for customers.

Signals:

- Gambling spam
- Adult spam
- Pharma spam
- Malware
- Hacking history
- Link sale footprint
- Manual action
- Trademark conflict

## 5. Expected Failure Cases and Handling

### Search Console Permission Failure

Cause:

- URL prefix property is not verified for the Google account.

Admin message:

- `권한 없음: Search Console URL 속성 확인 필요`

Action:

- Verify `https://domain/` property.
- Retry domain-specific submit.

### API Disabled

Cause:

- Google Search Console API not enabled in Google Cloud project.

Admin message:

- `API 비활성: Google Search Console API 사용 설정 필요`

Action:

- Enable API.
- Wait several minutes.
- Retry.

### Google Token Expired

Cause:

- Refresh token invalid or revoked.

Admin message:

- `Google 인증 만료: refresh token 재발급 필요`

Action:

- Visit `/api/google/search-console/start`.
- Save new refresh token to Ubuntu `.env`.

### WordPress Connection Failed

Cause:

- App password missing
- Wrong WP URL
- Security plugin blocking REST API
- Cloudflare rule issue

Action:

- Keep customer-facing notice hidden.
- Internal error center only.

### Domain Is High Risk

Cause:

- Spam backlinks, malware, gambling history, or manual action.

Action:

- Lock customer use.
- Require manual evidence.
- Use only for recovery experiment if worth it.

### Customer Disputes Settlement

Cause:

- Revenue report mismatch
- Agency fee disagreement
- Payment timing misunderstanding

Action:

- Keep settlement logs.
- Store contract version.
- Store notice history.
- Avoid automated payout without confirmation.

### AI Gives Unsafe Answer

Cause:

- Customer asks about guaranteed income, AdSense approval, legal/tax matters, or policy evasion.

Action:

- AI drafts only.
- Human review for sensitive categories.
- Use standard disclaimers.

## 6. Data Model Additions Needed

Near-term tables or fields:

- `contracts`
- `contract_versions`
- `support_tickets`
- `support_messages`
- `policy_documents`
- `policy_acceptances`
- `domain_expiry_records`
- `domain_dns_checks`
- `seo_status_snapshots`
- `monetization_snapshots`

Near-term fields:

- `sites.domain_expiry_date`
- `sites.registrar`
- `sites.cloudflare_status`
- `sites.search_console_status`
- `sites.rank_math_status`
- `sites.last_backup_at`
- `sites.next_action`

## 7. Development Delivery Order

### Delivery 1: Admin Information Architecture

- Add final menu structure.
- Add Customer Portal Management section.
- Add Domain Risk Center refinements.
- Add Error Center skeleton.
- Rename confusing labels such as `NOT_SET` into Korean operational labels.

### Delivery 2: Data Foundation

- Add contract, policy, support ticket, expiry, and SEO snapshot tables.
- Keep schema additive and safe.
- Do not migrate secrets into DB.

### Delivery 3: Wordfriends Portal Skeleton

- Public home
- Login placeholder
- Signup placeholder
- Terms page
- Privacy page
- Risk notice page
- Inquiry page
- Customer dashboard placeholder

### Delivery 4: SiteOps Portal Controls

- Manage portal notices.
- Manage policy versions.
- Manage support tickets.
- Manage customer contract status.

### Delivery 5: Domain Risk Workflow

- A/B/C/D/Reject review panel.
- Disavow-needed flag.
- Evidence attachment flag.
- Renewal/drop decision.

### Delivery 6: Automation Hooks

- Domain-specific sitemap submit button later.
- N8N trigger buttons later.
- Search Console status refresh later.
- Telegram/SMS/Kakao later.

## 8. Decision Summary

- `siteops.09car.co.kr` remains internal only.
- `wordfriends.co.kr` becomes the customer portal and public business face.
- Customer-facing pages must include signup, login, contracts, privacy, terms, notices, support, and risk notices.
- MVP should focus on visibility, control, and safe operations before full automation.
- Domain risk work is a core module, not a side feature.
- High-risk domains must be locked by default.
- The platform must be fast to operate but conservative in claims.
