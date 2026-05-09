# Google Sheets Import Mapping

This document maps the current Google Sheets tabs into PostgreSQL tables.

Do not import real passwords or API keys into PostgreSQL. Replace them with credential references.

## site_master

Direct fields:

- `row_id` -> `sites.sheet_row_id`
- `site_key` -> `sites.site_key`
- `domain` -> `sites.domain`
- `cluster_code` -> `sites.cluster_code`
- `g_level` -> `sites.g_level`
- `guardrail_level` -> `sites.guardrail_level`
- `b_code` -> `sites.b_code`
- `contact_email` -> `sites.contact_email`
- `status` -> `sites.status`
- Spreadsheet-derived classification -> `sites.portfolio_status`
- Spreadsheet-derived recovery decision -> `sites.recovery_status`
- Spreadsheet-derived risk level -> `sites.risk_level`

Classification rule:

- `wordfriends.co.kr` -> `customer_portal`
- `09car.co.kr` or infra-only domains -> `infra_internal`
- `setup_status=DONE` and `approval=합격` -> `operating_ready`
- `setup_status=PROCESSING` or `PENDING` -> `setup_pipeline`
- skipped domains requiring manual review -> `recovery_review`
- domains with gambling, pharma, malware, link-farm, or black-hat contamination -> `high_risk_hold`

WordPress fields:

- `wp_base_url` -> `wordpress_connections.wp_base_url`
- `wp_credential_ref` -> `wordpress_connections.wp_credential_ref`
- `seo_plugin` -> `wordpress_connections.seo_plugin`
- `wp_category_id` -> `wordpress_connections.wp_category_id`
- `wp_username` -> `wordpress_connections.wp_username`
- `wp_app_password` -> do not import as plain text

AI fields:

- `automation_enabled` -> `site_ai_settings.automation_enabled`
- `automation_mode` -> `site_ai_settings.automation_mode`
- `workflow_type` -> `site_ai_settings.workflow_type`
- `prompt_profile` -> `site_ai_settings.prompt_profile`
- `llm_provider` -> `site_ai_settings.llm_provider`
- `llm_mode` -> `site_ai_settings.llm_mode`
- `primary_model` -> `site_ai_settings.primary_model`
- `repair_model` -> `site_ai_settings.repair_model`
- `temperature_primary` -> `site_ai_settings.temperature_primary`
- `temperature_repair` -> `site_ai_settings.temperature_repair`
- `translation_enabled` -> `site_ai_settings.translation_enabled`
- `post_frequency` -> `site_ai_settings.post_frequency`
- `monthly_target` -> `site_ai_settings.monthly_target`
- `default_publish_mode` -> `site_ai_settings.default_publish_mode`

Image fields:

- `image_provider` -> `site_image_settings.image_provider`
- `image_style` -> `site_image_settings.image_style`
- `image_count` -> `site_image_settings.image_count`
- `image_source` -> `site_image_settings.image_source`
- `fallback_to_generate` -> `site_image_settings.fallback_to_generate`
- `include_video` -> `site_image_settings.include_video`
- `image_pipeline_mode` -> `site_image_settings.image_pipeline_mode`
- `featured_image_required` -> `site_image_settings.featured_image_required`

Validation fields:

- `validation_min_length` -> `site_validation_rules.validation_min_length`
- `validation_min_h2` -> `site_validation_rules.validation_min_h2`
- `required_keywords` -> `site_validation_rules.required_keywords`

RSS fields:

- `rss_feed_url` -> `site_rss_settings.rss_feed_url`
- `rss_content_filter` -> `site_rss_settings.rss_content_filter`
- `translation_enabled` -> `site_rss_settings.translation_enabled`

## content_queue

Main queue fields:

- `row_id` -> `content_queue.sheet_row_id`
- `site_key` -> `content_queue.site_key`
- `content_type` -> `content_queue.content_type`
- `pack_id` -> `content_queue.pack_id`
- `my_title` -> `content_queue.my_title`
- `keyword` -> `content_queue.keyword`
- `service_type` -> `content_queue.service_type`
- `region` -> `content_queue.region`
- `status` -> `content_queue.status`
- `body_image_count` -> `content_queue.body_image_count`
- `category` -> `content_queue.category`
- `wp_category_id` -> `content_queue.wp_category_id`
- `max_retries` -> `content_queue.max_retries`
- `locked_at` -> `content_queue.locked_at`
- `priority` -> `content_queue.priority`
- `scheduled_date` -> `content_queue.scheduled_date`
- `publish_mode` -> `content_queue.publish_mode`
- `preview` -> `content_queue.preview`
- `created_at` -> `content_queue.created_at`
- `updated_at` -> `content_queue.updated_at`

Validation fields:

- `korean_ratio` -> `content_validation_results.korean_ratio`
- `image_count` -> `content_validation_results.image_count`
- `content_length` -> `content_validation_results.content_length`
- `h2_count` -> `content_validation_results.h2_count`
- `validation_error` -> `content_validation_results.validation_error`
- `error_detail` -> `content_validation_results.error_detail`

Publication fields:

- `wp_post_id` -> `content_publications.wp_post_id`
- `post_url` -> `content_publications.post_url`
- `image_url` -> `content_publications.image_url`
- `title` -> `content_publications.title`
- `meta_description` -> `content_publications.meta_description`
- `tags` -> `content_publications.tags`
- `content_html` -> `content_publications.content_html`

## prompt_packs

- `pack_id` -> `prompt_packs.sheet_pack_id`
- `pack_name` -> `prompt_packs.pack_name`
- `cluster_code` -> `prompt_packs.cluster_code`
- `prompt_type` -> `prompt_packs.prompt_type`
- `llm_provider` -> `prompt_packs.llm_provider`
- `prompt_template` -> `prompt_packs.prompt_template`
- `system_prompt` -> `prompt_packs.system_prompt`
- `user_template` -> `prompt_packs.user_template`
- `temperature` -> `prompt_packs.temperature`
- `version` -> `prompt_packs.version`
- `active` -> `prompt_packs.active`

## image_prompts

- `image_style` -> `image_prompts.image_style`
- `role` -> `image_prompts.role`
- `variant` -> `image_prompts.variant`
- `prompt` -> `image_prompts.prompt`
- `active` -> `image_prompts.active`

## keyword_map

- `keyword_kr` -> `keyword_map.keyword_kr`
- `keyword_en` -> `keyword_map.keyword_en`
- `topic_group` -> `keyword_map.topic_group`
- `service_type` -> `keyword_map.service_type`
- `category` -> `keyword_map.category`
- `wp_category_id` -> `keyword_map.wp_category_id`
- `use_yn` -> `keyword_map.use_yn`
- `note` -> `keyword_map.note`

## link_policy

- `policy_id` -> `partner_link_policies.sheet_policy_id`
- `from_site` -> `partner_link_policies.from_site_key`
- `to_site` -> `partner_link_policies.to_site_key`
- `frequency_per_month` -> `partner_link_policies.frequency_per_month`
- `cooldown_days` -> `partner_link_policies.cooldown_days`
- `anchor_text_list` -> `partner_link_policies.anchor_text_list`
- `last_link_date` -> `partner_link_policies.last_link_date`
- `next_available_date` -> `partner_link_policies.next_available_date`
- `status` -> `partner_link_policies.status`

## run_logs

- `log_id` -> `run_logs.sheet_log_id`
- `run_timestamp` -> `run_logs.run_timestamp`
- `site_key` -> `run_logs.site_key`
- `queue_id` -> `run_logs.queue_id`
- `workflow_type` -> `run_logs.workflow_type`
- `status` -> `run_logs.status`
- `llm_provider_used` -> `run_logs.llm_provider_used`
- `error_code` -> `run_logs.error_code`
- `llm_calls` -> `run_logs.llm_calls`
- `tokens_used` -> `run_logs.tokens_used`
- `cost_usd` -> `run_logs.cost_usd`
- `execution_time_sec` -> `run_logs.execution_time_sec`
- `final_post_url` -> `run_logs.final_post_url`

## wp_setup_queue

- `row_id` -> `wp_setup_queue.sheet_row_id`
- `language` -> `wp_setup_queue.language_code`
- `domain` -> `wp_setup_queue.domain`
- `linux_user` -> `wp_setup_queue.linux_user`
- `wp_email` -> `wp_setup_queue.wp_email`
- `wp_username` -> `wp_setup_queue.wp_username`
- `wp_app_password` -> do not import as plain text
- `site_name` -> `wp_setup_queue.site_name`
- `site_concept` -> `wp_setup_queue.site_concept`
- `category_1` to `category_5` -> `wp_setup_queue.categories`
- `theme_slug` -> `wp_setup_queue.theme_slug`
- `monetize` -> `wp_setup_queue.monetize`
- `dr_score` -> `wp_setup_queue.dr_score`
- `approval` -> `wp_setup_queue.approval`
- `setup_status` -> `wp_setup_queue.setup_status`
- `memo` -> `wp_setup_queue.memo`
- `setup_date` -> `wp_setup_queue.setup_date`
- `error_log` -> `wp_setup_queue.error_log`
