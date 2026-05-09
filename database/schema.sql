CREATE TABLE IF NOT EXISTS domains (
  id BIGSERIAL PRIMARY KEY,
  domain_name TEXT NOT NULL UNIQUE,
  punycode_name TEXT,
  tld TEXT NOT NULL,
  language_code TEXT NOT NULL CHECK (language_code IN ('ko', 'en')),
  site_topic TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wordpress_sites (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  wp_base_url TEXT NOT NULL,
  admin_user TEXT,
  auth_mode TEXT NOT NULL DEFAULT 'application_password',
  active_theme TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  setup_status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_jobs (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT REFERENCES domains(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_pages (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  title TEXT NOT NULL,
  language_code TEXT NOT NULL CHECK (language_code IN ('ko', 'en')),
  wp_page_id BIGINT,
  wp_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  content_html TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(domain_id, page_key)
);

CREATE TABLE IF NOT EXISTS landing_pages (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  title TEXT NOT NULL,
  hero_copy TEXT,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  wp_page_id BIGINT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publishing_queue (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  wp_post_id BIGINT,
  wp_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domains_language ON domains(language_code);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_queue_status ON publishing_queue(status);
