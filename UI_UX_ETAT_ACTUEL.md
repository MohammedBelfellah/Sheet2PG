# État actuel de l’interface — Feuille vers PostgreSQL

## 1. Objectif du produit

L’application de bureau importe un fichier CSV, TXT, XLSX ou XLS dans une base PostgreSQL locale ou distante. Elle s’adresse à une personne qui ne souhaite pas écrire de SQL.

Le parcours principal est :

1. choisir un fichier ;
2. configurer sa lecture ;
3. se connecter à PostgreSQL ;
4. choisir une table existante ou créer une table ;
5. associer les colonnes source et destination ;
6. valider toutes les lignes ;
7. importer les lignes autorisées.

L’application n’effectue jamais de mise à jour, de suppression ou de remplacement des enregistrements existants.

## 2. Structure de l’écran actuel

L’application utilise un seul espace de travail vertical, sans barre latérale ni navigation entre plusieurs pages.

### Barre supérieure

- nom de l’application ;
- sous-titre « Excel, CSV et TXT vers PostgreSQL » ;
- état global de la connexion PostgreSQL.

### Bloc 1 — Source

- zone de dépôt de fichier et bouton de sélection ;
- réouverture du sélecteur dans le dernier dossier utilisé, mémorisé localement entre les sessions ;
- nom, format et taille du fichier ;
- détection et modification du séparateur et de l’encodage pour les fichiers CSV et TXT ;
- sélection de la feuille Excel ;
- choix du mode d’en-tête : automatique, ligne précise ou sans en-tête ;
- liste à défilement des colonnes source ;
- sélection ou exclusion des colonnes ;
- nombre d’enregistrements et de lignes vides ignorées ;
- accès à l’aperçu.

### Bloc 2 — Destination

- connexion locale ou distante ;
- hôte, port, base, utilisateur et mot de passe ;
- options TLS et délai de connexion ;
- état de connexion ;
- choix entre table existante et création d’une table ;
- sélection du schéma et de la table ;
- saisie du nom d’une nouvelle table.

### Bloc 3 — Colonnes et conversion

Une ligne est affichée pour chaque colonne source sélectionnée, avec :

- inclusion ou exclusion ;
- nom de la colonne source ;
- exemples de valeurs ;
- champ PostgreSQL de destination ;
- type PostgreSQL cible ;
- règles de conversion ;
- sélection facultative comme clé de détection des doublons.

Dans une table existante, les correspondances sont proposées uniquement lorsque les noms sont suffisamment proches. Une correspondance incertaine, comme `ID` vers `id_cheptel`, doit être choisie manuellement.

### Bloc 4 — Aperçu

- bascule entre valeurs source et valeurs préparées ;
- affichage de 50 lignes au maximum ;
- conservation du numéro d’enregistrement d’origine.

### Bloc 5 — Validation et résultats

- résumé des lignes lues, valides, en doublon ou en conflit ;
- liste filtrable des erreurs et avertissements ;
- indication de la ligne, de la colonne, de la valeur originale et de l’action recommandée ;
- export du rapport en CSV.

### Barre d’action inférieure

- résumé de la configuration ;
- bouton « Valider » ;
- bouton « Importer » ;
- progression et annulation pendant une importation.

## 3. Règles d’activation importantes

Le bouton « Valider » est actif uniquement lorsque :

- un fichier est chargé ;
- au moins une colonne est incluse ;
- la connexion PostgreSQL est active ;
- un schéma et une table sont définis ;
- chaque colonne incluse possède une destination et un type cible.

Le bouton « Importer » est actif uniquement après une validation complète sans erreur bloquante. Toute modification du fichier, de la connexion, de la destination, des correspondances ou des règles invalide la validation précédente.

## 4. Difficultés observées

### Compréhension du parcours

- Les blocs contiennent beaucoup de contrôles et d’informations visibles simultanément.
- L’ordre attendu des actions n’est pas toujours évident malgré les numéros de section.
- La différence entre sélection d’une colonne source, case « Inclure » et correspondance vers PostgreSQL peut sembler redondante.
- La différence entre « Valider » et « Importer » n’est pas suffisamment expliquée près des boutons.

### Boutons désactivés

- Un bouton désactivé ne précisait pas toujours la configuration manquante.
- Une colonne incluse mais non mappée pouvait bloquer la validation sans explication assez visible.
- Un identifiant PostgreSQL obligatoire peut être confondu avec un identifiant généré automatiquement.

### Densité du tableau de correspondance

- Le tableau est large et dense.
- Les règles de conversion occupent beaucoup d’espace vertical.
- Les utilisateurs débutants peuvent ne pas comprendre immédiatement les types PostgreSQL.
- La relation entre la ligne source, le champ cible et l’erreur de validation demande beaucoup d’attention visuelle.

### Défilement

- L’écran est long et oblige à naviguer entre la source, la destination, les correspondances et les résultats.
- La barre inférieure reste visible, mais elle peut réduire l’espace disponible ou donner l’impression de recouvrir les derniers contrôles.
- La table de correspondance peut nécessiter un défilement horizontal sur un écran étroit.

### Hiérarchie visuelle

- Les panneaux principaux ont un poids visuel similaire, même lorsque certains nécessitent une attention immédiate.
- Les messages de blocage, les avertissements et les informations secondaires pourraient être mieux différenciés.
- La réussite d’une étape pourrait être davantage visible afin de réduire la charge mentale.

## 5. Contraintes fonctionnelles à préserver

Une nouvelle conception doit conserver les comportements suivants :

- une seule fenêtre principale ;
- source et connexion configurables dans n’importe quel ordre ;
- aucune sauvegarde du mot de passe ;
- aucune modification ou suppression des données existantes ;
- aucune création de table avant l’importation transactionnelle ;
- correspondances incertaines jamais acceptées automatiquement ;
- erreurs associées aux numéros d’enregistrement d’origine ;
- validation de tout le fichier avant l’importation ;
- valeurs exactes préservées, notamment les zéros initiaux et les grands nombres ;
- progression et annulation visibles ;
- accessibilité clavier, contraste suffisant et textes compréhensibles sans dépendre uniquement des couleurs.

## 6. Priorités recommandées pour la refonte

### Priorité 1 — Rendre la prochaine action évidente

- afficher une liste courte des conditions restantes près des boutons ;
- expliquer directement pourquoi « Valider » ou « Importer » est désactivé ;
- présenter un état clair pour chaque grande étape : à configurer, incomplet, prêt ou terminé ;
- déplacer automatiquement le regard vers le premier problème bloquant.

### Priorité 2 — Simplifier les correspondances

- fusionner ou clarifier la sélection source et la case « Inclure » ;
- mettre les colonnes non mappées en évidence ;
- distinguer visuellement les correspondances automatiques, manuelles et impossibles ;
- masquer les réglages avancés tant qu’ils ne sont pas nécessaires ;
- expliquer les colonnes générées automatiquement par PostgreSQL.

### Priorité 3 — Réduire la densité

- utiliser une présentation progressive sans créer un assistant bloquant ;
- replier les sections déjà terminées en conservant leur résumé ;
- utiliser un panneau de détail pour les règles avancées d’une colonne ;
- améliorer le comportement sur les fenêtres proches de la taille minimale.

### Priorité 4 — Améliorer les résultats

- commencer par une phrase simple indiquant si l’importation est possible ;
- regrouper les problèmes similaires ;
- offrir un accès direct à la colonne concernée depuis une erreur ;
- mieux distinguer les erreurs bloquantes, les doublons ignorés et les informations.

## 7. Scénarios à prototyper et tester

1. Importation simple d’un CSV dans une nouvelle table.
2. Importation dans une table existante avec correspondances exactes.
3. Correspondance manuelle entre `ID` et `id_cheptel`.
4. Colonne obligatoire non mappée.
5. Colonne d’identité générée automatiquement par PostgreSQL.
6. Date ambiguë nécessitant une règle jour/mois.
7. Fichier contenant des doublons et des conflits de clé.
8. Échec de connexion ou absence de permission d’insertion.
9. Importation dont toutes les lignes sont déjà présentes.
10. Utilisation au clavier et dans une fenêtre de 1000 × 700 pixels.

## 8. Définition d’une amélioration réussie

La refonte sera réussie si une personne découvrant l’application peut :

- identifier immédiatement la prochaine action ;
- comprendre pourquoi une action est désactivée ;
- configurer une importation simple sans documentation externe ;
- corriger une correspondance manquante à partir du message affiché ;
- distinguer validation, détection des doublons et importation réelle ;
- terminer le parcours sans craindre que les données existantes soient modifiées.

## 9. Refonte mise en œuvre

La nouvelle interface reprend la direction visuelle validée et remplace la longue page de configuration par une organisation plus compacte :

- barre supérieure avec indicateurs colorés distincts pour le fichier chargé et la connexion PostgreSQL, ainsi qu’une déconnexion explicite ;
- bannière indiquant la prochaine action, les erreurs ou la réussite de la validation ;
- cartes récapitulatives de la source et de la destination ;
- configuration de la source et de PostgreSQL dans des fenêtres modales dédiées ;
- onglets « Colonnes et correspondances », « Aperçu des données » et « Résultats et rapport » ;
- tableau de correspondance paginé par groupes de cinq colonnes ;
- préremplissage des noms et des types PostgreSQL lors de la création d’une table, avec possibilité de modifier ou de régénérer les propositions ;
- suppression du fichier source en mémoire et remise à zéro complète de l’importation après une réussite, tout en conservant uniquement la connexion PostgreSQL ;
- confirmation temporaire de la réussite, masquée automatiquement après quelques secondes ;
- règles avancées ouvertes à la demande pour une seule colonne ;
- aperçu brut ou préparé paginé ;
- bilan de validation avec compteurs et rapport structuré ;
- barre d’action compacte expliquant les garanties transactionnelles ;
- libellé d’importation indiquant le nombre de lignes prêtes.

Les choix visuels du prototype ont été adaptés aux règles de sécurité du produit :

- les cellules vides restent converties en `NULL` par défaut et jamais silencieusement en zéro ;
- le mot de passe est appliqué en mémoire, mais jamais sauvegardé ;
- les transformations non prises en charge, comme la mise en majuscules automatique, ne sont pas affichées ;
- l’historique présenté correspond à l’opération courante et n’est pas persisté ;
- les paramètres d’encodage et de séparateur sont réservés aux fichiers CSV et TXT.
