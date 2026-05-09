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

CREATE INDEX IF NOT EXISTS idx_sites_site_key ON sites(site_key);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_site_key ON content_queue(site_key);
CREATE INDEX IF NOT EXISTS idx_run_logs_site_key ON run_logs(site_key);
CREATE INDEX IF NOT EXISTS idx_run_logs_status ON run_logs(status);
CREATE INDEX IF NOT EXISTS idx_wp_setup_queue_status ON wp_setup_queue(setup_status);
CREATE INDEX IF NOT EXISTS idx_keyword_map_topic ON keyword_map(topic_group);
