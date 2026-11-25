/* Regras de risco, grupos vulneráveis e texto do boletim */
"use strict";
const WMO = {0:"Céu limpo",1:"Poucas nuvens",2:"Parcialmente nublado",3:"Nublado",45:"Neblina",48:"Neblina com geada",
 51:"Garoa fraca",53:"Garoa",55:"Garoa forte",56:"Garoa congelante",57:"Garoa congelante",61:"Chuva fraca",63:"Chuva moderada",65:"Chuva forte",
 66:"Chuva congelante",67:"Chuva congelante",71:"Neve",73:"Neve",75:"Neve",77:"Granizo fino",80:"Pancadas de chuva fracas",81:"Pancadas de chuva",
 82:"Pancadas de chuva fortes",85:"Neve",86:"Neve",95:"Tempestade com raios",96:"Tempestade com granizo",99:"Tempestade forte com granizo"};
const DIAS = ["dom","seg","ter","qua","qui","sex","sáb"];

function avisosDeJaborandi(d){
  const out=[];
  for(const grupo of ["hoje","futuro"]) for(const a of (d[grupo]||[]))
    if((","+a.geocodes+",").includes(","+LOCAL.ibge+",")) out.push({...a,grupo});
  const ordem={"Grande Perigo":3,"Perigo":2,"Perigo Potencial":1};
  return out.sort((a,b)=>(a.inicio||"").localeCompare(b.inicio||"")||(ordem[b.severidade]||0)-(ordem[a.severidade]||0));
}
function corTexto(hex){const c=hex.replace("#","");const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);return (r*299+g*587+b*114)/1000<140}
function quando(a){
  const ini=new Date(a.inicio.replace(" ","T")), fim=new Date(a.fim.replace(" ","T"));
  const o={weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"};
  return ini.toLocaleString("pt-BR",o)+" até "+fim.toLocaleString("pt-BR",o);
}

const COR={verde:"var(--ok)",amarelo:"var(--amarelo)",laranja:"var(--laranja)",vermelho:"var(--vermelho)"};
function avaliarRiscos(p,avisos,radar){
  const d=p.daily, R=[];
  // Chuva vista pelo radar agora (só para o dia de hoje)
  if(radar){
    const forte=s=>/forte/.test(s||"");
    if(radar.chovendo) R.push(forte(radar.intensidadeAqui)
      ? {nivel:"laranja",rotulo:"Agora · radar",titulo:"Chuva forte agora em Jaborandi",quando:"",dicas:["Não atravesse ruas ou córregos alagados","Fique longe de árvores e campo aberto durante os raios"]}
      : {nivel:"amarelo",rotulo:"Agora · radar",titulo:"Chovendo agora em Jaborandi",quando:"",dicas:["Cuidado com piso molhado e pistas escorregadias"]});
    else if(radar.perto&&radar.perto.km<=30&&radar.tendencia==="se aproximando")
      R.push({nivel:forte(radar.perto.intensidade)?"laranja":"amarelo",rotulo:"Atenção · radar",titulo:`Chuva se aproximando (${radar.perto.km} km a ${radar.perto.direcao})`,quando:"",dicas:["Recolha roupas e objetos soltos e evite sair na próxima hora"]});
  }
  const dia=i=>({tmax:d.temperature_2m_max[i],sens:d.apparent_temperature_max[i],chuva:d.precipitation_sum[i],prob:d.precipitation_probability_max[i],
    umid:d.relative_humidity_2m_min[i],raj:d.wind_gusts_10m_max[i],uv:d.uv_index_max[i],code:d.weather_code[i]});
  const h=dia(0), a=dia(1);
  const pior=(f)=>Math.max(f(h),f(a));
  const quandoTxt=(f,lim)=>[f(h)>=lim?"hoje":null,f(a)>=lim?"amanhã":null].filter(Boolean).join(" e ");
  // versão das dicas do dia (rodízio, ver js/orientacoes.js)
  const iso=d.time[0], D=(k,n)=>escolher(DICAS_RISCO[k],iso,n);

  // Tempestade
  const temp=Math.max(h.code>=95?2:0,a.code>=95?2:0, avisos.some(x=>/tempestade/i.test(x.descricao))?2:0);
  if(temp) R.push({nivel:"laranja",rotulo:"Alerta",titulo:"Tempestades e raios",quando:"",dicas:D("tempestade",0)});
  // Chuva
  const mm=pior(x=>x.chuva);
  if(mm>=30||avisos.some(x=>/chuva/i.test(x.descricao))) R.push({nivel:mm>=50?"vermelho":"laranja",rotulo:mm>=50?"Alerta máximo":"Alerta",
    titulo:"Chuva forte",quando:quandoTxt(x=>x.chuva,30)||"previsto",dicas:D("chuvaForte",1)});
  else if(mm>=10) R.push({nivel:"amarelo",rotulo:"Atenção",titulo:"Chuva moderada",quando:quandoTxt(x=>x.chuva,10),dicas:D("chuvaModerada",1)});
  // Dengue (após chuva + calor)
  const chuva3=d.precipitation_sum.slice(0,3).reduce((s,v)=>s+(v||0),0);
  if(chuva3>=5&&pior(x=>x.tmax)>=25) R.push({nivel:"laranja",rotulo:"Atenção",titulo:"Dengue: água parada após a chuva",quando:"próximos dias",dicas:D("dengue",2)});
  // Calor
  const sens=pior(x=>x.sens), tmax=pior(x=>x.tmax);
  if(sens>=38||tmax>=36) R.push({nivel:"vermelho",rotulo:"Alerta",titulo:"Calor intenso",quando:quandoTxt(x=>Math.max(x.sens-3,x.tmax),35),dicas:D("calorIntenso",0)});
  else if(sens>=35||tmax>=33) R.push({nivel:"amarelo",rotulo:"Atenção",titulo:"Calor",quando:quandoTxt(x=>Math.max(x.sens-1,x.tmax),33),dicas:D("calor",0)});
  // Umidade
  const umin=Math.min(h.umid,a.umid);
  if(umin<30){const n=umin<12?["vermelho","Emergência"]:umin<20?["laranja","Alerta"]:["amarelo","Atenção"];
    R.push({nivel:n[0],rotulo:n[1],titulo:"Ar seco (umidade "+fmt(umin)+"%)",quando:"",dicas:D("arSeco",1)});}
  // Vento
  const raj=pior(x=>x.raj);
  if(raj>=60) R.push({nivel:"laranja",rotulo:"Alerta",titulo:"Ventos fortes (até "+fmt(raj)+" km/h)",quando:quandoTxt(x=>x.raj,60),dicas:D("vento",2)});
  // UV
  const uv=pior(x=>x.uv);
  if(uv>=8) R.push({nivel:uv>=11?"vermelho":"laranja",rotulo:uv>=11?"Extremo":"Muito alto",titulo:"Índice UV "+fmt(uv),quando:"",dicas:D("uv",0)});
  if(!R.length) R.push({nivel:"verde",rotulo:"Sem alertas",titulo:"Tempo sem riscos relevantes",quando:"",dicas:D("tranquilo",0)});
  return R;
}

const EMO={vermelho:"🔴",laranja:"🟠",amarelo:"🟡",verde:"🟢"};
const HEX={vermelho:"#c62828",laranja:"#ea6a12",amarelo:"#e0b400",verde:"#2f8f5b"};
function emojiAviso(a){return a.severidade==="Grande Perigo"?"🔴":a.severidade==="Perigo"?"🟠":"🟡"}
function corAviso(a){return a.severidade==="Grande Perigo"?"vermelho":a.severidade==="Perigo"?"laranja":"amarelo"}
function emojiEvento(t){t=t.toLowerCase();
  return /dengue/.test(t)?"🦟":/tempestade|raio/.test(t)?"⛈️":/chuva/.test(t)?"🌧️":/calor|onda/.test(t)?"🌡️":/seco|umidade/.test(t)?"🏜️":/vento/.test(t)?"💨":/uv/.test(t)?"☀️":/geada|frio/.test(t)?"🥶":"⚠️"}
function emojiTempo(code){return code>=95?"⛈️":code>=80?"🌦️":code>=61?"🌧️":code>=51?"🌦️":code>=45?"🌫️":code>=3?"☁️":code>=1?"⛅":"☀️"}
function tiposAtivos(R){const t=new Set();R.forEach(r=>{const s=r.titulo.toLowerCase();
  if(/tempestade/.test(s))t.add("tempestade"); if(/chuva/.test(s))t.add("chuva"); if(/calor/.test(s))t.add("calor");
  if(/seco/.test(s))t.add("seco"); if(/vento/.test(s))t.add("vento"); if(/dengue/.test(s))t.add("dengue")});return t}

/* Grupos vulneráveis, frases e dica da época: ver js/orientacoes.js */

function nomeDia(t,i){const dt=new Date(t+"T12:00");return i===0?"Hoje":i===1?"Amanhã":DIAS[dt.getDay()].replace(/^./,s=>s.toUpperCase())}
function montarBoletim(p,avisos,R,G){
  const agora=new Date(); const d=p.daily, c=p.current;
  const relev=R.filter(r=>r.nivel!=="verde");
  const nivelGeral=avisos.some(a=>a.severidade==="Grande Perigo")||relev.some(r=>r.nivel==="vermelho")?"vermelho":
    avisos.some(a=>a.severidade==="Perigo")||relev.some(r=>r.nivel==="laranja")?"laranja":relev.length||avisos.length?"amarelo":"verde";
  const faixa={vermelho:"🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥",laranja:"🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧",amarelo:"🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨",verde:"🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩"}[nivelGeral];
  const chamada={vermelho:"ALERTA MÁXIMO",laranja:"ALERTA",amarelo:"ATENÇÃO",verde:"TEMPO TRANQUILO"}[nivelGeral];
  const L_=[], SEP="━━━━━━━━━━━━━━━";
  L_.push(faixa);
  L_.push(`${EMO[nivelGeral]} *${chamada} · TEMPO E SAÚDE*`);
  L_.push("📍 *Jaborandi/SP*");
  L_.push("🗓️ "+agora.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})+" · ⏰ "+agora.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));
  L_.push(faixa);
  L_.push("");
  if(avisos.length){
    L_.push("🚨 *AVISOS OFICIAIS*");
    avisos.forEach(a=>L_.push(`> ${emojiAviso(a)} ${emojiEvento(a.descricao)} *${a.descricao}* · ${a.severidade} (${a.fonte||"INMET"})\n> 🕒 ${quando(a)}`));
    L_.push("");
  }
  L_.push(`${emojiTempo(c.weather_code)} *AGORA:* ${fmt(c.temperature_2m)}°C · ${(WMO[c.weather_code]||"").toLowerCase()}`);
  L_.push(`💧 Umidade ${fmt(c.relative_humidity_2m)}% · 💨 Vento ${fmt(c.wind_speed_10m)} km/h`);
  L_.push("");
  L_.push(SEP);
  L_.push("📊 *PREVISÃO*");
  for(let i=0;i<3;i++) L_.push(`${emojiTempo(d.weather_code[i])} *${nomeDia(d.time[i],i)}:* 🔻${fmt(d.temperature_2m_min[i])}° 🔺${fmt(d.temperature_2m_max[i])}° · ☔ ${fmt(d.precipitation_sum[i],0)} mm (${fmt(d.precipitation_probability_max[i])}%)`);
  L_.push(SEP);
  L_.push("");
  if(relev.length){
    L_.push("🩺 *CUIDADOS PARA TODOS*");
    relev.forEach(r=>{L_.push(`${EMO[r.nivel]} ${emojiEvento(r.titulo)} *${r.titulo.toUpperCase()}*`);r.dicas.forEach(x=>L_.push("▫️ "+x));L_.push("")});
  } else { L_.push("🟢 Sem riscos relevantes previstos. Continue se hidratando e eliminando água parada."); L_.push(""); }
  if(G.length){
    L_.push(SEP);
    L_.push("💙 *ATENÇÃO ESPECIAL*");
    L_.push("");
    G.forEach(g=>{L_.push(`${g.emoji} *${g.nome}*`);g.lista.forEach(x=>L_.push("▫️ "+x));L_.push("")});
  }
  L_.push(SEP);
  const ep=dicaDaEpoca(d.time[0]);
  if(ep){ L_.push(`${ep.emoji} *${ep.titulo.toUpperCase()}*`); L_.push("▫️ "+ep.texto); L_.push(""); L_.push(SEP); }
  L_.push("☎️ *EMERGÊNCIAS*");
  L_.push("🟠 *199* Defesa Civil · 🚒 *193* Bombeiros · 🚑 *192* SAMU");
  L_.push("");
  L_.push("📡 _Fontes: INMET e Defesa Civil (avisos oficiais), radar RainViewer e Open-Meteo (previsão)_");
  L_.push("🏥 *"+ASSINATURA+"*");
  return {texto:L_.join("\n"),nivelGeral,chamada};
}
