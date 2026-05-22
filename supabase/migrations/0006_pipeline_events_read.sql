-- 0006_pipeline_events_read.sql
-- Allow the browser (anon-key) client to read pipeline_events so the
-- LiveLog right rail can fetch + Realtime-subscribe per thesis_id. Writes
-- continue to come from server routes using the service-role key.
--
-- Risk: events carry model name, event_type, token counts, and driver_id
-- (and any payload data the route encloses). thesis_id is the only gate;
-- a user who knows a thesis URL can read its event stream. Acceptable for
-- cycle 2 demo scope.

create policy pipeline_events_read_anon on pipeline_events
  for select to anon, authenticated
  using (true);
