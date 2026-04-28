create or replace view public.leaderboard
with (security_invoker = on) as
  select
    pr.id as user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(sum(p.points), 0)::int as total_points,
    coalesce(sum(case when p.points = 3 then 1 else 0 end), 0)::int as exact_hits,
    coalesce(sum(case when p.points = 1 then 1 else 0 end), 0)::int as result_hits,
    count(p.id)::int as predictions_count
  from public.profiles pr
  left join public.predictions p on p.user_id = pr.id
  left join public.matches m on m.id = p.match_id and m.status = 'finished'
  where pr.status <> 'rejected'
  group by pr.id, pr.display_name, pr.avatar_url;