#!/usr/bin/env bash
# Monitor 24 h no GitHub Actions.
# O agendador do GitHub (cron) atrasa ou pula execuções, por isso o monitor fica rodando num laço:
# verifica a cada 10 minutos durante ~5h30 e, no fim, a própria execução dispara a próxima (passo
# "Religar o monitor" do workflow). O cron fica só de reserva, para religar se o laço cair.
#
# Entre uma verificação e outra, o estado (avisos já enviados) e o resumo para o painel (situacao.json)
# ficam guardados no ramo "dados" do repositório, que o painel lê em raw.githubusercontent.com.
set -u
cd "$(dirname "$0")/.."

DURACAO_MIN=${DURACAO_MIN:-330}
AUTH="$(git config --get http.https://github.com/.extraheader || true)"
REMOTO="https://github.com/${GITHUB_REPOSITORY}.git"

# recupera o estado salvo pela execução anterior
if git -c http.https://github.com/.extraheader="$AUTH" fetch -q --depth 1 "$REMOTO" dados 2>/dev/null; then
  git show FETCH_HEAD:estado.json > monitor/estado.json 2>/dev/null && echo "Estado anterior recuperado." || rm -f monitor/estado.json
else
  echo "Ramo dados ainda não existe: começando com estado vazio."
fi

publicar() {
  local tmp; tmp=$(mktemp -d)
  cp monitor/situacao.json monitor/estado.json "$tmp"/ 2>/dev/null || true
  tail -n 300 monitor/monitor.log > "$tmp/ultimas-verificacoes.log" 2>/dev/null || true
  git -C "$tmp" init -q -b dados
  git -C "$tmp" add -A
  git -C "$tmp" -c user.name="Monitor Radar do Tempo" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -qm "Situação de $(date '+%d/%m %H:%M')"
  # um único commit, sempre substituído: o ramo não cresce
  git -C "$tmp" -c http.https://github.com/.extraheader="$AUTH" push -qf "$REMOTO" dados \
    || echo "Falha ao publicar a situação (a próxima rodada tenta de novo)."
  rm -rf "$tmp"
}

FIM=$(( $(date +%s) + DURACAO_MIN * 60 ))
while :; do
  timeout 8m node monitor/monitor.js || echo "Verificação falhou (código $?)."
  publicar
  agora=$(date +%s)
  [ "$agora" -ge "$FIM" ] && break
  # próxima rodada no próximo múltiplo de 10 min (+20 s, para o radar já ter o quadro novo)
  espera=$(( 600 - agora % 600 + 20 ))
  sleep "$espera"
done
echo "Laço encerrado; o workflow vai religar o monitor."
