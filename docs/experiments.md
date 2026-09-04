# Expériences

Le preset `Référence V1.0` fixe 50 ouvrières, reproduction active, saisons
modérées, dangers ordinaires et ALARM équilibrée sur la seed 1847. Sa durée
officielle est 50 000 ticks.

Commandes longues recommandées :

```bash
npm run experiment -- pheromones --seeds=100
npm run experiment -- survival --seeds=100
npm run experiment -- demography --seeds=100
npm run experiment -- environment --seeds=100
npm run experiment -- alarm --seeds=100
```

Changer une formule scientifique impose soit de conserver la signature de
référence dans ses tolérances, soit de documenter et régénérer explicitement une
nouvelle référence. Les exports CSV servent à l'analyse statistique ; le JSON
conserve schéma, seed, durée, résumé, séries et événements.
