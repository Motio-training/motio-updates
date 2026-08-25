# Fichiers Connect IQ de la montre

Les `.prg` servis ici sont les binaires du compagnon Garmin, liés depuis la
section « Montre » du site (`index.html#montre`). Ils sont copiés tels quels
depuis `C:\motio-watch\bin\devices\` après une compilation `monkeyc`.

Un fichier par modèle : Garmin refuse un binaire compilé pour une autre montre.
La liste des modèles pris en charge vit dans `manifest.xml` du projet montre.

**À refaire à chaque nouvelle version de l'app montre :** recompiler, puis
recopier les 18 fichiers ici. Sans ça, le site distribuerait une version
périmée pendant que l'appli téléphone, elle, se met à jour toute seule.
