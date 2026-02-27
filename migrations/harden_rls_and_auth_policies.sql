-- Harden RLS and policy posture for public-facing schemas

-- 1) Enable RLS on tables flagged as errors
alter table if exists public.books enable row level security;
alter table if exists public.book_recommendations enable row level security;

drop policy if exists "Public read books" on public.books;
create policy "Public read books"
  on public.books
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read book recommendations" on public.book_recommendations;
create policy "Public read book recommendations"
  on public.book_recommendations
  for select
  to anon, authenticated
  using (true);

-- 2) Replace overly permissive service-role policies (USING/WITH CHECK true)
drop policy if exists "Allow service role all operations" on archive.discussion_takeaways;
create policy "Allow service role all operations"
  on archive.discussion_takeaways
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow service role all operations" on archive.discussions;
create policy "Allow service role all operations"
  on archive.discussions
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow service role all operations" on archive.panel_guests;
create policy "Allow service role all operations"
  on archive.panel_guests
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow service role all operations" on archive.panel_themes;
create policy "Allow service role all operations"
  on archive.panel_themes
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow service role all operations" on archive.panels;
create policy "Allow service role all operations"
  on archive.panels
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow service role all operations" on archive.perspectives;
create policy "Allow service role all operations"
  on archive.perspectives
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow all operations" on public.chunk_embeddings;
create policy "Allow all operations"
  on public.chunk_embeddings
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow all operations" on public.chunk_theme_assignments;
create policy "Allow all operations"
  on public.chunk_theme_assignments
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow all operations" on public.guest_theme_strengths;
create policy "Allow all operations"
  on public.guest_theme_strengths
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow all operations" on public.theme_extractions;
create policy "Allow all operations"
  on public.theme_extractions
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Allow all operations" on public.themes;
create policy "Allow all operations"
  on public.themes
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can do everything on episodes" on public.episodes;
create policy "Service role can do everything on episodes"
  on public.episodes
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can do everything on guests" on public.guests;
create policy "Service role can do everything on guests"
  on public.guests
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can do everything on segments" on public.segments;
create policy "Service role can do everything on segments"
  on public.segments
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can do everything on sponsor_mentions" on public.sponsor_mentions;
create policy "Service role can do everything on sponsor_mentions"
  on public.sponsor_mentions
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can do everything on lightning_round_answers" on public.lightning_round_answers;
create policy "Service role can do everything on lightning_round_answers"
  on public.lightning_round_answers
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can do everything on lightning_round_books" on public.lightning_round_books;
create policy "Service role can do everything on lightning_round_books"
  on public.lightning_round_books
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "js_full_access" on public.js_applications;
create policy "js_full_access"
  on public.js_applications
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "js_full_access" on public.js_feedback_loop;
create policy "js_full_access"
  on public.js_feedback_loop
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "js_full_access" on public.js_identity_profiles;
create policy "js_full_access"
  on public.js_identity_profiles
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "js_full_access" on public.js_jobs;
create policy "js_full_access"
  on public.js_jobs
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "js_full_access" on public.js_llm_logs;
create policy "js_full_access"
  on public.js_llm_logs
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "js_full_access" on public.js_messages;
create policy "js_full_access"
  on public.js_messages
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "js_full_access" on public.js_posts;
create policy "js_full_access"
  on public.js_posts
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "js_full_access" on public.js_strategies;
create policy "js_full_access"
  on public.js_strategies
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3) Tighten public write policies previously using WITH CHECK (true)
drop policy if exists "Public insert concept votes" on public.concept_valuable_votes;
create policy "Public insert concept votes"
  on public.concept_valuable_votes
  for insert
  to anon, authenticated
  with check (
    concept_id is not null
    and length(trim(voter_id)) > 0
  );

drop policy if exists "Public insert insight votes" on public.insight_valuable_votes;
create policy "Public insert insight votes"
  on public.insight_valuable_votes
  for insert
  to anon, authenticated
  with check (
    insight_id is not null
    and length(trim(voter_id)) > 0
  );

drop policy if exists "Anyone can insert votes" on public.podcast_request_votes;
create policy "Anyone can insert votes"
  on public.podcast_request_votes
  for insert
  to anon, authenticated
  with check (
    request_id is not null
    and length(trim(voter_id)) > 0
  );

drop policy if exists "Anyone can insert podcast requests" on public.podcast_requests;
create policy "Anyone can insert podcast requests"
  on public.podcast_requests
  for insert
  to anon, authenticated
  with check (
    length(trim(podcast_name)) > 0
    and (
      requested_by_email is null
      or requested_by_email like '%@%'
    )
  );

drop policy if exists "Allow public like updates" on public.podcasts;
create policy "Allow public like updates"
  on public.podcasts
  for update
  to anon, authenticated
  using (status = 'coming_soon')
  with check (
    status = 'coming_soon'
    and vote_count >= 0
  );

-- 4) Resolve mutable search_path warnings for known functions
alter function public.update_podcasts_updated_at()
  set search_path = public, pg_temp;

alter function public.update_podcast_requests_updated_at()
  set search_path = public, pg_temp;

alter function public.update_updated_at_column()
  set search_path = public, pg_temp;

alter function public.vote_for_podcast_request(uuid, text)
  set search_path = public, pg_temp;
