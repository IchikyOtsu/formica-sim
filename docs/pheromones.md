# Phéromones

Le champ est une grille scalaire indépendante du rendu avec trois couches :
`FOOD`, `HOME` et `ALARM`. Les retours chargés déposent FOOD, les chercheuses
déposent HOME et les dommages ou morts environnementales déposent ALARM.

À chaque tick, chaque couche applique diffusion puis évaporation et met à zéro
les valeurs sous son seuil. La navigation échantillonne des directions locales
et combine attraction, répulsion, inertie et bruit déterministe. Masquer une
couche dans l'interface ne change jamais son calcul.
