-- 0008_bot_avatars_storage
-- Storage bucket for bot avatar/logo uploads used by the Appearance panel.
-- Public bucket: files are served directly by URL to the (public, anonymous)
-- chat widget, so read access is public. Writes are scoped to the owning
-- merchant via a path convention: <bot_id>/<filename>, checked against
-- bots.owner_id, mirroring the RLS idiom in 0002/0007.

insert into storage.buckets (id, name, public)
values ('bot-avatars', 'bot-avatars', true)
on conflict (id) do nothing;

create policy "anyone can read bot avatars"
  on storage.objects for select
  using (bucket_id = 'bot-avatars');

create policy "owners upload their bot avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'bot-avatars'
    and exists (
      select 1 from public.bots
      where public.bots.id::text = (storage.foldername(name))[1]
        and public.bots.owner_id = auth.uid()
    )
  );

create policy "owners update their bot avatars"
  on storage.objects for update
  using (
    bucket_id = 'bot-avatars'
    and exists (
      select 1 from public.bots
      where public.bots.id::text = (storage.foldername(name))[1]
        and public.bots.owner_id = auth.uid()
    )
  );

create policy "owners delete their bot avatars"
  on storage.objects for delete
  using (
    bucket_id = 'bot-avatars'
    and exists (
      select 1 from public.bots
      where public.bots.id::text = (storage.foldername(name))[1]
        and public.bots.owner_id = auth.uid()
    )
  );
