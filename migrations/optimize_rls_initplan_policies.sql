-- Optimize RLS policy expressions to avoid per-row auth function re-evaluation

-- user_podcast_votes: replace auth.uid() with (select auth.uid())
drop policy if exists "Allow users to insert their own votes" on public.user_podcast_votes;
create policy "Allow users to insert their own votes"
  on public.user_podcast_votes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Allow users to delete their own votes" on public.user_podcast_votes;
create policy "Allow users to delete their own votes"
  on public.user_podcast_votes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- archive.panel_valuable: keep public read, scope write policy to authenticated only
drop policy if exists "Allow authenticated users to mark valuable" on archive.panel_valuable;
create policy "Allow authenticated users to mark valuable"
  on archive.panel_valuable
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Allow authenticated users to update valuable" on archive.panel_valuable;
create policy "Allow authenticated users to update valuable"
  on archive.panel_valuable
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Allow authenticated users to delete valuable" on archive.panel_valuable;
create policy "Allow authenticated users to delete valuable"
  on archive.panel_valuable
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- service role policies: use (select auth.role()) for initplan optimization
drop policy if exists "Allow service role all operations" on archive.discussion_takeaways;
create policy "Allow service role all operations"
  on archive.discussion_takeaways
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow service role all operations" on archive.discussions;
create policy "Allow service role all operations"
  on archive.discussions
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow service role all operations" on archive.panel_guests;
create policy "Allow service role all operations"
  on archive.panel_guests
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow service role all operations" on archive.panel_themes;
create policy "Allow service role all operations"
  on archive.panel_themes
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow service role all operations" on archive.panels;
create policy "Allow service role all operations"
  on archive.panels
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow service role all operations" on archive.perspectives;
create policy "Allow service role all operations"
  on archive.perspectives
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow all operations" on public.chunk_embeddings;
create policy "Allow all operations"
  on public.chunk_embeddings
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow all operations" on public.chunk_theme_assignments;
create policy "Allow all operations"
  on public.chunk_theme_assignments
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow all operations" on public.guest_theme_strengths;
create policy "Allow all operations"
  on public.guest_theme_strengths
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow all operations" on public.theme_extractions;
create policy "Allow all operations"
  on public.theme_extractions
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow all operations" on public.themes;
create policy "Allow all operations"
  on public.themes
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Service role can do everything on episodes" on public.episodes;
create policy "Service role can do everything on episodes"
  on public.episodes
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Service role can do everything on guests" on public.guests;
create policy "Service role can do everything on guests"
  on public.guests
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Service role can do everything on segments" on public.segments;
create policy "Service role can do everything on segments"
  on public.segments
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Service role can do everything on sponsor_mentions" on public.sponsor_mentions;
create policy "Service role can do everything on sponsor_mentions"
  on public.sponsor_mentions
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Service role can do everything on lightning_round_answers" on public.lightning_round_answers;
create policy "Service role can do everything on lightning_round_answers"
  on public.lightning_round_answers
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "Service role can do everything on lightning_round_books" on public.lightning_round_books;
create policy "Service role can do everything on lightning_round_books"
  on public.lightning_round_books
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "js_full_access" on public.js_applications;
create policy "js_full_access"
  on public.js_applications
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "js_full_access" on public.js_feedback_loop;
create policy "js_full_access"
  on public.js_feedback_loop
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "js_full_access" on public.js_identity_profiles;
create policy "js_full_access"
  on public.js_identity_profiles
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "js_full_access" on public.js_jobs;
create policy "js_full_access"
  on public.js_jobs
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "js_full_access" on public.js_llm_logs;
create policy "js_full_access"
  on public.js_llm_logs
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "js_full_access" on public.js_messages;
create policy "js_full_access"
  on public.js_messages
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "js_full_access" on public.js_posts;
create policy "js_full_access"
  on public.js_posts
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "js_full_access" on public.js_strategies;
create policy "js_full_access"
  on public.js_strategies
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
