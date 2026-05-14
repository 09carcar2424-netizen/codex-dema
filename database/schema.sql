CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  ownership_type TEXT NOT NULL DEFAULT 'customer_owned',
  contract_status TEXT NOT NULL DEFAULT 'lead',
  adsense_owner_type TEXT NOT NULL DEFAULT 'customer',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ownership_type IN ('customer_owned', 'boss_owned')),
  CHECK (contract_status IN ('lead', 'active', 'paused', 'closed')),
  CHECK (adsense_owner_type IN ('customer', 'boss_internal_test'))
);

CREATE TABLE IF NOT EXISTS customer_portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  status TEXT NOT NULL DEFAULT 'invited',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role IN ('customer', 'referrer', 'admin', 'support')),
  CHECK (status IN ('invited', 'active', 'paused', 'locked', 'closed'))
);

CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('active', 'paused', 'closed'))
);

CREATE TABLE IF NOT EXISTS portal_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  session_id TEXT,
  event_type TEXT NOT NULL,
  page_path TEXT,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_type IN (
    'page_view', 'signup_started', 'signup_completed', 'login',
    'contract_started', 'contract_completed', 'site_viewed',
    'settlement_viewed', 'question_submitted', 'ai_handoff'
  ))
);

CREATE TABLE IF NOT EXISTS portal_question_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  parent_question_id UUID REFERENCES portal_question_threads(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open',
  ai_allowed BOOLEAN NOT NULL DEFAULT true,
  human_review_required BOOLEAN NOT NULL DEFAULT false,
  answer_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (category IN ('general', 'settlement', 'contract', 'adsense', 'tax', 'policy', 'technical')),
  CHECK (status IN ('open', 'ai_draft', 'human_review', 'answered', 'closed', 'blocked'))
);

CREATE TABLE IF NOT EXISTS referral_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  referred_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referral_code_id UUID REFERENCES referral_codes(id) ON DELETE SET NULL,
  depth INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  CHECK (depth BETWEEN 1 AND 3),
  CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  UNIQUE(referred_customer_id)
);

CREATE TABLE IF NOT EXISTS referral_reward_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL UNIQUE,
  depth INTEGER NOT NULL DEFAULT 1,
  reward_type TEXT NOT NULL,
  reward_basis TEXT NOT NULL,
  reward_rate NUMERIC(6, 3),
  fixed_amount NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'KRW',
  active BOOLEAN NOT NULL DEFAULT false,
  legal_review_required BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (depth BETWEEN 1 AND 3),
  CHECK (reward_type IN ('fixed', 'percentage')),
  CHECK (reward_basis IN ('setup_fee', 'monthly_agency_fee', 'boss_margin'))
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_relationship_id UUID NOT NULL REFERENCES referral_relationships(id) ON DELETE CASCADE,
  reward_rule_id UUID REFERENCES referral_reward_rules(id) ON DELETE SET NULL,
  settlement_id UUID,
  reward_month DATE,
  base_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reward_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'confirmed', 'payable', 'paid', 'void', 'held'))
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sheet_row_id BIGINT,
  site_key TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL UNIQUE,
  language_code TEXT NOT NULL DEFAULT 'ko',
  cluster_code TEXT,
  g_level TEXT,
  guardrail_level TEXT NOT NULL DEFAULT 'standard',
  b_code TEXT,
  site_name TEXT,
  site_concept TEXT,
  portfolio_status TEXT NOT NULL DEFAULT 'unclassified',
  recovery_status TEXT NOT NULL DEFAULT 'not_needed',
  risk_level TEXT NOT NULL DEFAULT 'unknown',
  is_customer_portal BOOLEAN NOT NULL DEFAULT false,
  is_internal_infra BOOLEAN NOT NULL DEFAULT false,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approval_status TEXT,
  monetize_mode TEXT,
  dr_score NUMERIC(8, 2),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (language_code IN ('ko', 'en')),
  CHECK (guardrail_level IN ('low', 'standard', 'high', 'ymyl')),
  CHECK (portfolio_status IN ('customer_portal', 'infra_internal', 'operating_ready', 'setup_pipeline', 'recovery_review', 'high_risk_hold', 'unclassified')),
  CHECK (recovery_status IN ('not_needed', 'needs_review', 'cleaning', 'reindex_requested', 'recovered', 'rejected')),
  CHECK (risk_level IN ('unknown', 'low', 'medium', 'high', 'critical')),
  CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  CHECK (approval_status IS NULL OR approval_status IN ('pending', 'approved', 'rejected', 'not_submitted')),
  CHECK (monetize_mode IS NULL OR monetize_mode IN ('adsense', 'adsense_agency', 'adsense_affiliate', 'adsense_cpa', 'business', 'internal'))
);

CREATE TABLE IF NOT EXISTS wordpress_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  wp_base_url TEXT NOT NULL,
  wp_username TEXT,
  wp_credential_ref TEXT,
  wp_secret_ref TEXT,
  seo_plugin TEXT,
  wp_category_id BIGINT,
  last_verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'verified', 'failed', 'disabled'))
);

CREATE TABLE IF NOT EXISTS site_proxy_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  proxy_profile_key TEXT NOT NULL UNIQUE,
  proxy_provider TEXT NOT NULL DEFAULT 'manual',
  proxy_type TEXT NOT NULL DEFAULT 'datacenter',
  proxy_region TEXT NOT NULL DEFAULT 'KR',
  egress_policy TEXT NOT NULL DEFAULT 'wp_publish_only',
  credential_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  last_verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id),
  CHECK (proxy_type IN ('datacenter', 'residential', 'mobile', 'none')),
  CHECK (egress_policy IN ('wp_publish_only', 'wp_admin_ops', 'search_console_ops', 'disabled')),
  CHECK (status IN ('planned', 'active', 'verify_required', 'failed', 'disabled'))
);

CREATE TABLE IF NOT EXISTS site_runtime_profiles (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  request_profile_key TEXT NOT NULL UNIQUE,
  user_agent_label TEXT NOT NULL DEFAULT 'siteops-default',
  publish_window_start SMALLINT NOT NULL DEFAULT 9,
  publish_window_end SMALLINT NOT NULL DEFAULT 21,
  max_posts_per_day INTEGER NOT NULL DEFAULT 1,
  style_profile TEXT NOT NULL DEFAULT 'balanced_editorial',
  quality_gate TEXT NOT NULL DEFAULT 'review_first',
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (publish_window_start BETWEEN 0 AND 23),
  CHECK (publish_window_end BETWEEN 0 AND 23),
  CHECK (max_posts_per_day BETWEEN 0 AND 24),
  CHECK (quality_gate IN ('review_first', 'auto_draft_only', 'manual_only', 'disabled')),
  CHECK (status IN ('planned', 'active', 'verify_required', 'disabled'))
);

CREATE TABLE IF NOT EXISTS site_ai_settings (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  automation_enabled BOOLEAN NOT NULL DEFAULT false,
  automation_mode TEXT NOT NULL DEFAULT 'draft_only',
  workflow_type TEXT,
  prompt_profile TEXT,
  llm_provider TEXT,
  llm_mode TEXT,
  primary_model TEXT,
  repair_model TEXT,
  temperature_primary NUMERIC(4, 2),
  temperature_repair NUMERIC(4, 2),
  translation_enabled BOOLEAN NOT NULL DEFAULT false,
  post_frequency NUMERIC(8, 2),
  monthly_target INTEGER,
  default_publish_mode TEXT NOT NULL DEFAULT 'draft',
  CHECK (automation_mode IN ('full', 'draft_only', 'manual')),
  CHECK (default_publish_mode IN ('draft', 'publish', 'pending', 'private'))
);

CREATE TABLE IF NOT EXISTS site_image_settings (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  image_provider TEXT,
  image_style TEXT,
  image_count INTEGER NOT NULL DEFAULT 0,
  image_source TEXT,
  fallback_to_generate BOOLEAN NOT NULL DEFAULT true,
  include_video BOOLEAN NOT NULL DEFAULT false,
  image_pipeline_mode TEXT NOT NULL DEFAULT 'none',
  featured_image_required BOOLEAN NOT NULL DEFAULT false,
  CHECK (image_pipeline_mode IN ('none', 'featured_only', 'body_images', 'full'))
);

CREATE TABLE IF NOT EXISTS site_validation_rules (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  validation_min_length INTEGER NOT NULL DEFAULT 1500,
  validation_min_h2 INTEGER NOT NULL DEFAULT 3,
  required_keywords TEXT[] NOT NULL DEFAULT '{}',
  ymyl_disclaimer_required BOOLEAN NOT NULL DEFAULT false,
  customer_review_required BOOLEAN NOT NULL DEFAULT true,
  boss_review_required BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS site_rss_settings (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  rss_feed_url TEXT,
  rss_content_filter TEXT,
  source_license_type TEXT,
  translation_enabled BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS prompt_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_pack_id BIGINT UNIQUE,
  pack_name TEXT NOT NULL UNIQUE,
  cluster_code TEXT,
  prompt_type TEXT NOT NULL DEFAULT 'content_generation',
  llm_provider TEXT,
  prompt_template TEXT,
  system_prompt TEXT,
  user_template TEXT,
  temperature NUMERIC(4, 2),
  version TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_row_id BIGINT,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  site_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'original',
  pack_id BIGINT,
  prompt_pack_id UUID REFERENCES prompt_packs(id) ON DELETE SET NULL,
  my_title TEXT,
  keyword TEXT,
  service_type TEXT,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  body_image_count INTEGER,
  category TEXT,
  wp_category_id BIGINT,
  max_retries INTEGER NOT NULL DEFAULT 3,
  locked_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 100,
  scheduled_date TIMESTAMPTZ,
  publish_mode TEXT,
  preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'ready', 'processing', 'generated', 'validation_failed', 'review_required', 'approved', 'published', 'failed', 'canceled')),
  CHECK (publish_mode IS NULL OR publish_mode IN ('draft', 'publish', 'pending', 'private'))
);

CREATE TABLE IF NOT EXISTS content_validation_results (
  content_queue_id UUID PRIMARY KEY REFERENCES content_queue(id) ON DELETE CASCADE,
  korean_ratio NUMERIC(6, 4),
  image_count INTEGER,
  content_length INTEGER,
  h2_count INTEGER,
  validation_error TEXT,
  error_detail TEXT,
  passed BOOLEAN,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_publications (
  content_queue_id UUID PRIMARY KEY REFERENCES content_queue(id) ON DELETE CASCADE,
  wp_post_id BIGINT,
  post_url TEXT,
  image_url TEXT,
  title JSONB,
  meta_description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  content_html TEXT,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id UUID NOT NULL REFERENCES content_queue(id) ON DELETE CASCADE,
  reviewer_type TEXT NOT NULL,
  reviewer_name TEXT,
  decision TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reviewer_type IN ('boss', 'customer', 'system')),
  CHECK (decision IN ('pending', 'approved', 'changes_requested', 'rejected'))
);

CREATE TABLE IF NOT EXISTS image_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_style TEXT NOT NULL,
  role TEXT NOT NULL,
  variant TEXT NOT NULL,
  prompt TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(image_style, role, variant)
);

CREATE TABLE IF NOT EXISTS keyword_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_kr TEXT,
  keyword_en TEXT,
  topic_group TEXT,
  service_type TEXT,
  category TEXT,
  wp_category_id BIGINT,
  use_yn BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_link_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_policy_id BIGINT UNIQUE,
  from_site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  to_site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  from_site_key TEXT,
  to_site_key TEXT,
  frequency_per_month INTEGER NOT NULL DEFAULT 0,
  cooldown_days INTEGER NOT NULL DEFAULT 30,
  anchor_text_list TEXT[] NOT NULL DEFAULT '{}',
  last_link_date DATE,
  next_available_date DATE,
  status TEXT NOT NULL DEFAULT 'review_required',
  disclosure_required BOOLEAN NOT NULL DEFAULT true,
  customer_consent_required BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  CHECK (status IN ('disabled', 'review_required', 'active', 'paused'))
);

CREATE TABLE IF NOT EXISTS n8n_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key TEXT NOT NULL UNIQUE,
  workflow_name TEXT NOT NULL,
  workflow_type TEXT NOT NULL,
  webhook_url TEXT,
  n8n_workflow_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_log_id BIGINT,
  run_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  site_key TEXT,
  queue_id UUID REFERENCES content_queue(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES n8n_workflows(id) ON DELETE SET NULL,
  workflow_type TEXT,
  status TEXT NOT NULL,
  llm_provider_used TEXT,
  error_code TEXT,
  error_message TEXT,
  llm_calls INTEGER,
  tokens_used INTEGER,
  cost_usd NUMERIC(12, 6),
  execution_time_sec NUMERIC(12, 3),
  final_post_url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (status IN ('queued', 'running', 'success', 'failed', 'canceled', 'validation_failed'))
);

CREATE TABLE IF NOT EXISTS wp_setup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_row_id BIGINT,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  language_code TEXT NOT NULL DEFAULT 'ko',
  domain TEXT NOT NULL,
  linux_user TEXT,
  wp_email TEXT,
  wp_username TEXT,
  wp_credential_ref TEXT,
  wp_secret_ref TEXT,
  site_name TEXT,
  site_concept TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  theme_slug TEXT,
  monetize TEXT,
  dr_score NUMERIC(8, 2),
  approval TEXT,
  setup_status TEXT NOT NULL DEFAULT 'pending',
  memo TEXT,
  setup_date TIMESTAMPTZ,
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (language_code IN ('ko', 'en')),
  CHECK (setup_status IN ('pending', 'processing', 'done', 'failed', 'skip'))
);

CREATE TABLE IF NOT EXISTS adsense_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  account_owner TEXT NOT NULL DEFAULT 'customer',
  application_status TEXT NOT NULL DEFAULT 'not_started',
  ads_txt_status TEXT NOT NULL DEFAULT 'unknown',
  approved_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (account_owner IN ('customer', 'boss_internal_test')),
  CHECK (application_status IN ('not_started', 'submitted', 'approved', 'rejected', 'paused')),
  CHECK (ads_txt_status IN ('unknown', 'missing', 'valid', 'invalid'))
);

CREATE TABLE IF NOT EXISTS revenue_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  settlement_month DATE NOT NULL,
  gross_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0,
  agency_fee_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  agency_fee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'confirmed', 'invoiced', 'paid', 'void'))
);

CREATE TABLE IF NOT EXISTS tax_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  profile_type TEXT NOT NULL DEFAULT 'individual',
  resident_type TEXT NOT NULL DEFAULT 'resident',
  business_registration_status TEXT NOT NULL DEFAULT 'unknown',
  withholding_category TEXT NOT NULL DEFAULT 'needs_review',
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (profile_type IN ('individual', 'sole_proprietor', 'corporation')),
  CHECK (resident_type IN ('resident', 'non_resident', 'unknown')),
  CHECK (business_registration_status IN ('registered', 'not_registered', 'unknown')),
  CHECK (withholding_category IN ('business_income_3_3', 'other_income_8_8_reference', 'invoice_required', 'needs_review'))
);

CREATE TABLE IF NOT EXISTS withholding_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES revenue_settlements(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  estimate_type TEXT NOT NULL,
  gross_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  income_tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  local_income_tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_withholding_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_payable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KRW',
  disclaimer TEXT NOT NULL DEFAULT 'Estimated only. Final tax treatment must be confirmed by a tax professional.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (estimate_type IN ('business_income_3_3', 'other_income_8_8_reference', 'manual_review'))
);

ALTER TABLE referral_rewards
  DROP CONSTRAINT IF EXISTS referral_rewards_settlement_id_fkey;

ALTER TABLE referral_rewards
  ADD CONSTRAINT referral_rewards_settlement_id_fkey
  FOREIGN KEY (settlement_id) REFERENCES revenue_settlements(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS policy_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_name TEXT,
  notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (review_type IN ('required_pages', 'adsense_readiness', 'ymyl', 'copyright', 'partner_link', 'privacy_terms_contact')),
  CHECK (status IN ('pending', 'pass', 'fail', 'not_applicable'))
);

CREATE TABLE IF NOT EXISTS site_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open',
  metric_name TEXT,
  current_value NUMERIC(14, 4),
  baseline_value NUMERIC(14, 4),
  threshold_value NUMERIC(14, 4),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (alert_type IN ('ctr_drop', 'impression_drop', 'ads_serving_issue', 'search_console_error', 'wp_publish_error', 'proxy_verify_failed', 'manual')),
  CHECK (severity IN ('info', 'warning', 'critical')),
  CHECK (status IN ('open', 'acknowledged', 'resolved', 'ignored')),
  CHECK (source IN ('manual', 'search_console', 'adsense', 'wordpress', 'n8n', 'proxy'))
);

CREATE TABLE IF NOT EXISTS site_trust_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  plan_stage TEXT NOT NULL DEFAULT 'incubating',
  trust_score INTEGER NOT NULL DEFAULT 0,
  content_target INTEGER NOT NULL DEFAULT 30,
  indexed_target INTEGER NOT NULL DEFAULT 10,
  authority_outbound_target INTEGER NOT NULL DEFAULT 5,
  outbound_policy TEXT NOT NULL DEFAULT 'editorial_reference_only',
  next_action TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (plan_stage IN ('incubating', 'content_build', 'index_watch', 'monetization_review', 'ready_for_offer', 'paused')),
  CHECK (trust_score BETWEEN 0 AND 100),
  CHECK (status IN ('active', 'paused', 'completed', 'rejected'))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  portal_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  kakao_enabled BOOLEAN NOT NULL DEFAULT false,
  telegram_enabled BOOLEAN NOT NULL DEFAULT false,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  group_chat_allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  audience_type TEXT NOT NULL DEFAULT 'admin',
  visibility TEXT NOT NULL DEFAULT 'internal_only',
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'portal',
  provider TEXT,
  marketing_message BOOLEAN NOT NULL DEFAULT false,
  opt_in_required BOOLEAN NOT NULL DEFAULT false,
  send_status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (audience_type IN ('customer', 'admin', 'staff')),
  CHECK (visibility IN ('public_to_customer', 'internal_only')),
  CHECK (category IN ('notice', 'settlement', 'payment', 'account_action', 'contract', 'domain', 'automation', 'security', 'general')),
  CHECK (severity IN ('info', 'action_required', 'warning', 'critical')),
  CHECK (channel IN ('portal', 'sms', 'kakao', 'telegram', 'portal_sms', 'portal_telegram')),
  CHECK (send_status IN ('draft', 'ready', 'scheduled', 'sent', 'failed', 'canceled'))
);

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_category_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_category_check
  CHECK (category IN ('notice', 'settlement', 'payment', 'account_action', 'contract', 'domain', 'automation', 'security', 'general'));

CREATE TABLE IF NOT EXISTS sitemap_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  site_key TEXT,
  domain TEXT NOT NULL,
  sitemap_url TEXT NOT NULL,
  search_engine TEXT NOT NULL DEFAULT 'google',
  property_url TEXT,
  submission_mode TEXT NOT NULL DEFAULT 'manual',
  submission_status TEXT NOT NULL DEFAULT 'draft',
  last_submitted_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  response_message TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (search_engine IN ('google', 'naver', 'bing', 'other')),
  CHECK (submission_mode IN ('manual', 'api', 'robots_txt', 'pending_api')),
  CHECK (submission_status IN ('draft', 'ready', 'submitted', 'verified', 'failed', 'manual_required', 'not_supported')),
  UNIQUE(domain, search_engine)
);

CREATE TABLE IF NOT EXISTS google_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key TEXT NOT NULL UNIQUE,
  account_email TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'not_connected',
  connected_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('not_connected', 'connected', 'needs_reauth', 'error'))
);

CREATE TABLE IF NOT EXISTS domain_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  domain TEXT NOT NULL UNIQUE,
  ownership_type TEXT NOT NULL DEFAULT 'boss_owned',
  acquisition_type TEXT NOT NULL DEFAULT 'unknown',
  tld_type TEXT,
  language_priority TEXT NOT NULL DEFAULT 'en',
  category_fit TEXT,
  inventory_status TEXT NOT NULL DEFAULT 'internal_review',
  offer_status TEXT NOT NULL DEFAULT 'not_listed',
  asking_price NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'KRW',
  public_listing_allowed BOOLEAN NOT NULL DEFAULT false,
  revenue_guarantee_forbidden BOOLEAN NOT NULL DEFAULT true,
  adsense_guarantee_forbidden BOOLEAN NOT NULL DEFAULT true,
  risk_disclosure_required BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ownership_type IN ('boss_owned', 'customer_owned', 'third_party')),
  CHECK (acquisition_type IN ('new_registration', 'aged_domain', 'expired_domain', 'customer_supplied', 'unknown')),
  CHECK (language_priority IN ('ko', 'en', 'mixed')),
  CHECK (inventory_status IN ('internal_review', 'recommended', 'brokerage_ready', 'operating_first', 'hold', 'rejected')),
  CHECK (offer_status IN ('not_listed', 'internal_only', 'candidate', 'listed_private', 'listed_public', 'sold', 'transferred', 'withdrawn'))
);

CREATE TABLE IF NOT EXISTS domain_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES domain_inventory(id) ON DELETE CASCADE,
  audit_status TEXT NOT NULL DEFAULT 'draft',
  history_score INTEGER,
  spam_score INTEGER,
  backlink_score INTEGER,
  index_score INTEGER,
  trademark_risk TEXT NOT NULL DEFAULT 'unknown',
  ymyl_risk_level TEXT NOT NULL DEFAULT 'unknown',
  overall_score INTEGER,
  final_grade TEXT NOT NULL DEFAULT 'unrated',
  manual_review_required BOOLEAN NOT NULL DEFAULT true,
  evidence_attached BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (audit_status IN ('draft', 'queued', 'checked', 'needs_review', 'rejected', 'approved')),
  CHECK (history_score IS NULL OR history_score BETWEEN 0 AND 100),
  CHECK (spam_score IS NULL OR spam_score BETWEEN 0 AND 100),
  CHECK (backlink_score IS NULL OR backlink_score BETWEEN 0 AND 100),
  CHECK (index_score IS NULL OR index_score BETWEEN 0 AND 100),
  CHECK (overall_score IS NULL OR overall_score BETWEEN 0 AND 100),
  CHECK (trademark_risk IN ('unknown', 'low', 'medium', 'high')),
  CHECK (ymyl_risk_level IN ('unknown', 'low', 'medium', 'high')),
  CHECK (final_grade IN ('unrated', 'safe_candidate', 'watch', 'hold', 'reject'))
);

CREATE TABLE IF NOT EXISTS domain_renewal_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  inventory_id UUID REFERENCES domain_inventory(id) ON DELETE SET NULL,
  domain TEXT NOT NULL UNIQUE,
  renewal_decision TEXT NOT NULL DEFAULT 'manual_review',
  decision_reason TEXT NOT NULL DEFAULT 'manual_review_required',
  evidence_required BOOLEAN NOT NULL DEFAULT true,
  customer_exposure_allowed BOOLEAN NOT NULL DEFAULT false,
  automation_allowed BOOLEAN NOT NULL DEFAULT false,
  next_action TEXT,
  decided_by TEXT NOT NULL DEFAULT 'system',
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (renewal_decision IN ('renew', 'manual_review', 'do_not_renew', 'hold')),
  CHECK (decision_reason IN ('safe_operating_asset', 'quarantine_review', 'spam_risk', 'manual_review_required', 'discard_candidate', 'customer_owned'))
);

CREATE TABLE IF NOT EXISTS domain_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'generated',
  category TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  language_priority TEXT NOT NULL DEFAULT 'mixed',
  tld TEXT,
  price_policy TEXT NOT NULL DEFAULT 'general_only',
  registrar_channel TEXT,
  candidate_style TEXT,
  availability_status TEXT NOT NULL DEFAULT 'unchecked',
  audit_status TEXT NOT NULL DEFAULT 'queued',
  purchase_status TEXT NOT NULL DEFAULT 'not_approved',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_type IN ('generated', 'manual', 'imported')),
  CHECK (language_priority IN ('ko', 'en', 'mixed')),
  CHECK (price_policy IN ('general_only', 'premium_review', 'premium_allowed')),
  CHECK (availability_status IN ('unchecked', 'available', 'taken', 'premium', 'error')),
  CHECK (audit_status IN ('queued', 'checking', 'needs_review', 'approved', 'rejected')),
  CHECK (purchase_status IN ('not_approved', 'approved_to_buy', 'purchased', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_sites_site_key ON sites(site_key);
CREATE INDEX IF NOT EXISTS idx_portal_activity_occurred ON portal_activity_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_portal_activity_event_type ON portal_activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_portal_questions_status ON portal_question_threads(status);
CREATE INDEX IF NOT EXISTS idx_portal_questions_customer ON portal_question_threads(customer_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE INDEX IF NOT EXISTS idx_site_proxy_assignments_site ON site_proxy_assignments(site_id);
CREATE INDEX IF NOT EXISTS idx_site_proxy_assignments_status ON site_proxy_assignments(status);
CREATE INDEX IF NOT EXISTS idx_site_runtime_profiles_status ON site_runtime_profiles(status);
CREATE INDEX IF NOT EXISTS idx_site_health_alerts_status ON site_health_alerts(status);
CREATE INDEX IF NOT EXISTS idx_site_health_alerts_severity ON site_health_alerts(severity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_trust_plans_site_unique ON site_trust_plans(site_id);
CREATE INDEX IF NOT EXISTS idx_site_trust_plans_status ON site_trust_plans(status);
CREATE INDEX IF NOT EXISTS idx_site_trust_plans_stage ON site_trust_plans(plan_stage);
CREATE INDEX IF NOT EXISTS idx_referral_relationships_referrer ON referral_relationships(referrer_customer_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);
CREATE INDEX IF NOT EXISTS idx_withholding_estimates_customer ON withholding_estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_site_key ON content_queue(site_key);
CREATE INDEX IF NOT EXISTS idx_run_logs_site_key ON run_logs(site_key);
CREATE INDEX IF NOT EXISTS idx_run_logs_status ON run_logs(status);
CREATE INDEX IF NOT EXISTS idx_wp_setup_queue_status ON wp_setup_queue(setup_status);
CREATE INDEX IF NOT EXISTS idx_keyword_map_topic ON keyword_map(topic_group);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_audience ON notifications(audience_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(send_status);
CREATE INDEX IF NOT EXISTS idx_sitemap_submissions_domain ON sitemap_submissions(domain);
CREATE INDEX IF NOT EXISTS idx_sitemap_submissions_engine ON sitemap_submissions(search_engine);
CREATE INDEX IF NOT EXISTS idx_sitemap_submissions_status ON sitemap_submissions(submission_status);
CREATE INDEX IF NOT EXISTS idx_google_integrations_key ON google_integrations(integration_key);
CREATE INDEX IF NOT EXISTS idx_domain_inventory_status ON domain_inventory(inventory_status);
CREATE INDEX IF NOT EXISTS idx_domain_inventory_offer ON domain_inventory(offer_status);
CREATE INDEX IF NOT EXISTS idx_domain_audits_inventory ON domain_audits(inventory_id);
CREATE INDEX IF NOT EXISTS idx_domain_audits_grade ON domain_audits(final_grade);
CREATE INDEX IF NOT EXISTS idx_domain_renewal_decisions_decision ON domain_renewal_decisions(renewal_decision);
CREATE INDEX IF NOT EXISTS idx_domain_renewal_decisions_domain ON domain_renewal_decisions(domain);
CREATE INDEX IF NOT EXISTS idx_domain_candidates_audit ON domain_candidates(audit_status);
CREATE INDEX IF NOT EXISTS idx_domain_candidates_purchase ON domain_candidates(purchase_status);
