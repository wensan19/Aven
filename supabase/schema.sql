create extension if not exists pgcrypto;

do $$ begin
  create type public.finance_type as enum ('allowance', 'income', 'spending', 'savings', 'stocks', 'banking');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_type as enum ('profile_update', 'profile_updated', 'goal_added', 'goal_hit', 'budget_under');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.share_section as enum ('allowance', 'income', 'spending', 'savings', 'stocks', 'banking', 'wishlist');
exception
  when duplicate_object then null;
end $$;

alter type public.finance_type add value if not exists 'stocks';
alter type public.finance_type add value if not exists 'banking';
alter type public.activity_type add value if not exists 'profile_update';
alter type public.share_section add value if not exists 'allowance';
alter type public.share_section add value if not exists 'income';
alter type public.share_section add value if not exists 'spending';
alter type public.share_section add value if not exists 'savings';
alter type public.share_section add value if not exists 'stocks';
alter type public.share_section add value if not exists 'banking';
alter type public.share_section add value if not exists 'wishlist';

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null default '',
  email text not null default '',
  bio text not null default '',
  avatar_url text,
  theme text not null default 'pastel-blue',
  is_public boolean not null default true,
  share_finance_summary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type finance_type not null,
  name text not null,
  icon_url text,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type finance_type not null,
  category_id uuid references public.categories(id) on delete set null,
  title text not null default '',
  image_url text,
  source_type text not null default 'allowance',
  counts_as_allowance boolean not null default false,
  source_amount numeric(12, 2),
  allowance_amount numeric(12, 2),
  amount numeric(12, 2) not null check (amount >= 0),
  note text not null default '',
  date date not null default current_date,
  is_public_summary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions add column if not exists title text not null default '';
alter table public.transactions add column if not exists image_url text;
alter table public.transactions add column if not exists source_type text not null default 'allowance';
alter table public.transactions add column if not exists counts_as_allowance boolean not null default false;
alter table public.transactions add column if not exists source_amount numeric(12, 2);
alter table public.transactions add column if not exists allowance_amount numeric(12, 2);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type finance_type not null,
  category_id uuid references public.categories(id) on delete cascade,
  name text not null default '',
  target_amount numeric(12, 2) not null check (target_amount >= 0),
  month date not null,
  is_public_goal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.stock_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.:-]{1,15}$'),
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  image_url text,
  target_price numeric(12, 2) not null check (target_price >= 0),
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.user_share_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  section_key share_section not null,
  created_at timestamptz not null default now(),
  primary key (user_id, section_key)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type activity_type not null,
  title text not null,
  body text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.activities add column if not exists activity_type public.activity_type;
alter table public.activities add column if not exists title text not null default '';
alter table public.activities add column if not exists body text not null default '';
alter table public.activities add column if not exists is_public boolean not null default true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'type'
  ) then
    execute '
      update public.activities
      set activity_type = coalesce(activity_type, "type"::text::public.activity_type)
      where activity_type is null and "type" is not null
    ';
  end if;
end $$;

update public.activities
set activity_type = 'profile_update'
where activity_type is null;

alter table public.activities alter column activity_type set not null;

create or replace view public.public_finance_summaries as
select
  p.id as user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  date_trunc('month', t.date)::date as month,
  coalesce(sum(t.amount) filter (where t.type = 'spending'), 0) as monthly_spending_total,
  coalesce(sum(t.amount) filter (where t.type = 'savings'), 0) as monthly_savings_total,
  coalesce(sum(t.amount) filter (where t.type in ('allowance', 'income')), 0) as monthly_income_total
from public.profiles p
left join public.transactions t on t.user_id = p.id
where p.is_public = true and p.share_finance_summary = true
group by p.id, p.username, p.display_name, p.avatar_url, date_trunc('month', t.date);

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.stock_watchlists enable row level security;
alter table public.activities enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.user_share_preferences enable row level security;

create policy "Profiles are visible when public or owned"
on public.profiles for select
using (is_public = true or id = auth.uid());

create policy "Users insert own profile"
on public.profiles for insert
with check (id = auth.uid());

create policy "Users update own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Follows are visible"
on public.follows for select
using (true);

create policy "Users follow from own account"
on public.follows for insert
with check (follower_id = auth.uid());

create policy "Users unfollow from own account"
on public.follows for delete
using (follower_id = auth.uid());

create policy "Users manage own categories"
on public.categories for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage own transactions"
on public.transactions for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Followers can view shared transactions" on public.transactions;
create policy "Followers can view shared transactions"
on public.transactions for select
using (
  user_id = auth.uid()
  or (
    exists (
      select 1 from public.profiles p
      where p.id = transactions.user_id and p.is_public = true
    )
    and exists (
      select 1 from public.follows f
      where f.following_id = transactions.user_id and f.follower_id = auth.uid()
    )
    and exists (
      select 1 from public.user_share_preferences usp
      where usp.user_id = transactions.user_id and usp.section_key::text = transactions.type::text
    )
  )
);

create policy "Users manage own budgets"
on public.budgets for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage own stock watchlist"
on public.stock_watchlists for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users manage own wishlist items" on public.wishlist_items;
create policy "Users manage own wishlist items"
on public.wishlist_items for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Followers can view shared wishlist items" on public.wishlist_items;
create policy "Followers can view shared wishlist items"
on public.wishlist_items for select
using (
  user_id = auth.uid()
  or (
    exists (
      select 1 from public.profiles p
      where p.id = wishlist_items.user_id and p.is_public = true
    )
    and exists (
      select 1 from public.follows f
      where f.following_id = wishlist_items.user_id and f.follower_id = auth.uid()
    )
    and exists (
      select 1 from public.user_share_preferences usp
      where usp.user_id = wishlist_items.user_id and usp.section_key = 'wishlist'
    )
  )
);

drop policy if exists "Users manage own share preferences" on public.user_share_preferences;
create policy "Users manage own share preferences"
on public.user_share_preferences for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Followers can view share preferences" on public.user_share_preferences;
create policy "Followers can view share preferences"
on public.user_share_preferences for select
using (
  user_id = auth.uid()
  or (
    exists (
      select 1 from public.profiles p
      where p.id = user_share_preferences.user_id and p.is_public = true
    )
    and exists (
      select 1 from public.follows f
      where f.following_id = user_share_preferences.user_id and f.follower_id = auth.uid()
    )
  )
);

create policy "Activities visible when public owner public or owned"
on public.activities for select
using (
  user_id = auth.uid()
  or (
    is_public = true
    and exists (
      select 1 from public.profiles p
      where p.id = activities.user_id and p.is_public = true
    )
  )
);

create policy "Users manage own activities"
on public.activities for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('category-icons', 'category-icons', true), ('transaction-images', 'transaction-images', true), ('wishlist-images', 'wishlist-images', true)
on conflict (id) do nothing;

create policy "Avatar images are public"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users upload own avatar folder"
on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users update own avatar folder"
on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own avatar folder"
on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Category icons are public"
on storage.objects for select
using (bucket_id = 'category-icons');

create policy "Users upload own category icon folder"
on storage.objects for insert
with check (bucket_id = 'category-icons' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users update own category icon folder"
on storage.objects for update
using (bucket_id = 'category-icons' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own category icon folder"
on storage.objects for delete
using (bucket_id = 'category-icons' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Transaction images are public"
on storage.objects for select
using (bucket_id = 'transaction-images');

create policy "Users upload own transaction image folder"
on storage.objects for insert
with check (bucket_id = 'transaction-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users update own transaction image folder"
on storage.objects for update
using (bucket_id = 'transaction-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own transaction image folder"
on storage.objects for delete
using (bucket_id = 'transaction-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Wishlist images are public" on storage.objects;
create policy "Wishlist images are public"
on storage.objects for select
using (bucket_id = 'wishlist-images');

drop policy if exists "Users upload own wishlist image folder" on storage.objects;
create policy "Users upload own wishlist image folder"
on storage.objects for insert
with check (bucket_id = 'wishlist-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own wishlist image folder" on storage.objects;
create policy "Users update own wishlist image folder"
on storage.objects for update
using (bucket_id = 'wishlist-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own wishlist image folder" on storage.objects;
create policy "Users delete own wishlist image folder"
on storage.objects for delete
using (bucket_id = 'wishlist-images' and (storage.foldername(name))[1] = auth.uid()::text);
