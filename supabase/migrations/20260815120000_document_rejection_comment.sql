alter table public.project_document_requests
  add column if not exists rejection_comment text;

comment on column public.project_document_requests.rejection_comment is
  'Consultant feedback when a document upload is rejected (encrypted at app layer).';
