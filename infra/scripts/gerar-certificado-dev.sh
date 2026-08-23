#!/usr/bin/env bash
# Gera certificado autoassinado para desenvolvimento e homologacao interna.
# Producao usa certificado emitido por AC (Let's Encrypt via certbot no proxy).
set -euo pipefail

DESTINO="$(dirname "$0")/../certificados"
DOMINIO="${1:-localhost}"

mkdir -p "$DESTINO"

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DESTINO/spe.key" \
  -out "$DESTINO/spe.crt" \
  -subj "/C=BR/ST=Bahia/L=Salvador/O=Pesquisa Eleitoral/CN=$DOMINIO" \
  -addext "subjectAltName=DNS:$DOMINIO,DNS:localhost,IP:127.0.0.1"

chmod 600 "$DESTINO/spe.key"
echo "Certificado gerado em $DESTINO (valido por 365 dias, apenas para uso interno)."
