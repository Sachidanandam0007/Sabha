-- =====================================================================
-- SABHA v3 — Supabase database + security rules
-- Supabase > SQL Editor > New query > paste this whole file > Run.
-- Then run the "MAKE YOURSELF ADMIN" block at the bottom with your email.
--
-- Security model (enforced by Postgres, not by the screen):
--   * Visitors can ONLY submit an application. They cannot read anything.
--   * Contact details, billing and admin flags live in separate locked tables.
--   * Access = approved + active + paid up (investors and comp members exempt).
--     When paid_until passes, access stops automatically — no manual step.
--   * Members cannot change their own status, role, plan or payment date.
--   * Rate limits on applications, posts, intros and deals stop spam and scraping.
--   * Only http(s) links are stored (blocks javascript: link attacks).
-- =====================================================================

-- ---------- tables ----------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (char_length(phone) <= 20),
  role text not null check (role in ('founder','business','investor','service')),
  company text not null check (char_length(company) between 1 and 100),
  website text check (website = '' or (char_length(website) <= 200 and website ~* '^https?://')),
  city text check (char_length(city) <= 60),
  gst_cin text check (char_length(gst_cin) <= 30),
  linkedin text check (linkedin = '' or (char_length(linkedin) <= 200 and linkedin ~* '^https?://')),
  industry text check (char_length(industry) <= 60),
  revenue_band text check (char_length(revenue_band) <= 60),
  stage text check (char_length(stage) <= 60),
  seeking text check (char_length(seeking) <= 600),
  referral text check (char_length(referral) <= 100),
  status text not null default 'pending' check (status in ('pending','approved','rejected'))
);
create unique index if not exists applications_one_pending on public.applications (lower(email)) where status = 'pending';

-- public profile only (no email, no phone, no billing, no admin flag)
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 80),
  role text not null check (role in ('founder','business','investor','service')),
  company text check (char_length(company) <= 100),
  headline text check (char_length(headline) <= 140),
  city text check (char_length(city) <= 60),
  industry text check (char_length(industry) <= 60),
  stage text check (char_length(stage) <= 60),
  revenue_band text check (char_length(revenue_band) <= 60),
  website text check (website is null or website = '' or (char_length(website) <= 200 and website ~* '^https?://')),
  linkedin text check (linkedin is null or linkedin = '' or (char_length(linkedin) <= 200 and linkedin ~* '^https?://')),
  bio text check (char_length(bio) <= 1200),
  seeking text check (char_length(seeking) <= 600),
  offering text check (char_length(offering) <= 600),
  traction text check (char_length(traction) <= 600),
  status text not null default 'approved' check (status in ('approved','active','suspended'))
);

create table if not exists public.member_private (
  member_id uuid primary key references public.members(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  phone text check (char_length(phone) <= 20)
);

create table if not exists public.member_billing (
  member_id uuid primary key references public.members(id) on delete cascade,
  plan text check (plan in ('founding','founder','business','investor','comp')),
  paid_until date,
  updated_at timestamptz not null default now()
);

create table if not exists public.admins (
  member_id uuid primary key references public.members(id) on delete cascade
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id uuid not null references public.members(id) on delete cascade,
  type text not null check (type in ('Partnership','Supplier needed','Distribution','Buying / acquisition','Seeking advice','Offering')),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 1500)
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  founder_id uuid not null references public.members(id) on delete cascade,
  company text not null check (char_length(company) <= 100),
  sector text check (char_length(sector) <= 60),
  stage text check (char_length(stage) <= 60),
  raising text not null check (char_length(raising) <= 40),
  valuation text check (char_length(valuation) <= 60),
  summary text not null check (char_length(summary) between 10 and 1500),
  deck_url text check (deck_url is null or deck_url = '' or (char_length(deck_url) <= 300 and deck_url ~* '^https?://'))
);

create table if not exists public.intros (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  from_id uuid not null references public.members(id) on delete cascade,
  to_id uuid not null references public.members(id) on delete cascade,
  context text check (char_length(context) <= 200),
  message text not null check (char_length(message) between 10 and 600),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  check (from_id <> to_id)
);
create unique index if not exists intros_one_pending on public.intros (from_id, to_id) where status = 'pending';


-- ---------- events (pitch nights, dinners, roundtables) ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 3 and 120),
  kind text not null default 'Roundtable' check (kind in ('Pitch night','Roundtable','Dinner','Online session','Site visit')),
  starts_at timestamptz not null,
  city text check (char_length(city) <= 60),
  venue text check (char_length(venue) <= 160),
  join_url text check (join_url is null or join_url = '' or (char_length(join_url) <= 300 and join_url ~* '^https?://')),
  description text check (char_length(description) <= 1500),
  seats int not null default 30 check (seats between 1 and 1000)
);
create table if not exists public.rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

-- ---------- identity helpers ----------
create or replace function public.my_id() returns uuid
language sql stable security definer set search_path = public as $$
  select member_id from member_private where email = lower(auth.jwt() ->> 'email') limit 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where member_id = my_id())
$$;

-- does member <mid> currently have access? (active + paid, or investor/comp)
create or replace function public.has_access(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members m left join member_billing b on b.member_id = m.id
    where m.id = mid and m.status = 'active'
      and (m.role = 'investor' or b.plan = 'comp' or b.paid_until >= current_date))
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select has_access(my_id())
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from members where id = my_id()
$$;

-- everything the app needs about the signed-in person, in one call
create or replace function public.my_member() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(m) || jsonb_build_object(
    'is_admin', exists (select 1 from admins a where a.member_id = m.id),
    'plan', b.plan, 'paid_until', b.paid_until, 'access', has_access(m.id))
  from members m left join member_billing b on b.member_id = m.id
  where m.id = my_id()
$$;

-- ---------- admin actions ----------
create or replace function public.decide_application(app_id uuid, decision text) returns void
language plpgsql security definer set search_path = public as $$
declare a applications; new_id uuid;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if decision not in ('approved','rejected') then raise exception 'bad decision'; end if;
  update applications set status = decision where id = app_id and status = 'pending' returning * into a;
  if a.id is null then raise exception 'application not found or already decided'; end if;
  if decision = 'approved' and not exists (select 1 from member_private where email = lower(a.email)) then
    insert into members (name, role, company, city, industry, stage, revenue_band, website, linkedin, seeking, status)
    values (a.name, a.role, a.company, a.city, a.industry, a.stage, a.revenue_band, a.website, a.linkedin, a.seeking,
            case when a.role = 'investor' then 'active' else 'approved' end)
    returning id into new_id;
    insert into member_private (member_id, email, phone) values (new_id, lower(a.email), a.phone);
    insert into member_billing (member_id, plan) values (new_id, case when a.role = 'investor' then 'investor' end);
  end if;
end $$;

create or replace function public.admin_set_member(mid uuid, new_status text, new_plan text, new_paid_until date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  update members set status = new_status where id = mid;
  insert into member_billing (member_id, plan, paid_until, updated_at) values (mid, nullif(new_plan, ''), new_paid_until, now())
  on conflict (member_id) do update set plan = excluded.plan, paid_until = excluded.paid_until, updated_at = now();
end $$;

-- ---------- guards + rate limits ----------
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and (new.status is distinct from old.status or new.role is distinct from old.role
     or new.id is distinct from old.id or new.created_at is distinct from old.created_at) then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists members_guard on public.members;
create trigger members_guard before update on public.members for each row execute function public.members_guard();

create or replace function public.applications_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := 'pending'; new.created_at := now(); new.email := lower(trim(new.email));
  if (select count(*) from applications where email = new.email and created_at > now() - interval '7 days') >= 2 then
    raise exception 'An application for this email is already under review.';
  end if;
  if (select count(*) from applications where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'We are receiving a lot of applications. Please try again in an hour.';
  end if;
  return new;
end $$;
drop trigger if exists applications_guard on public.applications;
create trigger applications_guard before insert on public.applications for each row execute function public.applications_guard();

create or replace function public.posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from posts where author_id = new.author_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Limit reached: 5 posts per day.';
  end if;
  return new;
end $$;
drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before insert on public.posts for each row execute function public.posts_guard();

create or replace function public.deals_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from deals where founder_id = new.founder_id) >= 3 then
    raise exception 'Limit reached: 3 rounds per member. Remove an old one first.';
  end if;
  return new;
end $$;
drop trigger if exists deals_guard on public.deals;
create trigger deals_guard before insert on public.deals for each row execute function public.deals_guard();

create or replace function public.intros_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.created_at := now();
    if (select count(*) from intros where from_id = new.from_id and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Limit reached: 10 intro requests per day.';
    end if;
    if not has_access(new.to_id) then raise exception 'member not available'; end if;
  elsif not is_admin() and (new.from_id <> old.from_id or new.to_id <> old.to_id or new.message <> old.message
        or new.context is distinct from old.context or new.created_at <> old.created_at or old.status <> 'pending') then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists intros_guard on public.intros;
create trigger intros_guard before insert or update on public.intros for each row execute function public.intros_guard();


create or replace function public.rsvps_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = new.event_id;
  if e.id is null or e.starts_at < now() then raise exception 'This event is no longer open.'; end if;
  if (select count(*) from rsvps where event_id = new.event_id) >= e.seats then raise exception 'This event is full.'; end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists rsvps_guard on public.rsvps;
create trigger rsvps_guard before insert on public.rsvps for each row execute function public.rsvps_guard();

-- admin view (security_invoker: the table rules below still apply, so only admins see rows with emails/billing)
create or replace view public.admin_members with (security_invoker = true) as
  select m.*, p.email, p.phone, b.plan, b.paid_until,
         exists (select 1 from public.admins a where a.member_id = m.id) as is_admin
  from public.members m
  join public.member_private p on p.member_id = m.id
  left join public.member_billing b on b.member_id = m.id;

-- ---------- row level security ----------
alter table public.applications   enable row level security;
alter table public.members        enable row level security;
alter table public.member_private enable row level security;
alter table public.member_billing enable row level security;
alter table public.admins         enable row level security;
alter table public.posts          enable row level security;
alter table public.deals          enable row level security;
alter table public.intros         enable row level security;
alter table public.events         enable row level security;
alter table public.rsvps          enable row level security;

drop policy if exists app_insert on public.applications;
create policy app_insert on public.applications for insert to anon, authenticated with check (status = 'pending');
drop policy if exists app_admin on public.applications;
create policy app_admin on public.applications for select to authenticated using (is_admin());

drop policy if exists mem_read on public.members;
create policy mem_read on public.members for select to authenticated
  using (id = my_id() or is_admin() or (is_active() and has_access(id)));
drop policy if exists mem_update on public.members;
create policy mem_update on public.members for update to authenticated
  using (id = my_id() or is_admin()) with check (id = my_id() or is_admin());

drop policy if exists priv_read on public.member_private;
create policy priv_read on public.member_private for select to authenticated using (
  member_id = my_id() or is_admin() or (is_active() and has_access(member_private.member_id) and exists (
    select 1 from public.intros i where i.status = 'accepted'
      and ((i.from_id = my_id() and i.to_id = member_private.member_id)
        or (i.to_id = my_id() and i.from_id = member_private.member_id)))));

drop policy if exists bill_read on public.member_billing;
create policy bill_read on public.member_billing for select to authenticated using (member_id = my_id() or is_admin());

drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select to authenticated using (is_admin());

drop policy if exists post_read on public.posts;
create policy post_read on public.posts for select to authenticated using (is_active());
drop policy if exists post_insert on public.posts;
create policy post_insert on public.posts for insert to authenticated with check (is_active() and author_id = my_id());
drop policy if exists post_delete on public.posts;
create policy post_delete on public.posts for delete to authenticated using (author_id = my_id() or is_admin());

drop policy if exists deal_read on public.deals;
create policy deal_read on public.deals for select to authenticated
  using (is_admin() or founder_id = my_id() or (is_active() and my_role() = 'investor'));
drop policy if exists deal_insert on public.deals;
create policy deal_insert on public.deals for insert to authenticated
  with check (is_active() and founder_id = my_id() and my_role() in ('founder','business'));
drop policy if exists deal_delete on public.deals;
create policy deal_delete on public.deals for delete to authenticated using (founder_id = my_id() or is_admin());

drop policy if exists intro_read on public.intros;
create policy intro_read on public.intros for select to authenticated using (from_id = my_id() or to_id = my_id() or is_admin());
drop policy if exists intro_insert on public.intros;
create policy intro_insert on public.intros for insert to authenticated with check (is_active() and from_id = my_id());
drop policy if exists intro_answer on public.intros;
create policy intro_answer on public.intros for update to authenticated
  using (to_id = my_id() or is_admin()) with check (to_id = my_id() or is_admin());


drop policy if exists ev_read on public.events;
create policy ev_read on public.events for select to authenticated using (is_active() or is_admin());
drop policy if exists ev_admin on public.events;
create policy ev_admin on public.events for all to authenticated using (is_admin()) with check (is_admin());

-- members can see who is attending (it's a networking club) and RSVP only for themselves
drop policy if exists rsvp_read on public.rsvps;
create policy rsvp_read on public.rsvps for select to authenticated using (is_active() or is_admin());
drop policy if exists rsvp_insert on public.rsvps;
create policy rsvp_insert on public.rsvps for insert to authenticated with check (is_active() and member_id = my_id());
drop policy if exists rsvp_delete on public.rsvps;
create policy rsvp_delete on public.rsvps for delete to authenticated using (member_id = my_id() or is_admin());

-- ---------- least privilege: visitors may only insert an application ----------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant insert on public.applications to anon, authenticated;
grant select on public.applications to authenticated;
grant select, update (name, company, headline, city, industry, stage, revenue_band, website, linkedin, bio, seeking, offering, traction)
  on public.members to authenticated;
grant select on public.member_private, public.member_billing, public.admins, public.admin_members to authenticated;
grant select, insert, delete on public.posts, public.deals to authenticated;
grant select, insert on public.intros to authenticated;
grant update (status) on public.intros to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, delete on public.rsvps to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_id(), public.is_admin(), public.has_access(uuid), public.is_active(), public.my_role(),
  public.my_member(), public.decide_application(uuid, text), public.admin_set_member(uuid, text, text, date) to authenticated;

-- =====================================================================
-- MAKE YOURSELF ADMIN — change name + email, remove the "--" and run once.
-- =====================================================================
-- do $$
-- declare new_id uuid;
-- begin
--   insert into public.members (name, role, company, status) values ('Sachin', 'business', 'Sabha', 'active') returning id into new_id;
--   insert into public.member_private (member_id, email) values (new_id, lower('YOUR-EMAIL@gmail.com'));
--   insert into public.member_billing (member_id, plan) values (new_id, 'comp');
--   insert into public.admins (member_id) values (new_id);
-- end $$;
