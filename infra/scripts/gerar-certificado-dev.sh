#!/usr/bin/env bash
# Gera certificado autoassinado para desenvolvimento e homologacao interna.
# Producao usa certificado emitido por AC (Let's Encrypt via certbot no proxy).
set -euo pipefail

DESTINO="$(dirname "$0")/../certificados"
DOMINIO="${1:-localhost}"

# No Git Bash/MSYS, argumentos que comecam com barra viram caminho do Windows —
# o "/C=BR/ST=..." abaixo chegaria ao openssl como "C:/Program Files/Git/C=BR/...".
# Inofensivo em Linux e macOS, onde a variavel nao e lida.
export MSYS2_ARG_CONV_EXCL='*'

mkdir -p "$DESTINO"

# Instaladores de terceiros (psqlODBC, por exemplo) deixam OPENSSL_CONF apontando
# para um arquivo que nao existe. O -addext abaixo precisa de config valida e
# falha por causa disso, com erro que nao menciona a variavel.
if [ -n "${OPENSSL_CONF:-}" ] && [ ! -f "$OPENSSL_CONF" ]; then
  echo "Aviso: OPENSSL_CONF aponta para arquivo inexistente; usando o padrao do openssl."
  unset OPENSSL_CONF
fi

# Um IP precisa entrar como `IP:` no subjectAltName. Emitido como `DNS:`, o
# Android e os navegadores ignoram a entrada e recusam a conexao mesmo com o
# certificado instalado — que e o caso do aplicativo apontado para o IP da
# maquina na rede local.
if printf '%s' "$DOMINIO" | grep -qE '^[0-9]+(\.[0-9]+){3}$'; then
  ALTERNATIVO="IP:$DOMINIO"
else
  ALTERNATIVO="DNS:$DOMINIO"
fi

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DESTINO/spe.key" \
  -out "$DESTINO/spe.crt" \
  -subj "/C=BR/ST=Bahia/L=Salvador/O=Pesquisa Eleitoral/CN=$DOMINIO" \
  -addext "subjectAltName=$ALTERNATIVO,DNS:localhost,IP:127.0.0.1"

chmod 600 "$DESTINO/spe.key"
echo "Certificado gerado em $DESTINO (valido por 365 dias, apenas para uso interno)."
