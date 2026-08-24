#!/bin/sh
# ===========================================================================
# Backup periódico da base.
#
# Roda dentro de um container com o cliente do PostgreSQL, em laço: o
# agendamento é o próprio intervalo, sem depender de cron na máquina host.
#
# Formato custom (-Fc) de propósito: permite restauração seletiva de tabela e
# é comprimido. Cada arquivo sai com SHA-256 ao lado — backup que não se
# verifica é esperança, não backup.
#
# Nenhum dado sensível vai para log: o dump é binário e a senha vem por
# variável de ambiente (PGPASSWORD), nunca por argumento de linha de comando.
# ===========================================================================
set -eu

DESTINO="${BACKUP_DIR:-/backups}"
INTERVALO_HORAS="${BACKUP_INTERVALO_HORAS:-6}"
RETENCAO_DIAS="${BACKUP_RETENCAO_DIAS:-14}"
HOST="${POSTGRES_HOST:-db}"
USUARIO="${POSTGRES_USER:?defina POSTGRES_USER}"
BANCO="${POSTGRES_DB:?defina POSTGRES_DB}"

mkdir -p "$DESTINO"

registrar() {
  echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $1"
}

executar() {
  carimbo=$(date -u '+%Y%m%d-%H%M%S')
  arquivo="$DESTINO/spe-$BANCO-$carimbo.dump"
  parcial="$arquivo.parcial"

  registrar "iniciando dump de $BANCO"

  # Escreve em arquivo parcial e só renomeia no fim: dump interrompido nunca
  # é confundido com backup bom.
  if pg_dump --host="$HOST" --username="$USUARIO" --dbname="$BANCO" \
      --format=custom --compress=6 --file="$parcial"; then
    mv "$parcial" "$arquivo"
    sha256sum "$arquivo" | awk '{print $1}' > "$arquivo.sha256"
    registrar "ok: $(basename "$arquivo") ($(wc -c < "$arquivo") bytes)"
  else
    rm -f "$parcial"
    registrar "FALHA no dump de $BANCO"
    return 1
  fi

  # Retenção: o backup antigo sai junto com o hash dele.
  find "$DESTINO" -name 'spe-*.dump' -mtime "+$RETENCAO_DIAS" -print -delete || true
  find "$DESTINO" -name 'spe-*.dump.sha256' -mtime "+$RETENCAO_DIAS" -delete || true
}

registrar "rotina ativa: a cada ${INTERVALO_HORAS}h, retendo ${RETENCAO_DIAS} dias em $DESTINO"

while true; do
  executar || registrar "ciclo terminou com erro; tentando de novo no próximo intervalo"
  sleep "$((INTERVALO_HORAS * 3600))"
done
