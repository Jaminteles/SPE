#!/bin/sh
# ===========================================================================
# Restauração de um backup gerado por backup-postgres.sh.
#
#   ./restaurar-postgres.sh /backups/spe-spe_hml-20260824-030000.dump
#
# O hash é conferido antes de qualquer coisa: restaurar arquivo corrompido em
# cima de base boa é o pior desfecho possível.
#
# A restauração NÃO roda sozinha em nenhum agendamento. É sempre ato
# deliberado, com a API parada.
# ===========================================================================
set -eu

ARQUIVO="${1:?informe o arquivo .dump}"
HOST="${POSTGRES_HOST:-db}"
USUARIO="${POSTGRES_USER:?defina POSTGRES_USER}"
BANCO="${POSTGRES_RESTORE_DB:?defina POSTGRES_RESTORE_DB (nunca restaure por cima da base de producao sem intencao)}"

if [ -f "$ARQUIVO.sha256" ]; then
  esperado=$(cat "$ARQUIVO.sha256")
  obtido=$(sha256sum "$ARQUIVO" | awk '{print $1}')
  if [ "$esperado" != "$obtido" ]; then
    echo "[restauracao] hash divergente — arquivo corrompido. Abortando." >&2
    exit 1
  fi
  echo "[restauracao] hash conferido."
else
  echo "[restauracao] AVISO: arquivo sem .sha256 ao lado; conferencia impossivel." >&2
fi

echo "[restauracao] restaurando $ARQUIVO em $BANCO@$HOST"
pg_restore --host="$HOST" --username="$USUARIO" --dbname="$BANCO" \
  --clean --if-exists --no-owner --exit-on-error "$ARQUIVO"

echo "[restauracao] concluida. Rode 'prisma migrate status' antes de subir a API."
