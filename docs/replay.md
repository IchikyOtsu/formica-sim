# Replay et inspection

Le replay recalcule une expérience depuis la seed et la configuration plutôt
que de mémoriser chaque état. Il avance par blocs pour ne pas bloquer le
navigateur. Un replay exact doit produire le même instantané moteur qu'une
exécution directe.

La pause sur événement peut surveiller mort, épuisement d'une source, changement
de saison, extinction, seuil de population ou seuil de stock. Elle interrompt
uniquement l'horloge de l'interface ; l'état au tick déclencheur reste inspectable
et exportable.
