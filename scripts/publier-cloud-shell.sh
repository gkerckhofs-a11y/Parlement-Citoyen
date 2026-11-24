#!/usr/bin/env bash
set -euo pipefail
project=parlement-citoyen
repo=https://github.com/gkerckhofs-a11y/Parlement-Citoyen.git
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
git clone --quiet "$repo" "$dir/app"
cd "$dir/app"
git checkout -q 9c7ddf721be432baf0ccd0b8b6ce333572c82d02
if ! gcloud projects describe "$project" >/dev/null 2>&1; then
  firebase projects:create "$project" --display-name "Parlement Citoyen"
fi
name=$(gcloud projects describe "$project" --format='value(name)')
[[ "$name" == 'Parlement Citoyen' ]] || { echo "Le projet cible ne correspond pas."; exit 1; }
billing=$(gcloud billing projects describe "$project" --format='value(billingEnabled)')
if [[ "${billing,,}" != true ]]; then
  echo "Projet créé. Pour publier la fonction serveur, associez le forfait Blaze dans la console Firebase, puis relancez la même commande."
  echo "https://console.firebase.google.com/project/$project/usage/details"
  exit 1
fi
gcloud services enable firestore.googleapis.com secretmanager.googleapis.com --project "$project"
firebase firestore:databases:get '(default)' --project "$project" >/dev/null 2>&1 || firebase firestore:databases:create '(default)' --location europe-west1 --project "$project"
if ! gcloud secrets describe PARLEMENT_ADMIN_KEY --project "$project" >/dev/null 2>&1; then
  read -rsp 'Choisis ta clé privée de régie (16 caractères minimum) : ' cle
  echo
  [[ ${#cle} -ge 16 ]] || { echo 'Clé trop courte.'; exit 1; }
  printf '%s' "$cle" | firebase functions:secrets:set PARLEMENT_ADMIN_KEY --data-file - --project "$project"
  unset cle
fi
npm ci --prefix functions
firebase deploy --only functions,firestore:rules,hosting --project "$project"
url="https://$project.web.app"
curl --fail --silent --show-error "$url/" | grep -q 'Parlement citoyen'
reply=$(curl -sS -H 'Content-Type: application/json' --data '{}' "$url/api/view")
node -e 'const r=JSON.parse(process.argv[1]); if(typeof r.error!=="string")process.exit(1)' "$reply"
echo "Parlement Citoyen publié et API joignable : $url"
