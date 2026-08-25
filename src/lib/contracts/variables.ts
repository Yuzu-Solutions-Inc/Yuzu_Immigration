import { extraAutomationVariables } from "@/lib/booking/form-fields";
import { automationVariablesFor } from "@/lib/email/automation-template";
import {
  CONTRACT_BUILTIN_VARIABLES,
  type ContractBuiltinVariable,
} from "@/lib/contracts/types";

export type ContractVariableOption = {
  key: string;
  kind: "builtin" | "form" | "signature";
};

export function contractVariableCatalog(formFieldKeys: string[]): ContractVariableOption[] {
  const builtins: ContractVariableOption[] = CONTRACT_BUILTIN_VARIABLES.map(
    (key) => ({ key, kind: "builtin" as const }),
  );
  const signatures: ContractVariableOption[] = [
    { key: "signature_client", kind: "signature" },
    { key: "signature_consultant", kind: "signature" },
  ];
  const seen = new Set<string>([
    ...CONTRACT_BUILTIN_VARIABLES,
    "signature_client",
    "signature_consultant",
  ]);
  const form: ContractVariableOption[] = [];
  for (const key of formFieldKeys) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    form.push({ key, kind: "form" });
  }
  return [...builtins, ...form, ...signatures];
}

export function contractMergeVariables(input: {
  locale: string;
  timeZone: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerAddress?: string;
  serviceName: string;
  consultantName: string;
  consultantEmail: string;
  organizationName: string;
  startsAt: Date;
  durationMinutes: number;
  meetJoinUrl?: string | null;
  formAnswers?: Record<string, string> | null;
  now?: Date;
}): Record<string, string> {
  const extra = extraAutomationVariables(input.formAnswers);
  const vars = automationVariablesFor({
    locale: input.locale,
    timeZone: input.timeZone,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    serviceName: input.serviceName,
    consultantName: input.consultantName,
    consultantEmail: input.consultantEmail,
    organizationName: input.organizationName,
    startsAt: input.startsAt,
    durationMinutes: input.durationMinutes,
    meetJoinUrl: input.meetJoinUrl,
    extra,
  });
  const signed = input.now ?? new Date();
  return {
    ...vars,
    customer_phone: input.customerPhone ?? "",
    customer_address: input.customerAddress ?? "",
    signed_date: vars.date,
    signed_at: signed.toISOString(),
  };
}

export function projectContractMergeVariables(input: {
  locale: string;
  timeZone: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerAddress?: string;
  projectTitle: string;
  programName: string;
  consultantName: string;
  consultantEmail: string;
  organizationName: string;
  formAnswers?: Record<string, string> | null;
  now?: Date;
}): Record<string, string> {
  const signed = input.now ?? new Date();
  const date = signed.toLocaleDateString(input.locale, {
    timeZone: input.timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const answers = input.formAnswers ?? {};
  return {
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    customer_phone: input.customerPhone ?? "",
    customer_address: input.customerAddress ?? "",
    service_name: input.projectTitle,
    project_title: input.projectTitle,
    program_name: input.programName,
    consultant_name: input.consultantName,
    consultant_email: input.consultantEmail,
    organization_name: input.organizationName,
    date,
    time: "",
    datetime: date,
    timezone: input.timeZone,
    duration: "",
    meet_link: "",
    signed_date: date,
    signed_at: signed.toISOString(),
    ...answers,
  };
}

export const builtinVariableSet = new Set<string>(CONTRACT_BUILTIN_VARIABLES);

export function isBuiltinContractVariable(
  key: string,
): key is ContractBuiltinVariable {
  return builtinVariableSet.has(key);
}
