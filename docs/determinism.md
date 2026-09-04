# Déterminisme et invariants

La seed initialise des flux séparés pour marche, sensing, naissances et monde.
À configuration, seed et nombre de ticks identiques, `getState()` doit être
identique. Reset et replay repartent des mêmes flux initiaux.

Invariants V1 vérifiés par `inspectSimulationInvariants()` :

- énergie dans ses bornes et positions dans le monde ;
- ouvrières mortes inertes ;
- stock, couvain et population bornés ;
- intensités de phéromones finies et non négatives ;
- conservation de la masse alimentaire à une tolérance de `1e-4`.

Le scénario officiel utilise la seed 1847 pendant 50 000 ticks. Les compteurs
discrets ont une tolérance nulle ; stock et consommation `0.001`, distance
`0.01`. Exécuter `npm run validate:reference` pour le comparer à la signature.
