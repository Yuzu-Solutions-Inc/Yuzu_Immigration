#!/usr/bin/env node
/**
 * One-off patcher for Law 25 privacy/terms copy. Safe to re-run.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const downloads = {
  en: {
    title: "Downloads for consulting firms",
    help: "Templates to help your firm meet PIPEDA and Québec Law 25 duties toward your clients. They are not legal advice. A firm administrator accepts the data processing addendum in-product when creating the workspace. French versions are used when the site language is French.",
    groupYuzu: "%OPERATOR_NAME%",
    groupFirm: "Templates for your firm",
    items: {
      governance: {
        label: "Governance summary",
        hint: "Public description of how %OPERATOR_AS% governs personal information.",
      },
      subprocessors: {
        label: "Subprocessors and locations",
        hint: "Where %OPERATOR_AS% and its vendors process personal information for %PRODUCT_NAME%.",
      },
      vendorPack: {
        label: "Vendor due-diligence pack",
        hint: "Data map and safeguards for your firm’s own privacy impact assessment.",
      },
      dpa: {
        label: "Firm data processing addendum",
        hint: "Written processor contract. Accepted in-product by a firm administrator; download if you need a countersigned copy.",
      },
      efvp: {
        label: "Firm privacy impact assessment (EFVP)",
        hint: "Facts about the product for your Law 25 EFVP; your firm writes its own conclusions.",
      },
      privacyNotice: {
        label: "Privacy notice for your clients",
        hint: "Controller-level notice you can attach to retainers.",
      },
      consent: {
        label: "Consent and retainer language",
        hint: "Express consent for sensitive information, children, and optional US tools.",
      },
      incidentRegister: {
        label: "Confidentiality incident register",
        hint: "Log every incident, including those you do not report to the CAI.",
      },
      incidentNotices: {
        label: "Incident notice templates",
        hint: "Outlines for clients, the CAI, and the OPC.",
      },
      rightsRequest: {
        label: "Individual rights request form",
        hint: "Access, correction, portability, and deletion intake (aim: 30 days).",
      },
      destruction: {
        label: "File destruction register (paper)",
        hint: "Optional backup of the in-product destruction register.",
      },
    },
  },
  fr: {
    title: "Téléchargements pour les cabinets",
    help: "Modèles pour aider votre cabinet à respecter la LPRPDE et la Loi 25 du Québec envers vos clients. Ce ne sont pas des avis juridiques. Un administrateur accepte l’avenant de traitement dans le produit à la création de l’espace. Les versions françaises s’affichent lorsque le site est en français.",
    groupYuzu: "%OPERATOR_NAME%",
    groupFirm: "Modèles pour votre cabinet",
    items: {
      governance: {
        label: "Résumé de gouvernance",
        hint: "Description publique de la gouvernance des renseignements personnels chez %OPERATOR_AS%",
      },
      subprocessors: {
        label: "Sous-traitants et lieux",
        hint: "Où %OPERATOR_AS% et ses fournisseurs traitent les renseignements personnels pour %PRODUCT_NAME%.",
      },
      vendorPack: {
        label: "Dossier de diligence du fournisseur",
        hint: "Schéma des données et mesures pour votre propre EFVP.",
      },
      dpa: {
        label: "Avenant de traitement des données",
        hint: "Contrat écrit de sous-traitance. Accepté dans le produit par un administrateur ; téléchargez-le si vous avez besoin d’une copie contresignée.",
      },
      efvp: {
        label: "EFVP du cabinet",
        hint: "Faits sur le produit pour votre EFVP Loi 25 ; le cabinet rédige ses propres conclusions.",
      },
      privacyNotice: {
        label: "Avis de confidentialité pour vos clients",
        hint: "Avis du responsable que vous pouvez joindre au mandat.",
      },
      consent: {
        label: "Langage de consentement et de mandat",
        hint: "Consentement exprès pour les renseignements sensibles, les enfants et les outils US facultatifs.",
      },
      incidentRegister: {
        label: "Registre des incidents de confidentialité",
        hint: "Tous les incidents, y compris ceux non déclarés à la CAI.",
      },
      incidentNotices: {
        label: "Modèles d’avis d’incident",
        hint: "Trames pour les clients, la CAI et le CPVP.",
      },
      rightsRequest: {
        label: "Formulaire de droits d’une personne",
        hint: "Accès, rectification, portabilité et suppression (objectif : 30 jours).",
      },
      destruction: {
        label: "Registre de destruction (papier)",
        hint: "Copie facultative du registre de destruction du produit.",
      },
    },
  },
  es: {
    title: "Descargas para despachos",
    help: "Plantillas para ayudar a su despacho a cumplir PIPEDA y la Ley 25 de Quebec frente a sus clientes. No son asesoramiento jurídico. Un administrador acepta el addendum de tratamiento en el producto al crear el espacio. El paquete en francés se sirve cuando el sitio está en francés; en otros idiomas se sirve el inglés.",
    groupYuzu: "%OPERATOR_NAME%",
    groupFirm: "Plantillas para su despacho",
    items: {
      governance: {
        label: "Resumen de gobernanza",
        hint: "Descripción pública de cómo %OPERATOR_AS% gobierna la información personal.",
      },
      subprocessors: {
        label: "Subencargados y ubicaciones",
        hint: "Dónde %OPERATOR_AS% y sus proveedores tratan información personal para %PRODUCT_NAME%.",
      },
      vendorPack: {
        label: "Paquete de diligencia del proveedor",
        hint: "Mapa de datos y salvaguardas para la evaluación de impacto de su despacho.",
      },
      dpa: {
        label: "Addendum de tratamiento de datos",
        hint: "Contrato escrito de encargado. Lo acepta un administrador en el producto; descárguelo si necesita una copia firmada.",
      },
      efvp: {
        label: "Evaluación de impacto de privacidad del despacho",
        hint: "Hechos sobre el producto para su EFVP de la Ley 25; su despacho redacta sus propias conclusiones.",
      },
      privacyNotice: {
        label: "Aviso de privacidad para sus clientes",
        hint: "Aviso del responsable que puede anexar al mandato.",
      },
      consent: {
        label: "Lenguaje de consentimiento y mandato",
        hint: "Consentimiento expreso para datos sensibles, menores y herramientas opcionales en EE. UU.",
      },
      incidentRegister: {
        label: "Registro de incidentes de confidencialidad",
        hint: "Todos los incidentes, incluidos los que no se declaran a la CAI.",
      },
      incidentNotices: {
        label: "Plantillas de aviso de incidente",
        hint: "Esquemas para clientes, la CAI y el OPC.",
      },
      rightsRequest: {
        label: "Formulario de derechos de la persona",
        hint: "Acceso, corrección, portabilidad y supresión (objetivo: 30 días).",
      },
      destruction: {
        label: "Registro de destrucción (papel)",
        hint: "Copia opcional del registro de destrucción del producto.",
      },
    },
  },
};

const analyticsConsent = {
  en: {
    body: "We use essential cookies to run %PRODUCT_NAME%. Optional product analytics (Vercel) help us operate the service and may be processed outside Québec, including in the United States. They are off unless you accept. They are not used for advertising.",
    privacyLink: "Privacy policy",
    accept: "Accept analytics",
    refuse: "Refuse",
  },
  fr: {
    body: "Nous utilisons des témoins essentiels pour faire fonctionner %PRODUCT_NAME%. L’analytique facultative (Vercel) nous aide à exploiter le service et peut être traitée hors Québec, y compris aux États-Unis. Elle est désactivée tant que vous n’acceptez pas. Elle ne sert pas à la publicité.",
    privacyLink: "Politique de confidentialité",
    accept: "Accepter l’analytique",
    refuse: "Refuser",
  },
  es: {
    body: "Usamos cookies esenciales para operar %PRODUCT_NAME%. La analítica opcional (Vercel) nos ayuda a operar el servicio y puede tratarse fuera de Quebec, incluso en Estados Unidos. Está desactivada salvo que usted acepte. No se usa para publicidad.",
    privacyLink: "Política de privacidad",
    accept: "Aceptar analítica",
    refuse: "Rechazar",
  },
};

function loadCopy() {
  return JSON.parse(
    fs.readFileSync(path.join(root, "scripts", "legal-i18n-copy.json"), "utf8"),
  );
}

const copy = loadCopy();

for (const locale of ["en", "fr", "es"]) {
  const file = path.join(root, "messages", `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(data.legal, copy[locale].legalMeta);
  data.legal.sections = copy[locale].sections;
  data.legal.termsSections = copy[locale].termsSections;
  data.legal.downloads = downloads[locale];
  data.legal.analyticsConsent = analyticsConsent[locale];
  if (data.settings) {
    data.settings.securityHelp = copy[locale].securityHelp;
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log("patched", file);
}
