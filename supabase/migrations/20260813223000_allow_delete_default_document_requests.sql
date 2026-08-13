-- Staff may remove any document request, including passport/photo defaults.

drop policy if exists project_document_requests_delete_access on public.project_document_requests;

create policy project_document_requests_delete_access
  on public.project_document_requests for delete to authenticated
  using (public.can_access_project(project_id));
