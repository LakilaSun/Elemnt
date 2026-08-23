# Elemnt

Extension navigateur (Chrome / Edge / Brave — Manifest V3) qui permet de **sélectionner des éléments d'une page web, de les commenter, puis de générer un rapport JSON** prêt à envoyer à un agent IA pour qu'il effectue les modifications ou ajouts de fonctionnalités demandés — bien plus précis que de simples captures d'écran.

## Fonctionnalités (v0.1)

- 🖱️ **Mode sélection** : survol = surbrillance bleue, clic = l'élément est ajouté à la sélection (contour orange)
- 💬 **Commentaires** : panneau latéral avec une zone de texte par élément sélectionné pour donner les instructions à l'agent IA
- ➖ **Retirer** un élément de la sélection en un clic
- 📋 **Export JSON** : copie dans le presse-papiers ou téléchargement `.json`

Le rapport JSON contient pour chaque élément : tag, id, classes, sélecteur CSS, aperçu du texte, HTML externe (tronqué), position/taille et votre instruction.

## Installation (mode développeur)

1. Ouvrez `chrome://extensions`
2. Activez le **Mode développeur** (coin haut droit)
3. Cliquez **Charger l'extension non empaquetée**
4. Sélectionnez ce dossier (`Elemnt`)

## Utilisation

1. Allez sur la page à annoter
2. Cliquez sur l'icône Elemnt dans la barre d'outils → le mode sélection s'active
3. Survolez la page (surbrillance), cliquez sur les éléments à commenter
4. Écrivez vos instructions dans le panneau à droite
5. **Copier JSON** puis collez-le dans la conversation de votre agent IA — ou **Télécharger .json**

## Structure

```
Elemnt/
├── manifest.json   # Manifest V3
├── background.js   # service worker : injection au clic sur l'icône
├── content.js      # logique : hover, sélection, panneau, export JSON
├── overlay.css     # styles de l'overlay et du panneau
└── icon.png        # icône
```

## Idées futures

- Capture d'écran de chaque élément sélectionné
- Sélection multi-éléments par drag rectangle
- Presets d'instructions (« rendre responsive », « améliorer l'accessibilité »…)
