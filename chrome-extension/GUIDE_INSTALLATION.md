# Guide d'installation — Extension Chrome "Sync INPI"

L'extension se connecte automatiquement à INPI toutes les 90 minutes.  
**À faire une seule fois — environ 3 minutes.**

---

## Étape 1 — Récupérer votre token personnel

1. Ouvrez l'outil 2C Expertise
2. Cliquez sur **⚙️ Paramètres**
3. Descendez jusqu'à la section **INPI**
4. Copiez votre **Token personnel** (une suite de lettres et chiffres)

---

## Étape 2 — Installer l'extension

1. Ouvrez Chrome et allez sur **chrome://extensions**
2. Activez le **Mode développeur** (interrupteur en haut à droite)
3. Cliquez sur **"Charger l'extension non empaquetée"**
4. Sélectionnez le dossier `chrome-extension` reçu par votre cabinet
5. L'extension apparaît dans la liste ✅

---

## Étape 3 — Configurer l'extension

1. Cliquez sur l'icône 🏛️ dans la barre Chrome (en haut à droite)
   > Si vous ne la voyez pas : cliquez sur l'icône puzzle 🧩 → épinglez "Sync INPI"
2. Dans le popup qui s'ouvre :
   - **URL de votre app** : `https://votre-app.vercel.app` *(l'adresse de l'outil)*
   - **Token personnel** : collez le token copié à l'étape 1
3. Cliquez **Enregistrer**

L'extension synchronise immédiatement et affiche **✅ Connecté**.

---

## Comment ça fonctionne

- L'extension lit automatiquement votre cookie INPI toutes les **90 minutes**
- Elle envoie le token à l'outil en arrière-plan, sans aucune action de votre part
- Le badge sur l'icône indique l'état :
  - **✓ vert** → connecté
  - **! orange** → erreur temporaire
  - **! rouge** → non connecté à INPI (connectez-vous sur guichet-unique.inpi.fr)

---

## Prérequis

- Être connecté sur **guichet-unique.inpi.fr** dans Chrome
  *(votre session Google doit être active — c'est le cas tant que vous ne vous déconnectez pas)*

---

## En cas de problème

| Symptôme | Solution |
|----------|----------|
| Badge **?** gris | Renseignez l'URL et le token dans l'extension |
| Badge **!** rouge | Connectez-vous sur guichet-unique.inpi.fr |
| Badge **!** orange | Vérifiez l'URL de l'app dans les paramètres de l'extension |
| Page INPI vide dans l'outil | Cliquez sur ⟳ dans l'extension pour forcer la sync |
