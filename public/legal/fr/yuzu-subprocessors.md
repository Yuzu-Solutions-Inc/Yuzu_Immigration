# Sous-traitants — %PRODUCT_NAME%

**%OPERATOR_AS%** (exploitant de %PRODUCT_NAME%)  
**Responsable :** Adrien Yvin — %PRIVACY_EMAIL%  
**Dernière mise à jour :** 5 septembre 2026

Liste destinée aux cabinets qui préparent une EFVP ou une revue de fournisseurs.

| Sous-traitant | Rôle | Lieu habituel de traitement | Facultatif ? |
|---|---|---|---|
| Supabase (hébergé sur AWS) | Base de données, authentification, fichiers | Canada Central — Montréal (`ca-central-1`) | Obligatoire |
| Vercel | Hébergement de l’application et journaux | États-Unis et réseau mondial | Obligatoire pour l’hébergement |
| Vercel Web Analytics et Speed Insights | Mesures d’usage et de performance | États-Unis | Facultatif — désactivé tant que l’utilisateur n’a pas consenti |
| Resend | Courriel transactionnel (confirmations, rappels, liens de gestion) | États-Unis | Lorsque l’envoi de courriel est configuré |
| Stripe | Facturation de l’abonnement %PRODUCT_NAME% du cabinet ; paiements de consultation si le cabinet connecte Stripe | États-Unis | Facturation lorsque le cabinet s’abonne ; Connect est un opt-in du cabinet |
| Google | Connexion du personnel, connexion Google facultative au portail client, Agenda, Meet | États-Unis | Opt-in du personnel ou du cabinet |
| Microsoft | Outlook, Teams | États-Unis | Opt-in du personnel |
| Zoom | Liens de réunion | États-Unis | Opt-in du personnel |
| Square | Paiements des réservations tarifées et liens de paiement | États-Unis | Opt-in du cabinet |
| Sage Business Cloud Accounting | Appariement des clients par courriel, taxes, factures | Royaume-Uni / États-Unis | Opt-in du cabinet |

Les dossiers principaux restent au Canada. Le calcul applicatif, le courriel, la facturation et les agendas, réunions, paiements ou la comptabilité connectés peuvent traiter des renseignements hors Québec, y compris aux États-Unis (et, pour Sage, généralement au Royaume-Uni). %OPERATOR_NAME% a évalué ces communications (art. 17). En activant un outil, le cabinet nous instruit de communiquer les détails concernés à ce fournisseur.

Le personnel de %OPERATOR_NAME% qui détient la clé d’enveloppe de la plateforme peut déchiffrer les données d’un cabinet pour exploiter ou restaurer le service.

Questions : %PRIVACY_EMAIL%
