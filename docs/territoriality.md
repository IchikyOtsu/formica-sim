# Multi-colonies et territorialité

V1.1 place plusieurs colonies indépendantes dans un monde partagé. Chaque
colonie possède son nid, sa reine, son stock, son couvain, ses ouvrières et un
`PheromoneField` privé. Les sources de nourriture et les dangers restent
globaux. Il n'existe aucun combat ni lecture de phéromone étrangère.

L'ordre de traitement des colonies alterne à chaque tick. Un prélèvement reste
atomique : si deux ouvrières atteignent la dernière unité, une seule l'obtient,
et la priorité alterne au tick suivant. Les contacts étrangers sont des
observations et événements uniquement ; ils n'influencent pas la navigation.

La carte territoriale est descriptive. Pour chaque cellule, l'influence d'une
colonie vaut `HOME + FOOD`. Sous le minimum elle est neutre ; si les deux
meilleures influences diffèrent de moins que le seuil, elle est contestée ;
sinon la plus forte contrôle la cellule. Cette carte n'est jamais lue par les
fourmis.

Le scénario `Symétrique V1.1` place 50 ouvrières par colonie dans deux nids
opposés. Le benchmark d'équité s'exécute avec :

```bash
npm run experiment -- competition --seeds=100 --ticks=50000
```

Le smoke benchmark de validation sur 20 seeds et 1 000 ticks donne 10 victoires
à A et 10 à B, avec 57,3 contre 58,6 unités collectées en moyenne. Ce contrôle
court ne remplace pas la campagne officielle à 100 seeds, mais ne révèle aucun
biais d'ordre structurel.
