// Monitor de tempo e saúde – Jaborandi/SP
// Roda a cada 10 minutos no GitHub Actions e manda alerta para o celular pelo app ntfy.
// Fontes: INMET (avisos oficiais), Defesa Civil (alertas enviados à população), radar de chuva (RainViewer),
// Open-Meteo com 4 modelos (ECMWF, NOAA/GFS, DWD/ICON, UK Met Office) e previsão de 15 em 15 minutos.
// A cada rodada grava situacao.json, que o painel lê para mostrar a Defesa Civil e o estado do monitor.
//
// Uso:
//   node monitor.js            -> verifica e manda alertas novos
//   node monitor.js --teste    -> manda uma notificação de teste para o celular
//   node monitor.js --ver      -> mostra a análise na tela, sem mandar nada

"use strict";
const fs = require("fs");
const path = require("path");

const PASTA = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(PASTA, "config.json"), "utf8"));
// O tópico do ntfy não fica no código público: vem do segredo NTFY_TOPICO (GitHub) ou do arquivo topico.txt (PC)
CFG.ntfy_topico = process.env.NTFY_TOPICO || (fs.existsSync(path.join(PASTA, "topico.txt")) ? fs.readFileSync(path.join(PASTA, "topico.txt"), "utf8").trim() : CFG.ntfy_topico);
if (!CFG.ntfy_topico) { console.error("Sem tópico do ntfy (NTFY_TOPICO ou topico.txt)"); process.exit(1); }
const ARQ_ESTADO = path.join(PASTA, "estado.json");
const ARQ_LOG = path.join(PASTA, "monitor.log");
const ARQ_SITUACAO = path.join(PASTA, "situacao.json");
const { alertasDefesaCivil, radarDeChuva } = require("./fontes-extras.js");
const ARGS = process.argv.slice(2);
const SO_VER = ARGS.includes("--ver");

const MODELOS = [
  ["ecmwf_ifs025", "ECMWF (Europa)"],
  ["gfs_seamless", "GFS (NOAA/EUA)"],
  ["icon_seamless", "ICON (Alemanha)"],
  ["ukmo_seamless", "UK Met Office"],
];

function log(msg) {
  const linha = `[${new Date().toLocaleString("pt-BR")}] ${msg}`;
  console.log(linha);
  try {
    fs.appendFileSync(ARQ_LOG, linha + "\n");
    const txt = fs.readFileSync(ARQ_LOG, "utf8").split("\n");
    if (txt.length > 1500) fs.writeFileSync(ARQ_LOG, txt.slice(-1000).join("\n"));
  } catch {}
}
function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf8")); }
  catch { return { avisosVistos: [], enviados: {}, ultimoResumo: "", falhasInmet: 0 }; }
}
function salvarEstado(e) { fs.writeFileSync(ARQ_ESTADO, JSON.stringify(e, null, 2)); }

async function obterJSON(url, tentativas = 3) {
  let erro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "monitor-tempo-saude/1.0" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { erro = e; await new Promise(r => setTimeout(r, 3000)); }
  }
  throw erro;
}

const fmt = n => (n == null || isNaN(n)) ? "--" : Math.round(n).toString();
const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const horaLocal = () => Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
const quando = a => {
  const f = s => new Date(s.replace(" ", "T")).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `${f(a.inicio)} até ${f(a.fim)}`;
};

async function enviar({ titulo, mensagem, prioridade = 3, tags = [] }) {
  if (SO_VER) { log(`(só ver) ALERTA p${prioridade}: ${titulo} | ${mensagem.replace(/\n/g, " / ")}`); return; }
  const corpo = { topic: CFG.ntfy_topico, title: titulo, message: mensagem, priority: prioridade, tags, click: CFG.link_ao_tocar };
  const r = await fetch(CFG.ntfy_servidor, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("ntfy HTTP " + r.status);
  log(`ENVIADO p${prioridade}: ${titulo}`);
}

// Evita repetir o mesmo tipo de alerta antes do intervalo (horas), a não ser que o nível suba
function podeEnviar(est, chave, horas, nivel = 0) {
  const ant = est.enviados[chave];
  if (!ant) return true;
  if (nivel > (ant.nivel || 0)) return true;
  return Date.now() - ant.t > horas * 3600e3;
}
function marcar(est, chave, nivel = 0) { est.enviados[chave] = { t: Date.now(), nivel }; }

async function verificarInmet(est, alertas) {
  try {
    const d = await obterJSON("https://apiprevmet3.inmet.gov.br/avisos/ativos");
    est.falhasInmet = 0;
    const lista = [];
    for (const g of ["hoje", "futuro"]) for (const a of (d[g] || []))
      if (("," + a.geocodes + ",").includes("," + CFG.ibge + ",")) lista.push(a);
    const sev = { "Perigo Potencial": ["🟡", 3, "yellow_circle"], "Perigo": ["🟠", 4, "orange_circle"], "Grande Perigo": ["🔴", 5, "red_circle"] };
    for (const a of lista) {
      if (est.avisosVistos.includes(a.codigo)) continue;
      const [emo, pri, tag] = sev[a.severidade] || ["⚠️", 3, "warning"];
      const riscos = String(a.riscos || "").split(".")[0];
      alertas.push({
        titulo: `${emo} INMET: ${a.descricao} (${a.severidade})`,
        mensagem: `${CFG.cidade}\n🕒 ${quando(a)}\n${riscos}.\nToque para conferir no INMET e avisar a população.`,
        prioridade: pri, tags: [tag, "warning"], marcarAviso: a.codigo,
      });
    }
    est.avisosAtivos = lista.map(a => ({ descricao: a.descricao, severidade: a.severidade, inicio: a.inicio, fim: a.fim }));
    // guarda só os códigos ainda ativos + os novos (para não crescer para sempre)
    est.avisosVistos = est.avisosVistos.filter(c => lista.some(a => a.codigo === c));
    return lista;
  } catch (e) {
    est.falhasInmet = (est.falhasInmet || 0) + 1;
    log("INMET indisponível: " + e.message);
    if (est.falhasInmet === 6 && podeEnviar(est, "falha-inmet", 12)) {
      alertas.push({ titulo: "⚙️ Monitor: INMET fora do ar", mensagem: "Há 1 hora o site de avisos do INMET não responde. Confira manualmente em alertas2.inmet.gov.br.", prioridade: 2, tags: ["gear"], chave: "falha-inmet", horas: 12 });
    }
    return null;
  }
}

async function verificarDefesaCivil(est, alertas) {
  try {
    const lista = await alertasDefesaCivil(CFG);
    est.falhasDC = 0;
    est.dcVistos = est.dcVistos || [];
    const sev = { "Perigo Potencial": ["🟡", 4, "yellow_circle"], "Perigo": ["🟠", 4, "orange_circle"], "Grande Perigo": ["🔴", 5, "red_circle"] };
    for (const a of lista) {
      if (est.dcVistos.includes(a.codigo)) continue;
      const [emo, pri, tag] = sev[a.severidade] || ["⚠️", 4, "warning"];
      const ate = a.fim ? `
🕒 Válido até ${a.fim.slice(11)}${a.fim.slice(0, 10) !== hojeISO() ? " de " + a.fim.slice(8, 10) + "/" + a.fim.slice(5, 7) : ""}` : "";
      alertas.push({
        titulo: `${emo} Defesa Civil: ${a.evento.toLowerCase().replace(/^./, c => c.toUpperCase())}`,
        mensagem: `${a.texto}${ate}
${a.remetente}`,
        prioridade: pri, tags: [tag, "rotating_light"], marcarDC: a.codigo,
      });
    }
    est.dcVistos = est.dcVistos.filter(c => lista.some(a => a.codigo === c));
    return lista;
  } catch (e) {
    est.falhasDC = (est.falhasDC || 0) + 1;
    log("Defesa Civil indisponível: " + e.message);
    if (est.falhasDC === 6 && podeEnviar(est, "falha-dc", 12))
      alertas.push({ titulo: "⚙️ Monitor: Defesa Civil fora do ar", mensagem: "Há 1 hora o feed de alertas da Defesa Civil não responde. Os alertas por WhatsApp/SMS da Defesa Civil continuam valendo.", prioridade: 2, tags: ["gear"], chave: "falha-dc", horas: 12 });
    return null;
  }
}

async function verificarRadar(est, alertas) {
  try {
    const r = await radarDeChuva(CFG, 60);
    const L = CFG.limites, p = r.maisProxima, forte = s => /forte/.test(s || "");
    if (r.chovendoEmJaborandi) {
      const nivel = forte(r.intensidadeEmJaborandi) ? 2 : 1;
      if (podeEnviar(est, "radar-jab", 3, nivel)) alertas.push({
        titulo: nivel === 2 ? "🌧️ Chuva forte sobre Jaborandi agora" : "🌦️ Chovendo em Jaborandi agora",
        mensagem: `O radar mostra chuva ${r.intensidadeEmJaborandi} sobre a cidade${nivel === 2 ? ". Atenção a alagamentos e raios" : ""}.`,
        prioridade: nivel === 2 ? 4 : 2, tags: ["cloud_with_rain"], chave: "radar-jab", horas: 3, nivel,
      });
    } else if (p && p.km <= L.radar_aproximacao_km && r.tendencia === "se aproximando") {
      const nivel = forte(p.intensidade) ? 2 : 1;
      if (podeEnviar(est, "radar-aprox", 2, nivel)) alertas.push({
        titulo: `${nivel === 2 ? "⛈️" : "🌦️"} Chuva a ${p.km} km, vindo para Jaborandi`,
        mensagem: `O radar mostra chuva ${p.intensidade} a ${p.km} km, a ${p.direcao}, chegando mais perto (${r.kmEm30min} km em 30 min).`,
        prioridade: nivel === 2 ? 4 : 3, tags: ["umbrella"], chave: "radar-aprox", horas: 2, nivel,
      });
    }
    return r;
  } catch (e) { log("Radar indisponível: " + e.message); return null; }
}

async function verificarModelos(est, alertas) {
  const L = CFG.limites;
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${CFG.latitude}&longitude=${CFG.longitude}&timezone=America%2FSao_Paulo`;
  const res = { modelos: [] };
  try {
    const j = await obterJSON(`${base}&hourly=precipitation,wind_gusts_10m,weather_code&models=${MODELOS.map(m => m[0]).join(",")}&forecast_hours=6`);
    const h = j.hourly;
    for (const [id, nome] of MODELOS) {
      const cod = (h["weather_code_" + id] || []).filter(v => v != null);
      const raj = (h["wind_gusts_10m_" + id] || []).filter(v => v != null);
      const chu = (h["precipitation_" + id] || []).filter(v => v != null);
      if (!cod.length && !raj.length) continue;
      res.modelos.push({ nome, tempestade: cod.some(c => c >= 95), rajada: raj.length ? Math.max(...raj) : null, chuva: chu.reduce((s, v) => s + v, 0) });
    }
  } catch (e) { log("Modelos indisponíveis: " + e.message); }

  const ms = res.modelos;
  if (ms.length) {
    const comTemp = ms.filter(m => m.tempestade);
    const rajMax = Math.max(...ms.map(m => m.rajada || 0));
    const chuvaMax = Math.max(...ms.map(m => m.chuva));
    if (comTemp.length >= L.modelos_minimos_tempestade) {
      const nivel = comTemp.length >= 3 ? 2 : 1;
      if (podeEnviar(est, "tempestade-6h", 4, nivel)) alertas.push({
        titulo: `⛈️ Risco de tempestade nas próximas 6 h`,
        mensagem: `${comTemp.length} de ${ms.length} modelos indicam tempestade em ${CFG.cidade}: ${comTemp.map(m => m.nome).join(", ")}.\nRajadas até ${fmt(rajMax)} km/h · chuva até ${fmt(chuvaMax)} mm.`,
        prioridade: nivel === 2 ? 4 : 3, tags: ["cloud_with_lightning_and_rain"], chave: "tempestade-6h", horas: 4, nivel,
      });
    }
    const fortes = ms.filter(m => (m.rajada || 0) >= L.rajada_alerta_kmh);
    const moderados = ms.filter(m => (m.rajada || 0) >= L.rajada_atencao_kmh);
    if (fortes.length >= 2) {
      if (podeEnviar(est, "vento-6h", 6, 2)) alertas.push({ titulo: `💨 Ventos fortes nas próximas 6 h`, mensagem: `${fortes.length} de ${ms.length} modelos preveem rajadas acima de ${L.rajada_alerta_kmh} km/h (até ${fmt(rajMax)} km/h). Risco de queda de árvores e falta de energia.`, prioridade: 4, tags: ["dash"], chave: "vento-6h", horas: 6, nivel: 2 });
    } else if (moderados.length >= 2) {
      if (podeEnviar(est, "vento-6h", 6, 1)) alertas.push({ titulo: `💨 Atenção: rajadas de vento`, mensagem: `${moderados.length} de ${ms.length} modelos preveem rajadas de ${L.rajada_atencao_kmh} a ${fmt(rajMax)} km/h nas próximas 6 h.`, prioridade: 3, tags: ["dash"], chave: "vento-6h", horas: 6, nivel: 1 });
    }
  }

  // Próximas 2 horas, de 15 em 15 minutos
  try {
    const j = await obterJSON(`${base}&minutely_15=precipitation,wind_gusts_10m,weather_code&forecast_minutely_15=8`);
    const m = j.minutely_15;
    const chuva2h = m.precipitation.reduce((s, v) => s + (v || 0), 0);
    const raj2h = Math.max(...m.wind_gusts_10m.map(v => v || 0));
    const temp2h = m.weather_code.some(c => c >= 95);
    res.agora = { chuva2h, raj2h, temp2h };
    if (chuva2h >= L.chuva_2h_mm && podeEnviar(est, "chuva-2h", 2)) alertas.push({ titulo: `🌧️ Chuva forte nas próximas 2 h`, mensagem: `Previsão de ${fmt(chuva2h)} mm em ${CFG.cidade} nas próximas 2 horas${temp2h ? ", com raios" : ""}. Risco de alagamentos.`, prioridade: 4, tags: ["cloud_with_rain"], chave: "chuva-2h", horas: 2 });
    if (raj2h >= L.rajada_alerta_kmh && podeEnviar(est, "vento-2h", 2)) alertas.push({ titulo: `💨 Rajadas fortes nas próximas 2 h`, mensagem: `Rajadas de até ${fmt(raj2h)} km/h previstas em ${CFG.cidade}.`, prioridade: 4, tags: ["dash"], chave: "vento-2h", horas: 2 });
  } catch (e) { log("Previsão de 15 min indisponível: " + e.message); }
  return res;
}

async function verificarDia(est, alertas, avisos) {
  const L = CFG.limites;
  try {
    const j = await obterJSON(`https://api.open-meteo.com/v1/forecast?latitude=${CFG.latitude}&longitude=${CFG.longitude}&timezone=America%2FSao_Paulo&forecast_days=2&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,relative_humidity_2m_min,wind_gusts_10m_max`);
    const d = j.daily, hoje = hojeISO();
    const nomes = ["hoje", "amanhã"];
    [0, 1].forEach(i => {
      if (d.apparent_temperature_max[i] >= L.sensacao_calor_c && podeEnviar(est, "calor-" + d.time[i], 48))
        alertas.push({ titulo: `🌡️ Calor intenso ${nomes[i]}`, mensagem: `Sensação térmica de até ${fmt(d.apparent_temperature_max[i])}°C em ${CFG.cidade}. Reforce hidratação para idosos, crianças, hipertensos e diabéticos.`, prioridade: 3, tags: ["thermometer"], chave: "calor-" + d.time[i], horas: 48 });
      if (d.relative_humidity_2m_min[i] < L.umidade_baixa_pct && podeEnviar(est, "seco-" + d.time[i], 48))
        alertas.push({ titulo: `🏜️ Ar muito seco ${nomes[i]}`, mensagem: `Umidade mínima de ${fmt(d.relative_humidity_2m_min[i])}% em ${CFG.cidade}. Evite exercício ao ar livre das 10h às 16h.`, prioridade: 3, tags: ["desert"], chave: "seco-" + d.time[i], horas: 48 });
    });
    // Resumo da manhã, uma vez por dia
    if (est.ultimoResumo !== hoje && horaLocal() >= CFG.resumo_diario_hora) {
      const av = (avisos || []).filter(a => a.inicio.slice(0, 10) <= hoje && a.fim.slice(0, 10) >= hoje);
      const txtAv = av.length ? av.map(a => `${a.descricao} (${a.severidade})`).join(", ") : "nenhum aviso do INMET";
      alertas.push({
        titulo: `☀️ Bom dia! Tempo hoje em ${CFG.cidade}`,
        mensagem: `${fmt(d.temperature_2m_min[0])}° a ${fmt(d.temperature_2m_max[0])}° · chuva ${fmt(d.precipitation_sum[0])} mm (${fmt(d.precipitation_probability_max[0])}%) · umidade mín. ${fmt(d.relative_humidity_2m_min[0])}%.\nAvisos: ${txtAv}.\nAbra o painel para gerar os cards do dia.`,
        prioridade: 2, tags: ["sunrise"], resumo: hoje,
      });
    }
  } catch (e) { log("Previsão diária indisponível: " + e.message); }
}

async function principal() {
  if (ARGS.includes("--teste")) {
    await enviar({ titulo: "✅ Teste: alertas de Jaborandi funcionando", mensagem: "Você vai receber aqui os avisos do INMET e da Defesa Civil, chuva vista pelo radar, riscos de tempestade, ventos fortes, calor e ar seco.", prioridade: 3, tags: ["white_check_mark"] });
    return;
  }
  const est = lerEstado();
  est.enviados = est.enviados || {};
  const alertas = [];
  const avisos = await verificarInmet(est, alertas);
  const dc = await verificarDefesaCivil(est, alertas);
  const radar = await verificarRadar(est, alertas);
  const modelos = await verificarModelos(est, alertas);
  await verificarDia(est, alertas, avisos);

  // Ordem: mais grave primeiro
  alertas.sort((a, b) => b.prioridade - a.prioridade);
  for (const a of alertas) {
    try {
      await enviar(a);
      if (SO_VER) continue;
      if (a.marcarAviso) est.avisosVistos.push(a.marcarAviso);
      if (a.marcarDC) est.dcVistos.push(a.marcarDC);
      if (a.chave) marcar(est, a.chave, a.nivel || 0);
      if (a.resumo) est.ultimoResumo = a.resumo;
    } catch (e) { log("Falha ao enviar alerta: " + e.message); }
  }
  est.ultimaVerificacao = new Date().toISOString();
  est.modelos = modelos;
  // limpa marcações antigas (mais de 3 dias)
  for (const k of Object.keys(est.enviados)) if (Date.now() - est.enviados[k].t > 72 * 3600e3) delete est.enviados[k];
  if (!SO_VER) salvarEstado(est);
  // resumo público para o painel (sem o tópico do ntfy)
  const situacao = {
    atualizado: est.ultimaVerificacao,
    intervaloMin: 10,
    defesaCivil: dc, defesaCivilOk: dc !== null,
    radar,
    inmet: avisos ? est.avisosAtivos : null,
  };
  try { fs.writeFileSync(ARQ_SITUACAO, JSON.stringify(situacao)); } catch (e) { log("Falha ao gravar situacao.json: " + e.message); }
  const txtRadar = radar ? (radar.chovendoEmJaborandi ? "chovendo na cidade" : radar.maisProxima ? `chuva a ${radar.maisProxima.km} km (${radar.tendencia || "?"})` : "sem chuva em 60 km") : "sem resposta";
  log(`Verificação concluída: ${alertas.length} alerta(s) ${SO_VER ? "(só ver)" : "novo(s)"}; modelos lidos: ${modelos.modelos.length}; INMET: ${avisos ? avisos.length + " aviso(s)" : "sem resposta"}; Defesa Civil: ${dc ? dc.length + " alerta(s)" : "sem resposta"}; radar: ${txtRadar}`);
  if (SO_VER) console.log(JSON.stringify(modelos, null, 2));
}

principal().catch(e => { log("Erro geral: " + (e.stack || e.message)); process.exitCode = 1; });
