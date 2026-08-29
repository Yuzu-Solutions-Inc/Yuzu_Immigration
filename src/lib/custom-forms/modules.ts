import { QUESTIONNAIRE_LOVS, type FieldOption } from "@/lib/ircc/fields";
import {
  cloneSchemaWithNewIds,
  newBuilderId,
  type CustomField,
  type CustomFieldOption,
  type CustomFormSchema,
  type CustomSection,
  type LocalizedText,
} from "@/lib/custom-forms/schema";
import type { ShowWhen, ShowWhenRule } from "@/lib/forms/visibility";

export type CustomFormModuleId =
  | "purpose"
  | "identity"
  | "contact"
  | "passport"
  | "status"
  | "family"
  | "employment"
  | "education"
  | "language"
  | "travel"
  | "previousApps"
  | "admissibility"
  | "jobOffer"
  | "study"
  | "sponsor";

export type CustomFormModule = {
  id: CustomFormModuleId;
  title: LocalizedText;
  description: LocalizedText;
  section: CustomSection;
};

function L(en: string, fr: string, es: string): LocalizedText {
  return { en, fr, es };
}

function opt(value: string, en: string, fr: string, es: string): CustomFieldOption {
  return { value, label: L(en, fr, es) };
}

function fromIrccOptions(opts: readonly FieldOption[]): CustomFieldOption[] {
  return opts.map((item) => ({
    value: item.value,
    label: {
      en: item.label || item.value,
      fr: item.labelFr || item.label || item.value,
    },
  }));
}

const COUNTRY_OPTIONS = fromIrccOptions(QUESTIONNAIRE_LOVS.country);

const SEX_OPTIONS = [
  opt("female", "Female", "Femme", "Mujer"),
  opt("male", "Male", "Homme", "Hombre"),
  opt("another", "Another", "Autre", "Otro"),
  opt("unspecified", "Prefer not to say", "Préfère ne pas dire", "Prefiere no decir"),
];

const MARITAL_OPTIONS = [
  opt("never", "Never married", "Célibataire", "Soltero/a"),
  opt("married", "Married", "Marié(e)", "Casado/a"),
  opt("common_law", "Common-law", "Conjoint de fait", "Unión de hecho"),
  opt("separated", "Separated", "Séparé(e)", "Separado/a"),
  opt("divorced", "Divorced", "Divorcé(e)", "Divorciado/a"),
  opt("widowed", "Widowed", "Veuf/veuve", "Viudo/a"),
];

const STATUS_OPTIONS = [
  opt("citizen", "Canadian citizen", "Citoyen canadien", "Ciudadano canadiense"),
  opt("pr", "Permanent resident", "Résident permanent", "Residente permanente"),
  opt("visitor", "Visitor", "Visiteur", "Visitante"),
  opt("worker", "Worker", "Travailleur", "Trabajador"),
  opt("student", "Student", "Étudiant", "Estudiante"),
  opt("refugee", "Protected person / refugee", "Personne protégée / réfugié", "Persona protegida / refugiado"),
  opt("other", "Other", "Autre", "Otro"),
];

function f(
  key: string,
  type: CustomField["type"],
  label: LocalizedText,
  extra?: Partial<CustomField>,
): CustomField {
  return {
    id: key,
    key,
    type,
    label,
    ...extra,
  };
}

const PURPOSE: CustomSection = {
  id: "purpose",
  key: "purpose",
  title: L("Purpose of this file", "Objet du dossier", "Objeto del expediente"),
  description: L(
    "Why this file exists and any deadline the client should know.",
    "Pourquoi ce dossier existe et tout délai à connaître.",
    "Por qué existe este expediente y cualquier plazo que el cliente deba conocer.",
  ),
  fields: [
    f(
      "purpose_summary",
      "textarea",
      L("What is this application or file for?", "Quel est l’objet de cette demande ?", "¿Para qué es esta solicitud?"),
      { required: true },
    ),
    f(
      "purpose_deadline",
      "date",
      L("Target submit date", "Date de dépôt visée", "Fecha objetivo de presentación"),
    ),
    f(
      "purpose_notes",
      "textarea",
      L("Anything else we should know?", "Autre information utile", "¿Algo más que debamos saber?"),
    ),
  ],
};

const IDENTITY: CustomSection = {
  id: "identity",
  key: "identity",
  title: L("Identity", "Identité", "Identidad"),
  fields: [
    f("identity_familyName", "text", L("Family name", "Nom de famille", "Apellido"), { required: true }),
    f("identity_givenName", "text", L("Given name(s)", "Prénom(s)", "Nombre(s)"), { required: true }),
    f(
      "identity_hasAlias",
      "yesno",
      L("Have you used another name?", "Avez-vous utilisé un autre nom ?", "¿Ha usado otro nombre?"),
      { required: true },
    ),
    f(
      "identity_aliasFamilyName",
      "text",
      L("Other family name", "Autre nom de famille", "Otro apellido"),
      { showWhen: { key: "identity_hasAlias", equals: "Y" } },
    ),
    f(
      "identity_aliasGivenName",
      "text",
      L("Other given name(s)", "Autre(s) prénom(s)", "Otro(s) nombre(s)"),
      { showWhen: { key: "identity_hasAlias", equals: "Y" } },
    ),
    f("identity_sex", "select", L("Sex", "Sexe", "Sexo"), {
      required: true,
      options: SEX_OPTIONS,
    }),
    f("identity_dob", "date", L("Date of birth", "Date de naissance", "Fecha de nacimiento"), {
      required: true,
    }),
    f(
      "identity_birthCity",
      "text",
      L("City of birth", "Ville de naissance", "Ciudad de nacimiento"),
    ),
    f(
      "identity_birthCountry",
      "select",
      L("Country of birth", "Pays de naissance", "País de nacimiento"),
      { required: true, options: COUNTRY_OPTIONS },
    ),
    f(
      "identity_citizenship",
      "select",
      L("Country of citizenship", "Pays de citoyenneté", "País de ciudadanía"),
      { required: true, options: COUNTRY_OPTIONS },
    ),
    f("identity_uci", "text", L("UCI (if any)", "IUC (le cas échéant)", "UCI (si aplica)")),
  ],
};

const CONTACT: CustomSection = {
  id: "contact",
  key: "contact",
  title: L("Contact", "Coordonnées", "Contacto"),
  fields: [
    f("contact_email", "email", L("Email", "Courriel", "Correo electrónico"), { required: true }),
    f(
      "contact_phone",
      "phone_contact",
      L("Phone", "Téléphone", "Teléfono"),
      { required: true },
    ),
    f(
      "contact_mailingAddress",
      "address",
      L("Mailing address", "Adresse postale", "Dirección postal"),
      { required: true },
    ),
    f(
      "contact_sameAsMailing",
      "yesno",
      L("Residential address is the same", "L’adresse résidentielle est la même", "La dirección residencial es la misma"),
      { required: true },
    ),
    f(
      "contact_residentialAddress",
      "address",
      L("Residential address", "Adresse résidentielle", "Dirección residencial"),
      { showWhen: { key: "contact_sameAsMailing", equals: "N" } },
    ),
  ],
};

const PASSPORT: CustomSection = {
  id: "passport",
  key: "passport",
  title: L("Passport", "Passeport", "Pasaporte"),
  fields: [
    f("passport_document", "passport", L("Passport", "Passeport", "Pasaporte"), { required: true }),
    f("passport_issueDate", "date", L("Date of issue", "Date de délivrance", "Fecha de expedición")),
    f("passport_expiryDate", "date", L("Expiry date", "Date d’expiration", "Fecha de vencimiento"), {
      required: true,
    }),
    f(
      "passport_hasOtherDoc",
      "yesno",
      L("Do you have another travel document?", "Avez-vous un autre document de voyage ?", "¿Tiene otro documento de viaje?"),
    ),
    f(
      "passport_otherDocType",
      "text",
      L("Other document type", "Type d’autre document", "Otro tipo de documento"),
      { showWhen: { key: "passport_hasOtherDoc", equals: "Y" } },
    ),
    f(
      "passport_otherDocNumber",
      "text",
      L("Other document number", "Numéro de l’autre document", "Número del otro documento"),
      { showWhen: { key: "passport_hasOtherDoc", equals: "Y" } },
    ),
  ],
};

const STATUS: CustomSection = {
  id: "status",
  key: "status",
  title: L("Current status", "Statut actuel", "Estatus actual"),
  fields: [
    f(
      "status_inCanada",
      "yesno",
      L("Are you currently in Canada?", "Êtes-vous actuellement au Canada ?", "¿Está actualmente en Canadá?"),
      { required: true },
    ),
    f(
      "status_type",
      "select",
      L("Current status in Canada", "Statut actuel au Canada", "Estatus actual en Canadá"),
      {
        required: true,
        options: STATUS_OPTIONS,
        showWhen: { key: "status_inCanada", equals: "Y" },
      },
    ),
    f(
      "status_expiry",
      "date",
      L("Status expiry date", "Date d’expiration du statut", "Fecha de vencimiento del estatus"),
      { showWhen: { key: "status_inCanada", equals: "Y" } },
    ),
    f(
      "status_permitNumber",
      "text",
      L("Permit or document number", "Numéro de permis ou de document", "Número de permiso o documento"),
      { showWhen: { key: "status_inCanada", equals: "Y" } },
    ),
  ],
};

const FAMILY: CustomSection = {
  id: "family",
  key: "family",
  title: L("Family", "Famille", "Familia"),
  fields: [
    f("family_maritalStatus", "select", L("Marital status", "État matrimonial", "Estado civil"), {
      required: true,
      options: MARITAL_OPTIONS,
    }),
    f(
      "family_spouseFamilyName",
      "text",
      L("Spouse / partner family name", "Nom de famille du conjoint", "Apellido del cónyuge / pareja"),
      { showWhen: { key: "family_maritalStatus", oneOf: ["married", "common_law"] } },
    ),
    f(
      "family_spouseGivenName",
      "text",
      L("Spouse / partner given name(s)", "Prénom(s) du conjoint", "Nombre(s) del cónyuge / pareja"),
      { showWhen: { key: "family_maritalStatus", oneOf: ["married", "common_law"] } },
    ),
    f(
      "family_spouseDob",
      "date",
      L("Spouse / partner date of birth", "Date de naissance du conjoint", "Fecha de nacimiento del cónyuge / pareja"),
      { showWhen: { key: "family_maritalStatus", oneOf: ["married", "common_law"] } },
    ),
    f(
      "family_hasChildren",
      "yesno",
      L("Do you have children?", "Avez-vous des enfants ?", "¿Tiene hijos?"),
      { required: true },
    ),
    f("family_children", "repeatable", L("Children", "Enfants", "Hijos"), {
      showWhen: { key: "family_hasChildren", equals: "Y" },
      maxRows: 12,
      columns: [
        f("familyName", "text", L("Family name", "Nom de famille", "Apellido"), { required: true }),
        f("givenName", "text", L("Given name", "Prénom", "Nombre"), { required: true }),
        f("dob", "date", L("Date of birth", "Date de naissance", "Fecha de nacimiento")),
        f(
          "relationship",
          "select",
          L("Relationship", "Lien", "Parentesco"),
          {
            options: [
              opt("son", "Son", "Fils", "Hijo"),
              opt("daughter", "Daughter", "Fille", "Hija"),
              opt("step", "Stepchild", "Beau-fils / belle-fille", "Hijastro/a"),
              opt("other", "Other", "Autre", "Otro"),
            ],
          },
        ),
      ],
    }),
  ],
};

const EMPLOYMENT: CustomSection = {
  id: "employment",
  key: "employment",
  title: L("Employment", "Emploi", "Empleo"),
  fields: [
    f(
      "employment_hasWorked",
      "yesno",
      L("Have you worked in the last 10 years?", "Avez-vous travaillé au cours des 10 dernières années ?", "¿Ha trabajado en los últimos 10 años?"),
      { required: true },
    ),
    f("employment_jobs", "repeatable", L("Jobs", "Emplois", "Empleos"), {
      showWhen: { key: "employment_hasWorked", equals: "Y" },
      maxRows: 15,
      columns: [
        f("employer", "text", L("Employer", "Employeur", "Empleador"), { required: true }),
        f("jobTitle", "text", L("Job title", "Titre du poste", "Puesto"), { required: true }),
        f("noc", "text", L("NOC (if known)", "CNP (si connu)", "NOC (si se conoce)")),
        f("from", "month", L("From", "De", "Desde"), { required: true }),
        f("to", "month", L("To (blank if current)", "À (vide si actuel)", "Hasta (vacío si actual)")),
        f("duties", "textarea", L("Main duties", "Tâches principales", "Tareas principales")),
      ],
    }),
  ],
};

const EDUCATION: CustomSection = {
  id: "education",
  key: "education",
  title: L("Education", "Études", "Educación"),
  fields: [
    f(
      "education_hasPostSecondary",
      "yesno",
      L("Have you completed post-secondary education?", "Avez-vous fait des études postsecondaires ?", "¿Ha completado estudios postsecundarios?"),
      { required: true },
    ),
    f("education_rows", "repeatable", L("Schools and credentials", "Établissements et diplômes", "Escuelas y títulos"), {
      showWhen: { key: "education_hasPostSecondary", equals: "Y" },
      maxRows: 12,
      columns: [
        f("school", "text", L("School", "Établissement", "Escuela"), { required: true }),
        f("credential", "text", L("Credential", "Diplôme", "Título"), { required: true }),
        f("field", "text", L("Field of study", "Domaine d’études", "Campo de estudio")),
        f("from", "month", L("From", "De", "Desde")),
        f("to", "month", L("To", "À", "Hasta")),
      ],
    }),
  ],
};

const LANGUAGE: CustomSection = {
  id: "language",
  key: "language",
  title: L("Language", "Langue", "Idioma"),
  fields: [
    f(
      "language_motherTongue",
      "text",
      L("Mother tongue", "Langue maternelle", "Lengua materna"),
      { required: true },
    ),
    f(
      "language_tookTest",
      "yesno",
      L("Have you taken a language test?", "Avez-vous passé un test de langue ?", "¿Ha hecho un examen de idioma?"),
      { required: true },
    ),
    f("language_tests", "repeatable", L("Language tests", "Tests de langue", "Exámenes de idioma"), {
      showWhen: { key: "language_tookTest", equals: "Y" },
      maxRows: 6,
      columns: [
        f("test", "text", L("Test (IELTS, TEF…)", "Test", "Examen"), { required: true }),
        f("date", "date", L("Date", "Date", "Fecha")),
        f("listening", "text", L("Listening", "Écoute", "Comprensión oral")),
        f("reading", "text", L("Reading", "Lecture", "Lectura")),
        f("writing", "text", L("Writing", "Expression écrite", "Escritura")),
        f("speaking", "text", L("Speaking", "Expression orale", "Expresión oral")),
      ],
    }),
  ],
};

const TRAVEL: CustomSection = {
  id: "travel",
  key: "travel",
  title: L("Travel history", "Voyages", "Historial de viajes"),
  fields: [
    f(
      "travel_hasTravelled",
      "yesno",
      L("Have you travelled outside your country of residence in the last 10 years?", "Avez-vous voyagé hors de votre pays de résidence au cours des 10 dernières années ?", "¿Ha viajado fuera de su país de residencia en los últimos 10 años?"),
      { required: true },
    ),
    f("travel_trips", "repeatable", L("Trips", "Voyages", "Viajes"), {
      showWhen: { key: "travel_hasTravelled", equals: "Y" },
      maxRows: 20,
      columns: [
        f("country", "select", L("Country", "Pays", "País"), {
          required: true,
          options: COUNTRY_OPTIONS,
        }),
        f("from", "date", L("From", "Du", "Desde"), { required: true }),
        f("to", "date", L("To", "Au", "Hasta")),
        f("purpose", "text", L("Purpose", "Objet", "Motivo")),
      ],
    }),
  ],
};

const PREVIOUS: CustomSection = {
  id: "previousApps",
  key: "previousApps",
  title: L("Previous applications", "Demandes antérieures", "Solicitudes anteriores"),
  fields: [
    f(
      "previous_applied",
      "yesno",
      L("Have you previously applied to IRCC or a province?", "Avez-vous déjà présenté une demande à IRCC ou à une province ?", "¿Ha solicitado antes a IRCC o a una provincia?"),
      { required: true },
    ),
    f(
      "previous_details",
      "textarea",
      L("What did you apply for, and when?", "De quoi s’agissait-il, et quand ?", "¿Qué solicitó y cuándo?"),
      { showWhen: { key: "previous_applied", equals: "Y" } },
    ),
    f(
      "previous_refused",
      "yesno",
      L("Have you been refused?", "Avez-vous déjà été refusé(e) ?", "¿Le han rechazado alguna solicitud?"),
      { showWhen: { key: "previous_applied", equals: "Y" } },
    ),
    f(
      "previous_refusalDetails",
      "textarea",
      L("Refusal details", "Détails du refus", "Detalles del rechazo"),
      { showWhen: { key: "previous_refused", equals: "Y" } },
    ),
  ],
};

const ADMISSIBILITY: CustomSection = {
  id: "admissibility",
  key: "admissibility",
  title: L("Admissibility", "Admissibilité", "Admisibilidad"),
  fields: [
    f(
      "admissibility_medical",
      "yesno",
      L("Do you have a medical condition that could affect admissibility?", "Avez-vous un problème de santé pouvant toucher l’admissibilité ?", "¿Tiene una condición médica que pueda afectar la admisibilidad?"),
      { required: true },
    ),
    f(
      "admissibility_medicalDetails",
      "textarea",
      L("Medical details", "Détails médicaux", "Detalles médicos"),
      { showWhen: { key: "admissibility_medical", equals: "Y" } },
    ),
    f(
      "admissibility_criminal",
      "yesno",
      L("Have you been charged with or convicted of a crime?", "Avez-vous été accusé(e) ou reconnu(e) coupable d’un crime ?", "¿Ha sido acusado o condenado por un delito?"),
      { required: true },
    ),
    f(
      "admissibility_criminalDetails",
      "textarea",
      L("Details", "Détails", "Detalles"),
      { showWhen: { key: "admissibility_criminal", equals: "Y" } },
    ),
    f(
      "admissibility_military",
      "yesno",
      L("Have you served in the military or a similar group?", "Avez-vous servi dans l’armée ou un groupe similaire ?", "¿Ha servido en el ejército o un grupo similar?"),
      { required: true },
    ),
    f(
      "admissibility_militaryDetails",
      "textarea",
      L("Service details", "Détails du service", "Detalles del servicio"),
      { showWhen: { key: "admissibility_military", equals: "Y" } },
    ),
  ],
};

const JOB_OFFER: CustomSection = {
  id: "jobOffer",
  key: "jobOffer",
  title: L("Job offer", "Offre d’emploi", "Oferta de empleo"),
  fields: [
    f("job_employerName", "text", L("Employer name", "Nom de l’employeur", "Nombre del empleador"), {
      required: true,
    }),
    f("job_employerAddress", "address", L("Employer address", "Adresse de l’employeur", "Dirección del empleador")),
    f("job_title", "text", L("Job title", "Titre du poste", "Puesto"), { required: true }),
    f("job_noc", "text", L("NOC code", "Code CNP", "Código NOC")),
    f("job_wage", "text", L("Wage", "Salaire", "Salario")),
    f("job_location", "text", L("Work location", "Lieu de travail", "Lugar de trabajo")),
    f(
      "job_lmiaBased",
      "yesno",
      L("Is this LMIA-based?", "S’agit-il d’une EIMT ?", "¿Se basa en una EIMT/LMIA?"),
      { required: true },
    ),
    f(
      "job_lmiaNumber",
      "text",
      L("LMIA number", "Numéro d’EIMT", "Número de EIMT"),
      { showWhen: { key: "job_lmiaBased", equals: "Y" } },
    ),
  ],
};

const STUDY: CustomSection = {
  id: "study",
  key: "study",
  title: L("Study details", "Études prévues", "Detalles de estudio"),
  fields: [
    f("study_school", "text", L("School name", "Nom de l’établissement", "Nombre de la escuela"), {
      required: true,
    }),
    f("study_program", "text", L("Program", "Programme", "Programa"), { required: true }),
    f("study_start", "date", L("Start date", "Date de début", "Fecha de inicio")),
    f("study_end", "date", L("Expected end date", "Date de fin prévue", "Fecha de fin prevista")),
    f("study_funds", "textarea", L("How will you pay for studies and living costs?", "Comment financerez-vous vos études et vos frais de subsistance ?", "¿Cómo pagará los estudios y el costo de vida?")),
  ],
};

const SPONSOR: CustomSection = {
  id: "sponsor",
  key: "sponsor",
  title: L("Sponsor / funds", "Parrain / fonds", "Patrocinador / fondos"),
  fields: [
    f(
      "sponsor_hasSponsor",
      "yesno",
      L("Is someone sponsoring or financially supporting this application?", "Quelqu’un parraine-t-il ou soutient-il financièrement cette demande ?", "¿Alguien patrocina o apoya financieramente esta solicitud?"),
      { required: true },
    ),
    f(
      "sponsor_name",
      "text",
      L("Sponsor name", "Nom du parrain", "Nombre del patrocinador"),
      { showWhen: { key: "sponsor_hasSponsor", equals: "Y" }, required: true },
    ),
    f(
      "sponsor_relationship",
      "text",
      L("Relationship to the applicant", "Lien avec le demandeur", "Relación con el solicitante"),
      { showWhen: { key: "sponsor_hasSponsor", equals: "Y" } },
    ),
    f(
      "sponsor_funds",
      "textarea",
      L("Proof of funds or support (describe)", "Preuve de fonds ou de soutien (décrire)", "Prueba de fondos o apoyo (describa)"),
      { showWhen: { key: "sponsor_hasSponsor", equals: "Y" } },
    ),
  ],
};

export const CUSTOM_FORM_MODULES: CustomFormModule[] = [
  {
    id: "purpose",
    title: PURPOSE.title,
    description: L(
      "Why this file exists, deadline, and notes.",
      "Objet du dossier, échéance et notes.",
      "Objeto del expediente, plazo y notas.",
    ),
    section: PURPOSE,
  },
  {
    id: "identity",
    title: IDENTITY.title,
    description: L(
      "Names, date of birth, citizenship, UCI.",
      "Noms, date de naissance, citoyenneté, IUC.",
      "Nombres, fecha de nacimiento, ciudadanía, UCI.",
    ),
    section: IDENTITY,
  },
  {
    id: "contact",
    title: CONTACT.title,
    description: L(
      "Email, phone, and addresses.",
      "Courriel, téléphone et adresses.",
      "Correo, teléfono y direcciones.",
    ),
    section: CONTACT,
  },
  {
    id: "passport",
    title: PASSPORT.title,
    description: L(
      "Passport and other travel documents.",
      "Passeport et autres documents de voyage.",
      "Pasaporte y otros documentos de viaje.",
    ),
    section: PASSPORT,
  },
  {
    id: "status",
    title: STATUS.title,
    description: L(
      "Whether the client is in Canada and on what status.",
      "Présence au Canada et statut.",
      "Si está en Canadá y con qué estatus.",
    ),
    section: STATUS,
  },
  {
    id: "family",
    title: FAMILY.title,
    description: L(
      "Marital status, spouse, and children.",
      "État matrimonial, conjoint et enfants.",
      "Estado civil, cónyuge e hijos.",
    ),
    section: FAMILY,
  },
  {
    id: "employment",
    title: EMPLOYMENT.title,
    description: L(
      "Work history for the last 10 years.",
      "Historique d’emploi des 10 dernières années.",
      "Historial laboral de los últimos 10 años.",
    ),
    section: EMPLOYMENT,
  },
  {
    id: "education",
    title: EDUCATION.title,
    description: L(
      "Schools and credentials.",
      "Établissements et diplômes.",
      "Escuelas y títulos.",
    ),
    section: EDUCATION,
  },
  {
    id: "language",
    title: LANGUAGE.title,
    description: L(
      "Mother tongue and language tests.",
      "Langue maternelle et tests.",
      "Lengua materna y exámenes.",
    ),
    section: LANGUAGE,
  },
  {
    id: "travel",
    title: TRAVEL.title,
    description: L(
      "Trips outside the country of residence.",
      "Voyages hors du pays de résidence.",
      "Viajes fuera del país de residencia.",
    ),
    section: TRAVEL,
  },
  {
    id: "previousApps",
    title: PREVIOUS.title,
    description: L(
      "Prior IRCC or provincial filings and refusals.",
      "Demandes IRCC ou provinciales antérieures et refus.",
      "Solicitudes IRCC o provinciales previas y rechazos.",
    ),
    section: PREVIOUS,
  },
  {
    id: "admissibility",
    title: ADMISSIBILITY.title,
    description: L(
      "Medical, criminal, and military follow-ups.",
      "Santé, criminalité et service militaire.",
      "Médico, penal y servicio militar.",
    ),
    section: ADMISSIBILITY,
  },
  {
    id: "jobOffer",
    title: JOB_OFFER.title,
    description: L(
      "Employer, NOC, wage, and LMIA.",
      "Employeur, CNP, salaire et EIMT.",
      "Empleador, NOC, salario y EIMT.",
    ),
    section: JOB_OFFER,
  },
  {
    id: "study",
    title: STUDY.title,
    description: L(
      "School, program, dates, and funds.",
      "Établissement, programme, dates et fonds.",
      "Escuela, programa, fechas y fondos.",
    ),
    section: STUDY,
  },
  {
    id: "sponsor",
    title: SPONSOR.title,
    description: L(
      "Who is supporting the application.",
      "Qui soutient la demande.",
      "Quién apoya la solicitud.",
    ),
    section: SPONSOR,
  },
];

export function customFormModuleById(
  id: string,
): CustomFormModule | undefined {
  return CUSTOM_FORM_MODULES.find((mod) => mod.id === id);
}

function collectUsedKeys(schema: CustomFormSchema): Set<string> {
  const used = new Set<string>();
  for (const section of schema.sections) {
    used.add(section.key);
    for (const field of section.fields) used.add(field.key);
  }
  return used;
}

function uniqueKey(used: Set<string>, desired: string): string {
  if (!used.has(desired)) {
    used.add(desired);
    return desired;
  }
  let i = 2;
  while (i < 100) {
    const next = `${desired.replace(/_\d+$/, "")}_${i}`.slice(0, 64);
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
    i += 1;
  }
  const fallback = `field_${newBuilderId().slice(0, 8)}`;
  used.add(fallback);
  return fallback;
}

function remapShowWhen(
  rule: ShowWhenRule | undefined,
  keyMap: Map<string, string>,
): ShowWhenRule | undefined {
  if (!rule) return undefined;
  const mapClause = (clause: ShowWhen): ShowWhen => ({
    ...clause,
    key: keyMap.get(clause.key) ?? clause.key,
  });
  if (Array.isArray(rule)) return rule.map(mapClause);
  if ("or" in rule) return { or: rule.or.map(mapClause) };
  return mapClause(rule);
}

/**
 * Insert a premade module as a new section. Field keys stay stable unless they
 * already exist on the form (then they are suffixed).
 */
export function insertModuleIntoSchema(
  schema: CustomFormSchema,
  moduleId: CustomFormModuleId,
): CustomFormSchema {
  const mod = customFormModuleById(moduleId);
  if (!mod) return schema;
  const cloned = cloneSchemaWithNewIds({ version: 1, sections: [mod.section] });
  const original = cloned.sections[0];
  if (!original) return schema;

  const used = collectUsedKeys(schema);
  const keyMap = new Map<string, string>();
  const sectionKey = uniqueKey(used, original.key);
  const fields = original.fields.map((field) => {
    const key = uniqueKey(used, field.key);
    keyMap.set(field.key, key);
    return { ...field, key };
  });
  const remapped: CustomSection = {
    ...original,
    key: sectionKey,
    showWhen: remapShowWhen(original.showWhen, keyMap),
    fields: fields.map((field) => ({
      ...field,
      showWhen: remapShowWhen(field.showWhen, keyMap),
    })),
  };

  return {
    version: 1,
    sections: [...schema.sections, remapped],
  };
}
