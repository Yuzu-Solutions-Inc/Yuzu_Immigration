# Dossier de diligence — Yuzu Immigration

**Fournisseur :** Yuzu Solutions Inc.  
**Produit :** Yuzu Immigration  
**Responsable :** Adrien Yvin — privacy@yuzu.solutions  
**Date :** 16 août 2026  

Remettez ce document à votre responsable de la protection des renseignements personnels ou à votre conseiller pour une EFVP Loi 25 ou une revue LPRPDE. Ce n’est **pas** une certification.

## 1. Rôles

| Partie | Rôle |
|---|---|
| Votre cabinet | Responsable des dossiers clients / personnes qui réservent |
| Yuzu Solutions Inc. | Sous-traitant pour ces dossiers ; responsable des données de compte du personnel nécessaires au service |

## 2. Schéma des données (simplifié)

```
Client / personne qui réserve → portail ou réservation → appli Yuzu (Vercel)
                                              ↓
                    Champs et fichiers chiffrés → Supabase (AWS Montréal)
                                              ↓
              Facultatif : courriel Resend, Google / Microsoft / Zoom, Square
```

## 3. Catégories

Personnel : nom, courriel, rôle, champs IMM 5476, identifiants, courriel du compte connecté.  
Clients : identité, coordonnées, langue, statut, questionnaires, documents, notes, rendez-vous, liens de réunion.  
Technique : IP et agent utilisateur pour certains audits ; hachage courriel/IP pour les abus de réservation (~14 jours).  
Absent du produit : appariement biométrique.

## 4. Mesures

- TLS  
- Chiffrement d’infrastructure au repos (Supabase)  
- AES-256-GCM par cabinet pour documents et de nombreux champs  
- Isolation RLS ; accès du personnel limité au cabinet  
- Clé service_role côté serveur seulement  
- Jetons de réservation difficiles à deviner ; mot de passe du portail  
- Journal d’audit et registre de destruction  
- Analytique sur consentement seulement  

**Résiduel :** les opérateurs Yuzu qui détiennent la clé d’enveloppe peuvent déchiffrer pour exploiter ou restaurer le service.

## 5. Lieux

- Système d’enregistrement : Canada (`ca-central-1`)  
- Calcul / journaux : Vercel (souvent États-Unis)  
- Courriel / agendas / réunions / paiements facultatifs : généralement États-Unis  

Voir `yuzu-subprocessors.pdf`. Yuzu a des EFVP internes. **Votre cabinet doit faire la sienne** (`firm-efvp-template.pdf`).

## 6. Conservation

Dossiers fermés : six ans dans le produit, puis destruction par un admin. Sauvegardes, courriels et copies d’agenda chez Google/Microsoft/Zoom peuvent durer plus longtemps.

## 7. Droits des personnes

- Export JSON d’une personne et ZIP du dossier (admins)  
- Correction dans l’espace de travail  
- Suppression / destruction après la date de conservation  
- Personnes qui réservent : liens de modification / annulation dans le courriel  

Les demandes vous sont adressées. Les enjeux de plateforme : privacy@yuzu.solutions.

## 8. Incidents

Yuzu tient un registre et avisera votre cabinet sans délai injustifié. Vous restez responsable d’aviser vos clients et, le cas échéant, la CAI et le CPVP.

## 9. Contrats

- Conditions et politique (acceptées dans le produit)  
- `firm-data-processing-addendum.pdf` (à signer avant d’y mettre des RP clients de production)

## 10. Ce que nous ne prétendons pas

Pas de « certification LPRPDE » ni « certification Loi 25 ». Pas de HIPAA. Aucune garantie de résultat en immigration ni d’acceptation des formulaires par IRCC/MIFI.
