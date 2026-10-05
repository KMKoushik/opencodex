#!/usr/bin/env bash
set -euo pipefail
umask 077

# Generate once, outside the repository. Replacing this identity strands existing installs.
directory="${1:-$HOME/.config/opencodex/signing}"
mkdir -p "$(dirname "$directory")"
mkdir "$directory"
openssl rand -base64 48 > "$directory/password"
openssl req -newkey rsa:3072 -x509 -sha256 -days 7300 \
  -subj '/CN=OpenCodex Self-Signed' \
  -addext 'keyUsage=critical,digitalSignature' \
  -addext 'extendedKeyUsage=critical,codeSigning' \
  -keyout "$directory/private.pem" -passout "file:$directory/password" \
  -out "$directory/certificate.pem"
# Keychain's PKCS#12 importer needs the legacy PBE encoding, not OpenSSL 3's PBES2 default.
SIGNING_PASSWORD="$(cat "$directory/password")" \
openssl pkcs12 -export -legacy -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES \
  -in "$directory/certificate.pem" -inkey "$directory/private.pem" \
  -passin env:SIGNING_PASSWORD -passout env:SIGNING_PASSWORD \
  -name 'OpenCodex Self-Signed' -out "$directory/signing.p12"
openssl x509 -in "$directory/certificate.pem" -noout -fingerprint -sha256 -enddate
printf 'Private signing backup: %s\nKeep this directory safe. Never commit it or regenerate it for a release.\n' "$directory"
