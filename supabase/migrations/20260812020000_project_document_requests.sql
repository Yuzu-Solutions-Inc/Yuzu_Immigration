-- Document requests + encrypted file uploads for client share links

create type public.document_request_status as enum (
  'requested',
  'uploaded',
  'accepted',
  'rejected'
);

create table public.project_document_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.immigration_projects(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  doc_key text not null,
  custom_label text,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  status public.document_request_status not null default 'requested',
  consultant_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_document_requests_doc_key_check
    check (doc_key in ('passport', 'photo', 'custom')),
  constraint project_document_requests_custom_label_check
    check (
      (doc_key = 'custom' and custom_label is not null and char_length(trim(custom_label)) >= 1)
      or (doc_key <> 'custom' and custom_label is null)
    )
);

comment on table public.project_document_requests is
  'Per-person document checklist on a project. Defaults (passport, photo) seeded by program; consultants may add custom requests.';

create unique index project_document_requests_default_unique
  on public.project_document_requests (project_id, person_id, doc_key)
  where doc_key in ('passport', 'photo');

create index project_document_requests_project_idx
  on public.project_document_requests (project_id);

create index project_document_requests_person_idx
  on public.project_document_requests (person_id);

create index project_document_requests_org_idx
  on public.project_document_requests (organization_id);

create table public.project_document_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.immigration_projects(id) on delete cascade,
  request_id uuid not null references public.project_document_requests(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  content_type text not null,
  byte_size integer not null,
  encryption_alg text not null default 'aes-256-gcm',
  uploaded_via text not null default 'share_link',
  created_at timestamptz not null default now(),
  constraint project_document_files_byte_size_check
    check (byte_size > 0 and byte_size <= 10485760),
  constraint project_document_files_content_type_check
    check (
      content_type in (
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
      )
    ),
  constraint project_document_files_uploaded_via_check
    check (uploaded_via in ('share_link', 'staff')),
  constraint project_document_files_encryption_alg_check
    check (encryption_alg = 'aes-256-gcm')
);

comment on table public.project_document_files is
  'Encrypted client document blobs in private Storage. Plaintext never stored; AES-256-GCM ciphertext only.';

create unique index project_document_files_request_unique
  on public.project_document_files (request_id);

create index project_document_files_project_idx
  on public.project_document_files (project_id);

create index project_document_files_org_idx
  on public.project_document_files (organization_id);

alter table public.project_document_requests enable row level security;
alter table public.project_document_files enable row level security;

create policy project_document_requests_select_member
  on public.project_document_requests for select to authenticated
  using (is_org_member(organization_id));

create policy project_document_requests_insert_member
  on public.project_document_requests for insert to authenticated
  with check (
    is_org_member(organization_id)
    and exists (
      select 1 from public.immigration_projects p
      where p.id = project_id and p.organization_id = organization_id
    )
    and exists (
      select 1 from public.people pe
      where pe.id = person_id and pe.organization_id = organization_id
    )
  );

create policy project_document_requests_update_member
  on public.project_document_requests for update to authenticated
  using (is_org_member(organization_id))
  with check (is_org_member(organization_id));

create policy project_document_requests_delete_member
  on public.project_document_requests for delete to authenticated
  using (is_org_member(organization_id) and doc_key = 'custom');

create policy project_document_files_select_member
  on public.project_document_files for select to authenticated
  using (is_org_member(organization_id));

create policy project_document_files_insert_member
  on public.project_document_files for insert to authenticated
  with check (is_org_member(organization_id));

create policy project_document_files_update_member
  on public.project_document_files for update to authenticated
  using (is_org_member(organization_id))
  with check (is_org_member(organization_id));

create policy project_document_files_delete_member
  on public.project_document_files for delete to authenticated
  using (is_org_member(organization_id));

grant select, insert, update, delete on public.project_document_requests to authenticated;
grant select, insert, update, delete on public.project_document_requests to service_role;
grant select, insert, update, delete on public.project_document_files to authenticated;
grant select, insert, update, delete on public.project_document_files to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,
  12582912,
  array['application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy client_documents_select_member
  on storage.objects for select to authenticated
  using (
    bucket_id = 'client-documents'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy client_documents_insert_member
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-documents'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy client_documents_update_member
  on storage.objects for update to authenticated
  using (
    bucket_id = 'client-documents'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'client-documents'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy client_documents_delete_member
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'client-documents'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );
