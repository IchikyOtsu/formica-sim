# Démographie

Le cycle simplifié est `EGG → LARVA → PUPA → WORKER`. Les larves consomment de
la nourriture ; les autres stades progressent sans coût courant. La reine pond
si le cooldown, le seuil de stock, `maxBrood` et `maxWorkers` le permettent.

L'ordre économique est déterministe : alimentation des ouvrières, entretien des
larves, puis ponte. Une population accrue améliore potentiellement la collecte
mais augmente aussi la consommation, permettant croissance, contraction et
extinction sans décision globale.
