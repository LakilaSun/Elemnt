# Elemnt

Extension navigateur (Chrome / Edge / Brave — Manifest V3) qui permet de **sélectionner des éléments d'une page web, de les commenter, puis de générer un rapport JSON** prêt à envoyer à un agent IA pour qu'il effectue les modifications ou ajouts de fonctionnalités demandés — bien plus précis que de simples captures d'écran.

## Fonctionnalités (v0.1)

- 🖱️ **Mode sélection** : survol = surbrillance bleue, clic = l'élément est ajouté à la sélection (contour orange)
- 💬 **Commentaires** : panneau latéral avec une zone de texte par élément sélectionné pour donner les instructions à l'agent IA
- ➖ **Retirer** un élément de la sélection en un clic
- 📋 **Export JSON** : copie dans le presse-papiers ou téléchargement `.json`

Le rapport JSON contient pour chaque élément : tag, id, classes, sélecteur CSS, aperçu du texte, HTML externe (tronqué), position/taille et votre instruction.

### Dans les cadres (v0.3)

Les éléments affichés dans un **cadre** (iframe) se sélectionnent comme ceux de la page, y compris dans les cadres isolés `sandbox` qu'utilisent certaines applications pour exécuter du code à part. Le script est injecté dans la page et dans chacun de ses cadres ; un cadre ouvert après l'activation le reçoit aussi. Le panneau reste dans la page.

Un élément venu d'un cadre porte dans le rapport un champ `frame` : `{ url, title }` (le titre du document du cadre), et sa position `rect` est comptée depuis le cadre. Dans la liste du panneau, le titre du cadre suit l'élément.

**Cadres isolés : sur 127.0.0.1 et localhost seulement.** Chrome place un cadre `sandbox` dans un processus à part, que la permission « au clic » (`activeTab`) ne couvre pas : l'extension y était aveugle. Pour les applications en local (127.0.0.1, localhost, tout port), elle déclare donc un accès permanent et charge son script d'office dans tous leurs cadres (il reste inactif tant qu'on ne clique pas sur l'icône). Ailleurs, rien ne change : seule la permission au clic, et les cadres isolés hors d'atteinte. Vérifié dans Chrome 154 avec un vrai déclenchement de l'icône (`Extensions.triggerAction`) : sans cet accès, la page se sélectionne mais pas ses cadres isolés ; avec, les deux.

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
├── background.js   # service worker : injection au clic (page et cadres), relais page ↔ cadres
├── content.js      # logique : hover, sélection, panneau, export JSON
├── overlay.css     # styles de l'overlay et du panneau
└── icon.png        # icône
```

## Idées futures

- Capture d'écran de chaque élément sélectionné
- Sélection multi-éléments par drag rectangle
- Presets d'instructions (« rendre responsive », « améliorer l'accessibilité »…)
