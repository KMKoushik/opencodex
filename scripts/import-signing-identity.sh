#!/usr/bin/env bash
set -euo pipefail
umask 077

# Trust changes are allowed ONLY on a disposable GitHub-hosted runner, never a developer's Mac.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted ]] || {
  echo 'Signing identity import is restricted to disposable GitHub-hosted runners.' >&2
  exit 1
}
[[ -n "${CSC_LINK:-}" && -n "${CSC_KEY_PASSWORD:-}" ]] || {
  echo 'Configure CSC_LINK and CSC_KEY_PASSWORD repository secrets before building a release.' >&2
  exit 1
}
directory="$RUNNER_TEMP/opencodex-signing"
mkdir "$directory"
printf '%s' "$CSC_LINK" | base64 --decode > "$directory/signing.p12"
openssl pkcs12 -in "$directory/signing.p12" -clcerts -nokeys \
  -passin env:CSC_KEY_PASSWORD -out "$directory/certificate.pem"
# Public fingerprint of the release identity. A changed secret must not silently strand installs.
fingerprint="$(openssl x509 -in "$directory/certificate.pem" -outform DER | shasum -a 256 | cut -d ' ' -f 1)"
[[ "$fingerprint" == d81bd29ad863a54a4569c97da94bd8948c4b2eeafbcbf1044c80e180e9be2c15 ]] || {
  echo 'The certificate does not match the pinned OpenCodex update identity. Restore the signing backup.' >&2
  exit 1
}
keychain="$directory/signing.keychain-db"
password="$(openssl rand -base64 48)"
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 7200 "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$directory/signing.p12" -k "$keychain" -P "$CSC_KEY_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" >/dev/null
# Squirrel verifies the new bundle against the installed bundle's designated requirement.
# This trust allows CI to sign; end users still get Gatekeeper's unnotarized-app warning.
sudo security add-trusted-cert -d -r trustRoot -p codeSign -k "$keychain" "$directory/certificate.pem"
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"
security find-identity -v -p codesigning "$keychain"
{
  printf 'CSC_KEYCHAIN=%s\n' "$keychain"
  printf 'CSC_NAME=OpenCodex Self-Signed\n'
  printf 'OPENCODEX_SELF_SIGNED=true\n'
} >> "$GITHUB_ENV"
