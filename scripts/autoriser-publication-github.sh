#!/usr/bin/env bash
set -euo pipefail
project=parlement-citoyen
number=1055602103191
pool=parlement-github
identity=publication-firebase
sa="$identity@$project.iam.gserviceaccount.com"
g=(gcloud --project="$project" --quiet)
[[ "$("${g[@]}" projects describe "$project" --format='value(projectNumber)')" == "$number" ]]
"${g[@]}" services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com firestore.googleapis.com compute.googleapis.com
"${g[@]}" iam service-accounts describe "$sa" >/dev/null 2>&1 || "${g[@]}" iam service-accounts create "$identity" --display-name='Publication GitHub de Parlement Citoyen'
"${g[@]}" iam workload-identity-pools describe "$pool" --location=global >/dev/null 2>&1 || "${g[@]}" iam workload-identity-pools create "$pool" --location=global --display-name='Parlement Citoyen GitHub'
condition="assertion.repository_id=='1470066020' && assertion.repository_owner_id=='331737602' && assertion.workflow_ref.startsWith('gkerckhofs-a11y/Parlement-Citoyen/.github/workflows/firebase-production.yml@') && (assertion.ref=='refs/heads/main' || assertion.ref.startsWith('refs/tags/publication-'))"
"${g[@]}" iam workload-identity-pools providers describe github --workload-identity-pool="$pool" --location=global >/dev/null 2>&1 || "${g[@]}" iam workload-identity-pools providers create-oidc github --workload-identity-pool="$pool" --location=global --display-name=GitHub --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' --attribute-condition="$condition"
"${g[@]}" iam service-accounts add-iam-policy-binding "$sa" --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository_id/1470066020" --role=roles/iam.workloadIdentityUser >/dev/null
for role in firebasehosting.admin firebaserules.admin cloudfunctions.developer serviceusage.serviceUsageConsumer firebase.viewer secretmanager.viewer; do
  "${g[@]}" projects add-iam-policy-binding "$project" --member="serviceAccount:$sa" --role="roles/$role" --condition=None >/dev/null
done
# Bootstrap under the project owner's existing Cloud Shell login, so GitHub
# never needs IAM administration, secret creation or billing permissions.
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
git clone -q https://github.com/gkerckhofs-a11y/Parlement-Citoyen.git "$dir/app"
cd "$dir/app"
git checkout -q 07d5b00bf6a6fe861908a8001284f5b07da77a41
firebase firestore:databases:get '(default)' --project "$project" >/dev/null 2>&1 || firebase firestore:databases:create '(default)' --location europe-west1 --project "$project"
if ! "${g[@]}" secrets describe PARLEMENT_ADMIN_KEY >/dev/null 2>&1; then
  openssl rand -hex 32 | tr -d '\n' | firebase functions:secrets:set PARLEMENT_ADMIN_KEY --project "$project" --data-file -
fi
npm ci --prefix functions
firebase deploy --project "$project" --only functions,firestore:rules,hosting
runtime=$("${g[@]}" functions describe parliament --gen2 --region=europe-west1 --format='value(serviceConfig.serviceAccountEmail)')
"${g[@]}" iam service-accounts add-iam-policy-binding "$runtime" --member="serviceAccount:$sa" --role=roles/iam.serviceAccountUser >/dev/null
echo 'Première publication terminée. GitHub peut publier les versions suivantes.'
