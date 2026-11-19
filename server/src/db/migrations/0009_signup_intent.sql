alter table public.app_user add column if not exists signup_intent varchar(20) not null default 'provider';
alter table public.app_user add constraint app_user_signup_intent_check check (signup_intent in ('provider','client','both'));
grant update (signup_intent) on public.app_user to vendorproof_app;
