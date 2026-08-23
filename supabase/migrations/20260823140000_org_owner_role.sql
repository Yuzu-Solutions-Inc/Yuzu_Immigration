-- Owner is a first-class org role. Same privileges as admin in is_org_admin(),
-- plus exclusive ownership transfer and organization deletion (next migration).
-- Postgres cannot use a newly added enum label in the same transaction.

alter type public.org_member_role add value if not exists 'owner';
