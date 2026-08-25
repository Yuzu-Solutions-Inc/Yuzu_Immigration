"use client";

import { ServiceBookingFormButton } from "@/components/booking/service-booking-form";
import { ServiceContractsButton } from "@/components/booking/service-contracts";
import type {
  BookingFormFieldRow,
  BookingFormRow,
  BookingServiceRow,
} from "@/lib/booking/types";
import type { ContractTemplateRow, StaffContractSignature } from "@/lib/contracts/types";
import type { AppLocale } from "@/lib/i18n/locales";

export function ProjectsCatalogButtons({
  locale,
  orgDefaultLocale,
  canManage,
  services,
  forms,
  formFields,
  templates,
  signature,
  openContracts = false,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  canManage: boolean;
  services: BookingServiceRow[];
  forms: BookingFormRow[];
  formFields: BookingFormFieldRow[];
  templates: ContractTemplateRow[];
  signature: StaffContractSignature;
  openContracts?: boolean;
}) {
  return (
    <>
      <ServiceContractsButton
        locale={locale}
        orgDefaultLocale={orgDefaultLocale}
        services={services}
        forms={forms}
        formFields={formFields}
        templates={templates}
        signature={signature}
        canManage={canManage}
        initialOpen={openContracts}
      />
      <ServiceBookingFormButton
        locale={locale}
        services={services}
        forms={forms}
        formFields={formFields}
        canManage={canManage}
      />
    </>
  );
}
