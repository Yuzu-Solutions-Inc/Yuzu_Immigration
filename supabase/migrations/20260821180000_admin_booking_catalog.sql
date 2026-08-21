-- Restrict catalog writes (services, forms, reminder templates, contracts) to
-- organization admins. Case managers keep read access and still manage their
-- own e-sign mark, which is applied from the booking host at issue time.

drop policy if exists booking_services_insert on public.booking_services;
drop policy if exists booking_services_update on public.booking_services;
drop policy if exists booking_services_delete on public.booking_services;

create policy booking_services_insert
  on public.booking_services for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy booking_services_update
  on public.booking_services for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy booking_services_delete
  on public.booking_services for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists booking_forms_insert on public.booking_forms;
drop policy if exists booking_forms_update on public.booking_forms;
drop policy if exists booking_forms_delete on public.booking_forms;

create policy booking_forms_insert
  on public.booking_forms for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy booking_forms_update
  on public.booking_forms for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy booking_forms_delete
  on public.booking_forms for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists booking_service_form_fields_insert
  on public.booking_service_form_fields;
drop policy if exists booking_service_form_fields_update
  on public.booking_service_form_fields;
drop policy if exists booking_service_form_fields_delete
  on public.booking_service_form_fields;

create policy booking_service_form_fields_insert
  on public.booking_service_form_fields for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy booking_service_form_fields_update
  on public.booking_service_form_fields for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy booking_service_form_fields_delete
  on public.booking_service_form_fields for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists booking_service_email_automations_insert
  on public.booking_service_email_automations;
drop policy if exists booking_service_email_automations_update
  on public.booking_service_email_automations;
drop policy if exists booking_service_email_automations_delete
  on public.booking_service_email_automations;

create policy booking_service_email_automations_insert
  on public.booking_service_email_automations for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy booking_service_email_automations_update
  on public.booking_service_email_automations for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy booking_service_email_automations_delete
  on public.booking_service_email_automations for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists booking_email_automation_services_insert
  on public.booking_email_automation_services;
drop policy if exists booking_email_automation_services_update
  on public.booking_email_automation_services;
drop policy if exists booking_email_automation_services_delete
  on public.booking_email_automation_services;

create policy booking_email_automation_services_insert
  on public.booking_email_automation_services for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy booking_email_automation_services_update
  on public.booking_email_automation_services for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy booking_email_automation_services_delete
  on public.booking_email_automation_services for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists contract_templates_insert on public.contract_templates;
drop policy if exists contract_templates_update on public.contract_templates;
drop policy if exists contract_templates_delete on public.contract_templates;

create policy contract_templates_insert
  on public.contract_templates for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy contract_templates_update
  on public.contract_templates for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy contract_templates_delete
  on public.contract_templates for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists contract_template_services_insert
  on public.contract_template_services;
drop policy if exists contract_template_services_update
  on public.contract_template_services;
drop policy if exists contract_template_services_delete
  on public.contract_template_services;

create policy contract_template_services_insert
  on public.contract_template_services for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy contract_template_services_update
  on public.contract_template_services for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy contract_template_services_delete
  on public.contract_template_services for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists staff_contract_signatures_insert
  on public.staff_contract_signatures;
drop policy if exists staff_contract_signatures_update
  on public.staff_contract_signatures;
drop policy if exists staff_contract_signatures_delete
  on public.staff_contract_signatures;

create policy staff_contract_signatures_insert
  on public.staff_contract_signatures for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

create policy staff_contract_signatures_update
  on public.staff_contract_signatures for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

create policy staff_contract_signatures_delete
  on public.staff_contract_signatures for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );
