-- Outside-Canada family information is IMM 5645 (not IMM 5406).

update public.project_forms pf
set form_code = 'imm5645'
where pf.form_code = 'imm5406'
  and not exists (
    select 1
    from public.project_forms other
    where other.project_id = pf.project_id
      and other.form_code = 'imm5645'
      and other.person_id is not distinct from pf.person_id
      and other.id <> pf.id
  );

delete from public.project_forms
where form_code = 'imm5406';
