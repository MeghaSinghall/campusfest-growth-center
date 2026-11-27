-- CampusFest Sponsor Growth Center — local Postgres schema
-- Source tables mirror the provided RISA sponsorship dataset (deduplicated on load).
-- App tables (prefixed app_) hold team-managed data: budgets, tasks, cash receipts, settings, audit log.

DROP VIEW IF EXISTS opportunity_latest, brand_qualification_latest;
DROP TABLE IF EXISTS app_audit_log, app_chat_message, app_payment, app_task, app_campaign_plan, app_settings, app_import_issue,
  sponsor_activation, opportunity_history, partner_opportunity, brand_qualification, sponsor_interaction,
  sponsor_campaign, sponsor_contact, brand, target_plan, event CASCADE;

CREATE TABLE event (
  event_name text PRIMARY KEY, history_start date, history_end date,
  event_starts_at timestamptz, event_ends_at timestamptz, timezone text, currency text, fictional boolean
);

CREATE TABLE target_plan (
  target_version text PRIMARY KEY, effective_at timestamptz NOT NULL,
  qualified_brands_goal int NOT NULL, confirmed_partnerships_goal int NOT NULL,
  confirmed_value_goal_inr bigint,            -- app extension (assumption, NULL in source)
  source text NOT NULL DEFAULT 'dataset'
);

CREATE TABLE brand (
  brand_id text PRIMARY KEY, brand_name text NOT NULL, industry text, owner_id text, owner_name text, created_at timestamptz
);

CREATE TABLE sponsor_contact (
  contact_id text PRIMARY KEY, contact_name text, job_title text, brand_id text REFERENCES brand, created_at timestamptz
);

CREATE TABLE sponsor_campaign (
  sponsor_campaign_id text PRIMARY KEY, campaign_name text NOT NULL, channel text, objective text, audience text,
  owner_id text, owner_name text, planned_start_at timestamptz, planned_end_at timestamptz, created_at timestamptz
);

CREATE TABLE sponsor_interaction (
  interaction_id text PRIMARY KEY, attempt_id text, origin_interaction_id text,
  brand_id text REFERENCES brand, contact_id text, sponsor_campaign_id text REFERENCES sponsor_campaign, owner_id text,
  channel text, event_type text NOT NULL, outcome text, summary text, occurred_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'dataset'
);
CREATE INDEX ON sponsor_interaction (occurred_at);
CREATE INDEX ON sponsor_interaction (brand_id);

CREATE TABLE brand_qualification (
  history_id text PRIMARY KEY, brand_id text REFERENCES brand, qualification_status text NOT NULL, reason text,
  sponsor_campaign_id text, effective_at timestamptz NOT NULL, source text NOT NULL DEFAULT 'dataset'
);

CREATE TABLE partner_opportunity (
  opportunity_id text PRIMARY KEY, opportunity_name text, brand_id text REFERENCES brand, primary_contact_id text,
  sponsor_campaign_id text, support_type text, created_at timestamptz, source text NOT NULL DEFAULT 'dataset'
);

CREATE TABLE opportunity_history (
  history_id text PRIMARY KEY, opportunity_id text REFERENCES partner_opportunity, brand_id text, stage text NOT NULL,
  proposed_value_inr bigint, confirmed_value_inr bigint, owner_id text, owner_name text, effective_at timestamptz NOT NULL,
  note text, source text NOT NULL DEFAULT 'dataset'
);
CREATE INDEX ON opportunity_history (opportunity_id, effective_at);

CREATE TABLE sponsor_activation (
  activation_id text PRIMARY KEY, brand_id text, opportunity_id text, attendee_campaign_id text,
  attendee_campaign_name text, activation_note text, linked_at timestamptz
);

-- ---------- App-managed tables ----------
CREATE TABLE app_campaign_plan (
  sponsor_campaign_id text PRIMARY KEY REFERENCES sponsor_campaign,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','scaling','fixing','paused','stopped')),
  budget_inr bigint NOT NULL DEFAULT 0, spent_inr bigint NOT NULL DEFAULT 0,
  hours_per_week numeric NOT NULL DEFAULT 0, notes text, updated_at timestamptz DEFAULT now()
);

CREATE TABLE app_task (
  id serial PRIMARY KEY, title text NOT NULL, description text, owner_name text,
  due_date date, status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  sponsor_campaign_id text REFERENCES sponsor_campaign, opportunity_id text REFERENCES partner_opportunity,
  created_by text NOT NULL DEFAULT 'user', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE app_payment (
  id serial PRIMARY KEY, opportunity_id text NOT NULL REFERENCES partner_opportunity,
  amount_inr bigint NOT NULL CHECK (amount_inr > 0), received_at timestamptz NOT NULL, reference text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE app_settings (key text PRIMARY KEY, value jsonb NOT NULL);

CREATE TABLE app_audit_log (
  id serial PRIMARY KEY, at timestamptz DEFAULT now(), actor text NOT NULL, action text NOT NULL,
  entity text, entity_id text, details jsonb
);

CREATE TABLE app_import_issue (id serial PRIMARY KEY, source_table text, source_id text, issue text, payload jsonb);

CREATE TABLE app_chat_message (
  id serial PRIMARY KEY, session_id text NOT NULL, role text NOT NULL, content jsonb NOT NULL, created_at timestamptz DEFAULT now()
);

-- Convenience views for ad-hoc analysis: latest full-state version per entity (all time; filter effective_at yourself for past snapshots)
CREATE VIEW opportunity_latest AS
  SELECT DISTINCT ON (h.opportunity_id) h.opportunity_id, o.opportunity_name, o.brand_id, b.brand_name, o.sponsor_campaign_id, c.campaign_name, c.channel,
         CASE WHEN o.sponsor_campaign_id IN ('SC02','SC04','SC05') THEN 'warm' ELSE 'cold' END AS channel_group,
         o.support_type, h.stage, h.proposed_value_inr, h.confirmed_value_inr, h.owner_name, h.effective_at
  FROM opportunity_history h JOIN partner_opportunity o USING (opportunity_id) JOIN brand b ON b.brand_id = o.brand_id JOIN sponsor_campaign c ON c.sponsor_campaign_id = o.sponsor_campaign_id
  ORDER BY h.opportunity_id, h.effective_at DESC, h.history_id DESC;
CREATE VIEW brand_qualification_latest AS
  SELECT DISTINCT ON (brand_id) * FROM brand_qualification ORDER BY brand_id, effective_at DESC, history_id DESC;

-- Read-only role used by the AI copilot's ad-hoc SQL tool.
-- Hosted Postgres users (e.g. Render) may lack CREATEROLE: then we skip it and rely on READ ONLY transactions.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'copilot_ro') THEN
    CREATE ROLE copilot_ro NOLOGIN;
  END IF;
  GRANT copilot_ro TO CURRENT_USER;
  GRANT USAGE ON SCHEMA public TO copilot_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO copilot_ro;
  REVOKE SELECT ON app_chat_message FROM copilot_ro;
EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
  RAISE NOTICE 'copilot_ro role not created (no privilege); copilot SQL stays read-only via READ ONLY transactions';
END $$;
