-- Tighten RLS policies on agency-internal tables.
-- Regular org members should only have SELECT access.
-- Write operations (INSERT/UPDATE/DELETE) are restricted to agency admins
-- or handled via service-role (admin client) in cron routes.

-- ============================================================
-- location_agent_config: replace FOR ALL with SELECT-only for org members
-- ============================================================
DROP POLICY IF EXISTS "agent_config_all" ON location_agent_config;
CREATE POLICY "agent_config_select_only" ON location_agent_config
  FOR SELECT USING (location_id IN (SELECT get_user_location_ids()));

-- ============================================================
-- agent_activity_log: keep SELECT, restrict INSERT to service role only
-- ============================================================
DROP POLICY IF EXISTS "agent_activity_insert" ON agent_activity_log;
-- INSERT is now handled exclusively via service-role (admin client) in cron routes.
-- No RLS INSERT policy needed — crons use createAdminClient() which bypasses RLS.

-- ============================================================
-- local_falcon_scans: replace FOR ALL with SELECT-only
-- ============================================================
DROP POLICY IF EXISTS "agency_admin_manage_lf_scans" ON local_falcon_scans;
CREATE POLICY "lf_scans_select_only" ON local_falcon_scans
  FOR SELECT USING (location_id IN (SELECT get_user_location_ids()));

-- ============================================================
-- gbp_search_keywords: replace FOR ALL with SELECT-only
-- ============================================================
DROP POLICY IF EXISTS "agency_admin_manage_gbp_keywords" ON gbp_search_keywords;
CREATE POLICY "gbp_keywords_select_only" ON gbp_search_keywords
  FOR SELECT USING (location_id IN (SELECT get_user_location_ids()));

-- ============================================================
-- location_setup_phases: keep SELECT, restrict INSERT/UPDATE to service role
-- ============================================================
DROP POLICY IF EXISTS "setup_phases_insert" ON location_setup_phases;
DROP POLICY IF EXISTS "setup_phases_update" ON location_setup_phases;
-- INSERT/UPDATE handled via service-role (admin client) in pipeline.ts.
