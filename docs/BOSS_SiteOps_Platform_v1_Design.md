# BOSS SiteOps Platform v1 Design

## 1. Product Direction

BOSS SiteOps Platform v1 is a customer-owned site operations platform.

The platform is not designed as a hidden PBN system. It is designed to manage customer-owned WordPress sites, customer-owned AdSense accounts, content production, technical setup, approval workflow, and safe operations.

## 2. Operating Model

Customer responsibilities:

- Own the domain.
- Own the WordPress site.
- Own the AdSense account.
- Receive ad revenue directly.
- Approve publishing policy and commercial terms.

BOSS responsibilities:

- Build and configure WordPress.
- Produce and manage content.
- Run technical automation.
- Maintain WordPress, SEO plugin settings, media upload, and publishing queues.
- Track work logs, policy checks, and settlement data.

Core safety rule:

- No AdSense approval guarantee.
- No traffic or revenue guarantee.
- No artificial clicks, traffic manipulation, or hidden ownership structure.
- Content generation must include quality checks and review gates.

## 3. System Roles

### Admin Web App

The web app is the control center:

- Customer management
- Domain and WordPress site management
- Content queue
- Prompt pack management
- Image prompt management
- N8N workflow execution
- Review and approval
- Run logs
- Revenue settlement
- Compliance checklist

### PostgreSQL

PostgreSQL becomes the system of record.

Google Sheets may remain as an import/export or emergency dashboard, but should not remain the primary database for scale.

### N8N

N8N remains the automation engine:

- Content generation workflow
- Image generation workflow
- WordPress media upload
- WordPress post creation
- Rank Math metadata update
- Internal link insertion, only if policy allows
- Webhook-based execution from the web app

### WordPress

WordPress remains the publishing target.

Use WordPress Application Passwords or N8N credentials. Do not store raw WordPress passwords in PostgreSQL.

## 4. Google Sheet to PostgreSQL Mapping

### site_master

Source role:

- Domain/site configuration master.
- Controls workflow routing, publishing mode, validation rules, image pipeline, and WordPress connection metadata.

PostgreSQL target:

- `sites`
- `site_validation_rules`
- `site_ai_settings`
- `site_image_settings`
- `wordpress_connections`

### content_queue

Source role:

- Content production queue.
- Tracks keyword, title, status, validation result, WordPress post ID, generated HTML, metadata, and publishing mode.

PostgreSQL target:

- `content_queue`
- `content_validation_results`
- `content_publications`

### prompt_packs

Source role:

- Prompt templates and model settings.

PostgreSQL target:

- `prompt_packs`

### image_prompts

Source role:

- Image prompt variants by image style and role.

PostgreSQL target:

- `image_prompts`

### keyword_map

Source role:

- Keyword/category/category ID mapping.

PostgreSQL target:

- `keyword_map`

### link_policy

Source role:

- Partner link insertion rules.

PostgreSQL target:

- `partner_link_policies`

Safety note:

- This must be treated as partner/disclosure content management, not ranking manipulation.
- Default status should be OFF or REVIEW_REQUIRED for customer sites.

### run_logs

Source role:

- N8N and publishing execution logs.

PostgreSQL target:

- `run_logs`

### wp_setup_queue

Source role:

- WordPress setup task queue.

PostgreSQL target:

- `wp_setup_queue`

## 5. Required Workflow States

Content queue states:

- `DRAFT`
- `READY`
- `PROCESSING`
- `GENERATED`
- `VALIDATION_FAILED`
- `REVIEW_REQUIRED`
- `APPROVED`
- `PUBLISHED`
- `FAILED`
- `CANCELED`

WordPress setup states:

- `PENDING`
- `PROCESSING`
- `DONE`
- `FAILED`
- `SKIP`

Customer/site states:

- `LEAD`
- `ACTIVE`
- `PAUSED`
- `CLOSED`

## 6. Review Rules

Always require manual review for:

- YMYL topics such as health, finance, legal, medical, government aid, and safety.
- Customer sites before AdSense approval.
- First 10 posts of a new site.
- Partner or BOSS-related link insertion.
- Any generated content with validation warning.

Optional auto-publishing can be considered only for:

- Mature non-YMYL sites.
- Stable prompt packs.
- Repeated pass scores.
- Customer-approved publishing mode.

## 7. Security Rules

Never store these values as plain text:

- WordPress Application Password
- API keys
- N8N credentials
- Google OAuth secrets
- AdSense credentials

Store only:

- `credential_ref`
- `secret_ref`
- provider name
- last verification time

Secrets should live in:

- N8N Credentials
- server environment variables
- a proper secret manager

## 8. Partner Link Policy

BOSS-related links or partner links should be designed as opt-in commercial content:

- Customer agreement required.
- Disclosure required when promotional.
- Monthly frequency cap.
- Topic relevance required.
- No site-wide bulk insertion.
- No identical anchor repetition.
- Review before publish.
- Full logs retained.

Recommended product label:

- Partner Content
- Sponsored Notice
- Service Recommendation

Avoid product label:

- Backlink automation
- PBN link insertion
- Ranking booster

## 9. Phase Plan

### Phase 1: Foundation

- PostgreSQL schema
- Google Sheet import model
- Customer/site master screen
- WordPress setup queue screen
- Content queue screen

### Phase 2: N8N Integration

- Register N8N workflow endpoints
- Execute workflow from web app
- Save run logs
- Track failures and retries

### Phase 3: WordPress Setup Automation

- WP-CLI or REST-based setup
- Theme/plugin install
- Required pages
- Menu/footer setup
- SEO plugin baseline

### Phase 4: Review and Publishing

- Generated content preview
- Validation results
- Manual approval
- Publish to WordPress

### Phase 5: Customer Operations

- Contract status
- AdSense status
- Monthly operation report
- Revenue share settlement records

## 10. Immediate Build Order

1. Replace the current simple schema with SiteOps v1 schema.
2. Add seed/import format for current Google Sheet tabs.
3. Build domain/site management UI.
4. Build content queue UI.
5. Build N8N webhook execution UI.
6. Build WordPress setup queue UI.
7. Add review and approval workflow.
