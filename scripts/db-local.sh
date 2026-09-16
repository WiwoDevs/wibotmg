#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MariaDB local para WiBot, sin root: datadir propio bajo .data/.
# Uso: bash scripts/db-local.sh {start|stop|status|import|shell}
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATADIR="$ROOT/.data/mysql"
RUNDIR="$ROOT/.data/run"
SOCK="$RUNDIR/mysql.sock"
PIDFILE="$RUNDIR/mysql.pid"
PORT="${DB_PORT:-3307}"
DBNAME="${DB_NAME:-mgcontact_local}"
PASSFILE="$ROOT/.data/localpass.txt"

morir() { echo "error: $*" >&2; exit 1; }

esta_vivo() {
  [[ -S "$SOCK" ]] && mariadb-admin --socket="$SOCK" -u wiwo ping >/dev/null 2>&1
}

arrancar() {
  if esta_vivo; then echo "MariaDB ya está arriba (socket $SOCK)"; return 0; fi
  [[ -d "$DATADIR" ]] || morir "no existe $DATADIR; corré primero 'mariadb-install-db --datadir=$DATADIR'"
  mkdir -p "$RUNDIR"
  nohup mariadbd \
    --datadir="$DATADIR" --socket="$SOCK" --port="$PORT" \
    --bind-address=127.0.0.1 --skip-name-resolve \
    --innodb-buffer-pool-size=512M --innodb-flush-log-at-trx-commit=2 \
    --pid-file="$PIDFILE" > "$ROOT/.data/mysqld.log" 2>&1 &
  for _ in $(seq 1 30); do
    esta_vivo && { echo "MariaDB arriba en 127.0.0.1:$PORT"; return 0; }
    sleep 1
  done
  morir "no arrancó; mirá $ROOT/.data/mysqld.log"
}

parar() {
  esta_vivo || { echo "MariaDB no estaba corriendo"; return 0; }
  mariadb-admin --socket="$SOCK" -u wiwo shutdown
  echo "MariaDB detenido"
}

importar() {
  local dump
  dump="$(ls -1t "$ROOT"/*.sql.gz 2>/dev/null | head -1)" || true
  [[ -n "${dump:-}" ]] || morir "no encontré ningún .sql.gz en $ROOT"
  esta_vivo || arrancar
  [[ -f "$PASSFILE" ]] || morir "falta $PASSFILE"
  echo "Importando $(basename "$dump") en $DBNAME ..."
  zcat "$dump" | mariadb --socket="$SOCK" -u wibot_admin -p"$(cat "$PASSFILE")" "$DBNAME"
  echo "Importación lista"
}

case "${1:-}" in
  start)  arrancar ;;
  stop)   parar ;;
  status) esta_vivo && echo "arriba" || { echo "abajo"; exit 1; } ;;
  import) importar ;;
  shell)  mariadb --socket="$SOCK" -u wibot -p"$(cat "$PASSFILE")" "$DBNAME" ;;
  *)      morir "uso: $0 {start|stop|status|import|shell}" ;;
esac
