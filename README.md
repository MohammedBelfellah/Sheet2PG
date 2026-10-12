# Feuille vers PostgreSQL

Application de bureau Windows pour importer un fichier CSV, XLSX ou XLS dans PostgreSQL sans écrire de SQL. Elle permet de choisir une feuille et une ligne d’en-tête, de mapper les colonnes, de vérifier toutes les valeurs, d’ignorer les doublons selon une règle visible et d’effectuer une insertion transactionnelle uniquement.

## Prérequis

- Node.js 22 ou version ultérieure ;
- npm 10 ou version ultérieure ;
- PostgreSQL 13 ou version ultérieure, local ou distant.

## Développement

```powershell
npm.cmd install
npm.cmd run developper
```

La commande ouvre Electron avec le serveur de développement Vite. Aucun serveur applicatif distinct n’est utilisé.

Au premier lancement, Electron 44 télécharge son moteur Windows officiel. Si ce téléchargement à la demande est bloqué par le réseau, exécutez après rétablissement de l’accès :

```powershell
node node_modules\electron\install.js
```

## Vérification et tests

```powershell
npm.cmd run verifier
npm.cmd run tester
npm.cmd run construire
```

Les essais d’intégration à PostgreSQL doivent utiliser une base jetable. L’application n’exécute jamais de mise à jour, de suppression ni de troncature sur la table de destination.

## Paquet Windows

```powershell
npm.cmd run empaqueter:windows
```

L’installeur NSIS est produit dans `livrables`. Il propose le dossier d’installation et crée un raccourci sur le Bureau.

## Conversions prises en charge

- texte, `varchar` et `char`, avec contrôle de longueur sans troncature ;
- `smallint`, `integer` et `bigint`, sans conversion par nombre flottant ;
- `numeric`, `decimal`, `real` et `double precision`, avec règle explicite si le séparateur est ambigu ;
- booléens usuels (`vrai/faux`, `oui/non`, `true/false`, `1/0`) ;
- dates ISO et dates jour/mois ou mois/jour avec règle explicite en cas d’ambiguïté ;
- horodatages avec ou sans fuseau, avec fuseau source obligatoire si nécessaire ;
- UUID, JSON et JSONB ;
- valeurs vides vers `NULL`, ou chaîne vide sur demande pour les colonnes texte.

Les grands entiers et décimaux exacts restent des chaînes jusqu’à leur envoi au pilote PostgreSQL. Les zéros initiaux significatifs sont protégés. Les coordonnées sont traitées comme des colonnes ordinaires.

## Limites connues

- les macros ne sont jamais exécutées et les formules utilisent uniquement leur résultat enregistré ;
- une formule sans résultat enregistré doit être recalculée puis sauvegardée dans le tableur ;
- les types PostgreSQL spécialisés ou définis par l’utilisateur sont signalés comme non pris en charge ;
- la validation réduit les erreurs mais les contraintes et déclencheurs de la base peuvent encore refuser la transaction ;
- l’analyse des fichiers Excel nécessite leur chargement en mémoire, tandis que les insertions restent progressives ;
- la détection exacte des doublons sans contrainte adaptée emploie un verrou transactionnel bref avant l’insertion.

## Sécurité et confidentialité

Le moteur d’interface est isolé et exécuté dans le bac à sable Electron, sans intégration Node.js. Le pont expose une opération ciblée par fonction et le processus principal vérifie l’émetteur. Les mots de passe restent uniquement en mémoire, ne sont ni journalisés ni persistés. TLS vérifie toujours le certificat lorsqu’il est activé ; aucun repli silencieux non chiffré n’est effectué.

## Dépendances de lecture Excel

SheetJS Community Edition 0.20.3 est installé depuis la distribution officielle et prend en charge XLS ainsi que XLSX. Il est distribué sous licence Apache-2.0. Voir [MENTIONS-LOGICIELS-LIBRES.md](MENTIONS-LOGICIELS-LIBRES.md).
