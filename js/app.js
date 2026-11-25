/* Sala de situação: carrega as fontes, calcula riscos e atualiza a tela */
"use strict";
const S = { avisos:[], inmet:[], dc:[], situacao:null, situacaoErro:false, radar:null, radarErro:false, prev:null, cidades:null, fontes:null, dia:0, grupoAberto:null, atualizado:{} };

/* ---------- carimbo "atualizado há" ---------- */
function carimbar(secao){ S.atualizado[secao]=Date.now(); tick(); }
function tick(){
  document.querySelectorAll("[data-carimbo]").forEach(el=>{
    const t=S.atualizado[el.dataset.carimbo]; if(!t){el.textContent="";return}
    const min=Math.floor((Date.now()-t)/60e3);
    el.textContent = min<1 ? "agora mesmo" : `há ${min} min`;
  });
  $("relogio").textContent = new Date().toLocaleTimeString("pt-BR");
}
async function girar(btn, fn){
  if(btn){btn.classList.add("girando");btn.disabled=true}
  try{ await fn(); } finally { if(btn){btn.classList.remove("girando");btn.disabled=false} }
}

/* ---------- avisos oficiais: INMET + Defesa Civil ---------- */
async function atualizarAvisos(){
  try{
    const d = await getJSON("https://apiprevmet3.inmet.gov.br/avisos/ativos");
    S.inmet = avisosDeJaborandi(d).map(a=>({...a,fonte:"INMET"})); S.erroAvisos=false; carimbar("avisos");
  }catch{ S.erroAvisos=true; }
  juntarAvisos();
}
// A Defesa Civil não libera o feed para navegadores: o monitor 24 h lê o feed e publica o resumo em situacao.json
const tituloEvento = s => String(s||"Alerta").toLowerCase().replace(/^./,c=>c.toUpperCase());
async function atualizarSituacao(){
  try{ S.situacao = await getJSON(SITUACAO_URL+"?t="+Date.now()); S.situacaoErro=false; }
  catch{ S.situacaoErro=true; }
  const agora=Date.now();
  S.dc = (S.situacao?.defesaCivil||[])
    .filter(a=>!a.fim || new Date(a.fim.replace(" ","T")) > agora)
    .map(a=>({...a, descricao:tituloEvento(a.evento), riscos:a.texto, grupo:"hoje"}));
  juntarAvisos(); renderMonitor();
}
function juntarAvisos(){ S.avisos=[...S.dc,...S.inmet]; renderAvisos(); recalcular(); }
function renderAvisos(){
  const box=$("lista-avisos");
  if(!S.avisos.length){
    box.innerHTML = S.erroAvisos
      ? '<div class="vazio">O INMET não respondeu agora. Confira em <a href="https://alertas2.inmet.gov.br" target="_blank" rel="noopener">alertas2.inmet.gov.br</a>.</div>'
      : '<div class="vazio">Nenhum aviso do INMET ou da Defesa Civil para Jaborandi agora.</div>';
    return;
  }
  box.innerHTML=S.avisos.map((a,i)=>`<button class="aviso" type="button" data-aviso="${i}" style="--c:${esc(a.aviso_cor)}">
    <span class="aviso-ico" aria-hidden="true">${emojiEvento(a.descricao)}</span>
    <span class="aviso-txt"><span class="fonte-tag${a.fonte==="Defesa Civil"?" dc":""}">${esc(a.fonte||"INMET")}</span><b>${esc(a.descricao)}</b><span class="sev">${esc(a.severidade)}</span>
    ${a.fonte==="Defesa Civil"?`<small class="dc-txt">${esc(a.texto)}</small>`:""}<small>${esc(quando(a))}</small></span></button>`).join("")
    + (S.erroAvisos?'<div class="vazio">O INMET não respondeu agora; mostrando só a Defesa Civil.</div>':"");
  box.querySelectorAll("[data-aviso]").forEach(b=>b.onclick=()=>{const a=S.avisos[+b.dataset.aviso];Mapa.focarAviso(a);$("aviso-detalhe").hidden=false;
    $("aviso-detalhe").innerHTML=`<b>${esc(a.fonte||"INMET")}: ${esc(a.descricao)} · ${esc(a.severidade)}</b><p>${esc(a.riscos)}</p><p class="mut">${esc(a.instrucoes||"")}${a.remetente?" · "+esc(a.remetente):""}</p>`});
}
// Status do monitor que manda os alertas para o celular
function renderMonitor(){
  const el=$("monitor-status"); if(!el) return;
  const t=S.situacao?.atualizado ? new Date(S.situacao.atualizado) : null;
  if(!t){ el.dataset.ok="?"; el.textContent = S.situacaoErro ? "Alertas no celular: não deu para conferir o monitor agora." : "Alertas no celular: conferindo o monitor…"; return; }
  const min=Math.round((Date.now()-t)/60e3), ok=min<=25;
  el.dataset.ok = ok?"sim":"nao";
  const idade = min<1?"agora mesmo":min<60?`há ${min} min`:`há ${Math.floor(min/60)} h ${min%60} min`;
  el.textContent = ok
    ? `Alertas no celular ativos · o monitor conferiu INMET, Defesa Civil e radar ${idade}`
    : `Monitor do celular parado: última verificação ${idade}. Os alertas no celular não estão chegando.`;
}

/* ---------- radar de chuva: lê a imagem do radar em volta de Jaborandi ---------- */
const NOME_INT=["","fraca","moderada a forte","muito forte"];
function intensidadeCor(r,g,b){ return r>200&&g<120?3 : r>200?2 : 1; }
function distKm(la1,lo1,la2,lo2){const r=Math.PI/180,a=Math.sin((la2-la1)*r/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin((lo2-lo1)*r/2)**2;return 12742*Math.asin(Math.sqrt(a))}
function rumo(la1,lo1,la2,lo2){const r=Math.PI/180,y=Math.sin((lo2-lo1)*r)*Math.cos(la2*r),x=Math.cos(la1*r)*Math.sin(la2*r)-Math.sin(la1*r)*Math.cos(la2*r)*Math.cos((lo2-lo1)*r);
  return ["norte","nordeste","leste","sudeste","sul","sudoeste","oeste","noroeste"][Math.round(((Math.atan2(y,x)/r)+360)%360/45)%8]}
async function quadroRadar(host,caminho,raioKm=60){
  const Z=7,n=2**Z,s=Math.sin(LOCAL.lat*Math.PI/180);
  const cx=(LOCAL.lon+180)/360*n*256, cy=(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n*256;
  const kmPx=40075*Math.cos(LOCAL.lat*Math.PI/180)/(n*256), rPx=Math.ceil(raioKm/kmPx);
  const x0=Math.floor((cx-rPx)/256),x1=Math.floor((cx+rPx)/256),y0=Math.floor((cy-rPx)/256),y1=Math.floor((cy+rPx)/256);
  const cv=document.createElement("canvas"); cv.width=(x1-x0+1)*256; cv.height=(y1-y0+1)*256;
  const ctx=cv.getContext("2d",{willReadFrequently:true}), pedidos=[];
  for(let tx=x0;tx<=x1;tx++) for(let ty=y0;ty<=y1;ty++) pedidos.push(new Promise((ok,erro)=>{const im=new Image();im.crossOrigin="anonymous";
    im.onload=()=>{ctx.drawImage(im,(tx-x0)*256,(ty-y0)*256);ok()};im.onerror=()=>erro(new Error("radar"));im.src=`${host}${caminho}/256/${Z}/${tx}/${ty}/2/1_1.png`}));
  await Promise.all(pedidos);
  const d=ctx.getImageData(0,0,cv.width,cv.height).data; let perto=null, aqui=0;
  for(let py=Math.floor(cy-rPx);py<=cy+rPx;py++) for(let px=Math.floor(cx-rPx);px<=cx+rPx;px++){
    const i=((py-y0*256)*cv.width+(px-x0*256))*4; if(d[i+3]<40) continue;
    const plon=(px+.5)/(n*256)*360-180, plat=Math.atan(Math.sinh(Math.PI*(1-2*(py+.5)/(n*256))))*180/Math.PI, km=distKm(LOCAL.lat,LOCAL.lon,plat,plon);
    if(km>raioKm) continue; const it=intensidadeCor(d[i],d[i+1],d[i+2]);
    if(km<=8) aqui=Math.max(aqui,it);
    if(!perto||km<perto.km) perto={km,lat:plat,lon:plon,it};
  }
  return {perto,aqui};
}
async function analisarRadar(){
  try{
    const info=await Mapa.recarregarRadar(), q=info.quadros, ult=q[q.length-1], ant=q[Math.max(0,q.length-4)];
    const a=await quadroRadar(info.host,ult.path); let b=null;
    if(ant!==ult) b=await quadroRadar(info.host,ant.path).catch(()=>null);
    const r={hora:new Date(ult.time*1000), chovendo:a.aqui>0, intensidadeAqui:NOME_INT[a.aqui]};
    if(a.perto) r.perto={km:Math.round(a.perto.km), direcao:rumo(LOCAL.lat,LOCAL.lon,a.perto.lat,a.perto.lon), intensidade:NOME_INT[a.perto.it]};
    if(a.perto&&b?.perto){const dif=b.perto.km-a.perto.km; r.tendencia=dif>4?"se aproximando":dif<-4?"se afastando":"quase parada"}
    else if(a.perto&&b&&!b.perto) r.tendencia="se formando";
    S.radar=r; S.radarErro=false; carimbar("radar");
  }catch(e){ console.warn(e); S.radarErro=true; }
  renderRadar(); recalcular();
}
function renderRadar(){
  const el=$("radar-agora"); if(!el) return; const r=S.radar;
  if(!r){ el.dataset.nivel="?"; el.innerHTML = S.radarErro ? "Radar indisponível agora. Veja o <a href=\"https://www.ipmetradar.com.br\" target=\"_blank\" rel=\"noopener\">radar do IPMet</a>." : "Lendo o radar…"; return; }
  const h=`<b>Radar ${hhmm(r.hora)}</b>`;
  if(r.chovendo){ el.dataset.nivel=/forte/.test(r.intensidadeAqui)?"laranja":"amarelo"; el.innerHTML=`${h} 🌧️ Chovendo em Jaborandi agora (chuva ${esc(r.intensidadeAqui)}).`; }
  else if(r.perto){ el.dataset.nivel=r.perto.km<=30&&r.tendencia==="se aproximando"?"amarelo":"ok";
    el.innerHTML=`${h} Sem chuva na cidade. Chuva mais próxima: ${esc(r.perto.intensidade)}, a ${r.perto.km} km a ${esc(r.perto.direcao)}${r.tendencia?", "+esc(r.tendencia):""}.`; }
  else { el.dataset.nivel="ok"; el.innerHTML=`${h} Sem chuva num raio de 60 km.`; }
}

/* ---------- previsão principal + cidades ---------- */
async function atualizarPrevisao(){
  const [p,c] = await Promise.allSettled([
    getJSON(`${OM}?${qs({latitude:LOCAL.lat,longitude:LOCAL.lon,timezone:"America/Sao_Paulo",forecast_days:7,
      current:"temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index",
      hourly:"temperature_2m,precipitation,precipitation_probability,weather_code",
      daily:"weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,relative_humidity_2m_min,wind_gusts_10m_max,uv_index_max"})}`),
    getJSON(`${OM}?${qs({latitude:CIDADES.map(c=>c[1]).join(","),longitude:CIDADES.map(c=>c[2]).join(","),timezone:"America/Sao_Paulo",forecast_days:2,daily:"precipitation_sum,temperature_2m_max"})}`)]);
  if(p.status==="fulfilled"){S.prev=p.value;carimbar("agora")}
  if(c.status==="fulfilled"){S.cidades=c.value;Mapa.desenharCidades(S.cidades)}
  renderAgora(); renderDias(); recalcular();
}
function renderAgora(){
  if(!S.prev) return; const c=S.prev.current;
  $("a-ico").textContent=emojiTempo(c.weather_code);
  $("a-temp").textContent=fmt(c.temperature_2m)+"°";
  $("a-desc").textContent=WMO[c.weather_code]||"—";
  $("a-sens").textContent="Sensação "+fmt(c.apparent_temperature)+"°";
  medidor("m-umid",c.relative_humidity_2m,100,fmt(c.relative_humidity_2m)+"%",c.relative_humidity_2m<30?"laranja":"ok");
  medidor("m-vento",c.wind_gusts_10m,100,fmt(c.wind_gusts_10m)+" km/h",c.wind_gusts_10m>=60?"vermelho":c.wind_gusts_10m>=45?"laranja":"ok",`de ${direcao(c.wind_direction_10m)}`);
  medidor("m-uv",c.uv_index,12,fmt(c.uv_index,0),c.uv_index>=8?"laranja":"ok");
  // gráfico das próximas 24 h
  const h=S.prev.hourly, ini=h.time.findIndex(t=>new Date(t)>=new Date(c.time)-36e5), fatia=[...Array(24)].map((_,k)=>ini+k).filter(i=>i>=0&&i<h.time.length);
  const W=600,H=120,mx=Math.max(4,...fatia.map(i=>h.precipitation[i]||0));
  const tmin=Math.min(...fatia.map(i=>h.temperature_2m[i])),tmax=Math.max(...fatia.map(i=>h.temperature_2m[i]));
  const x=k=>18+k*(W-36)/(fatia.length-1), yT=t=>16+(tmax-t)/((tmax-tmin)||1)*48;
  const barras=fatia.map((i,k)=>{const v=h.precipitation[i]||0,bh=v/mx*44;return `<rect x="${x(k)-7}" y="${H-22-bh}" width="14" height="${bh}" rx="2" fill="var(--chuva)"><title>${hhmm(new Date(h.time[i]))}: ${fmt(v,1)} mm</title></rect>`}).join("");
  const linha=fatia.map((i,k)=>`${k?"L":"M"}${x(k).toFixed(1)},${yT(h.temperature_2m[i]).toFixed(1)}`).join(" ");
  const rot=fatia.filter((_,k)=>k%4===0).map((i)=>{const k=fatia.indexOf(i);return `<text x="${x(k)}" y="${H-6}" text-anchor="middle">${new Date(h.time[i]).getHours()}h</text>`}).join("");
  const tt=fatia.filter((_,k)=>k%4===0).map(i=>{const k=fatia.indexOf(i);return `<text x="${x(k)}" y="${yT(h.temperature_2m[i])-6}" text-anchor="middle" class="t">${fmt(h.temperature_2m[i])}°</text>`}).join("");
  $("graf24").innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperatura e chuva nas próximas 24 horas">${barras}<path d="${linha}" fill="none" stroke="var(--quente)" stroke-width="2.5"/>${tt}${rot}</svg>`;
}
function medidor(id,v,max,txt,nivel,extra=""){
  const el=$(id); const p=Math.max(0,Math.min(1,(v||0)/max));
  el.querySelector("b").textContent=txt; el.querySelector("i").style.width=(p*100)+"%";
  el.querySelector("i").style.background=nivel==="ok"?"var(--accent)":COR[nivel]; el.querySelector("em").textContent=extra;
}
function renderDias(){
  if(!S.prev) return; const d=S.prev.daily;
  $("dias").innerHTML=d.time.map((t,i)=>{const nv=nivelDoDia(avisosDoDia(S.avisos,t));
    return `<button type="button" class="dia" data-dia="${i}" aria-pressed="${i===S.dia}" style="--c:${COR[nv]}">
      <span class="dn">${i===0?"Hoje":i===1?"Amanhã":DIAS[new Date(t+"T12:00").getDay()]+" "+new Date(t+"T12:00").getDate()}</span>
      <span class="de" aria-hidden="true">${emojiTempo(d.weather_code[i])}</span>
      <span class="dt num">${fmt(d.temperature_2m_min[i])}° · <b>${fmt(d.temperature_2m_max[i])}°</b></span>
      <span class="dc num">☔ ${fmt(d.precipitation_sum[i],0)} mm · ${fmt(d.precipitation_probability_max[i])}%</span>
      <span class="dnv">${nv==="verde"?"sem aviso":NIVEL_TXT[nv]}</span></button>`}).join("");
  $("dias").querySelectorAll("[data-dia]").forEach(b=>b.onclick=()=>{S.dia=+b.dataset.dia;renderDias();recalcular()});
}

/* ---------- 4 modelos + próximas 2 horas ---------- */
async function atualizarFontes(){
  try{
    const base={latitude:LOCAL.lat,longitude:LOCAL.lon,timezone:"America/Sao_Paulo"};
    const [rm,rq]=await Promise.all([
      getJSON(`${OM}?${qs({...base,hourly:"precipitation,wind_gusts_10m,weather_code",models:MODELOS.map(m=>m[0]).join(","),forecast_hours:6})}`),
      getJSON(`${OM}?${qs({...base,minutely_15:"precipitation,wind_gusts_10m,weather_code",forecast_minutely_15:8})}`)]);
    const hh=rm.hourly, ms=[];
    for(const [id,nome,orig] of MODELOS){const cod=(hh["weather_code_"+id]||[]).filter(v=>v!=null),raj=(hh["wind_gusts_10m_"+id]||[]).filter(v=>v!=null),chu=(hh["precipitation_"+id]||[]).filter(v=>v!=null);
      if(!cod.length&&!raj.length)continue;ms.push({nome,orig,tempestade:cod.some(c=>c>=95),rajada:raj.length?Math.max(...raj):0,chuva:chu.reduce((s,v)=>s+v,0)})}
    S.fontes={ms,q:rq.minutely_15}; carimbar("fontes");
  }catch{ S.fontes=null; }
  renderFontes();
}
function renderFontes(){
  if(!S.fontes){$("modelos").innerHTML='<div class="vazio">Modelos indisponíveis agora.</div>';return}
  const {ms,q}=S.fontes, n=ms.filter(x=>x.tempestade).length;
  const rmax=Math.max(60,...ms.map(x=>x.rajada)), cmax=Math.max(10,...ms.map(x=>x.chuva));
  $("consenso-n").textContent=`${n}/${ms.length}`;
  $("consenso").style.setProperty("--p",(n/ms.length*100)+"%");
  $("consenso").dataset.nivel = n>=3?"alto":n===2?"medio":"baixo";
  $("consenso-txt").textContent = n>=3?"Forte concordância de tempestade":n===2?"Concordância parcial: acompanhe":n===1?"Só 1 modelo vê tempestade":"Nenhum modelo vê tempestade";
  $("modelos").innerHTML=ms.map(x=>`<div class="modelo${x.tempestade?" tem":""}"><span class="mn"><b>${esc(x.nome)}</b><small>${esc(x.orig)}</small></span>
    <span class="mt">${x.tempestade?"⛈️ tempestade":"sem tempestade"}</span>
    <span class="barra" title="Rajada máxima"><i style="width:${x.rajada/rmax*100}%;background:${x.rajada>=60?"var(--vermelho)":x.rajada>=45?"var(--laranja)":"var(--accent)"}"></i><em>${fmt(x.rajada)} km/h</em></span>
    <span class="barra" title="Chuva em 6 horas"><i style="width:${x.chuva/cmax*100}%;background:var(--chuva)"></i><em>${fmt(x.chuva,0)} mm</em></span></div>`).join("");
  // próximas 2 horas em blocos de 15 min
  const mx=Math.max(2,...q.precipitation.map(v=>v||0));
  $("prox2h").innerHTML=q.time.map((t,i)=>{const v=q.precipitation[i]||0,g=q.wind_gusts_10m[i]||0,r=q.weather_code[i]>=95;
    return `<div class="q15${r?" raio":""}" title="${hhmm(new Date(t))}: ${fmt(v,1)} mm, rajada ${fmt(g)} km/h"><span class="qb"><i style="height:${Math.max(4,v/mx*100)}%"></i></span>
      <span class="qv num">${fmt(v,1)}</span><span class="qh num">${hhmm(new Date(t))}</span>${r?'<span class="qr" aria-label="raios">⚡</span>':""}</div>`}).join("");
  const tot=q.precipitation.reduce((s,v)=>s+(v||0),0), gm=Math.max(...q.wind_gusts_10m.map(v=>v||0));
  $("prox2h-res").textContent=`Total ${fmt(tot,1)} mm · rajada máx. ${fmt(gm)} km/h${q.weather_code.some(c=>c>=95)?" · ⚡ raios prováveis":""}`;
}

/* ---------- riscos, recomendações, cards ---------- */
function prevDoDia(i){
  if(i===0) return S.prev;
  const d=S.prev.daily, sh={}; for(const k in d) sh[k]=d[k].slice(i);
  return {...S.prev, daily:sh};
}
function recalcular(){
  if(!S.prev) return;
  const dia=S.dia, p=prevDoDia(dia), dataDia=S.prev.daily.time[dia];
  const avDia = dia===0 ? S.avisos : avisosDoDia(S.avisos,dataDia);
  let R=avaliarRiscos(p,avDia,dia===0?S.radar:null); if(dia>0) R=R.map(r=>({...r,quando:""}));
  const G=cuidadosPorGrupo(R);
  // nível geral (cabeçalho e mapa)
  const nivelHoje=nivelDoDia(avisosDoDia(S.avisos,S.prev.daily.time[0]));
  const R0=avaliarRiscos(S.prev,S.avisos,S.radar), G0=cuidadosPorGrupo(R0), b0=montarBoletim(S.prev,S.avisos,R0,G0);
  document.documentElement.dataset.nivel=b0.nivelGeral;
  $("nivel-geral").textContent=b0.chamada;
  Mapa.desenharAvisos(S.avisos,nivelHoje);
  $("rec-titulo").textContent = dia===0?"hoje e amanhã":new Date(dataDia+"T12:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"});
  renderRiscos(R); renderGrupos(G);
  // cards e texto sempre do dia de hoje
  const b=b0;
  setMsg(b.texto);
  (document.fonts?.ready||Promise.resolve()).then(()=>{try{desenharCards(S.prev,S.avisos,R0,G0,b)}catch(e){console.error(e)}});
}
function renderRiscos(R){
  $("riscos").innerHTML=R.map(r=>`<article class="risco" style="--c:${COR[r.nivel]}"><header><span class="ri" aria-hidden="true">${emojiEvento(r.titulo)}</span>
    <span><span class="nivel">${esc(r.rotulo)}${r.quando?" · "+esc(r.quando):""}</span><h3>${esc(r.titulo)}</h3></span></header>
    <ul>${r.dicas.map(x=>"<li>"+esc(x)+"</li>").join("")}</ul></article>`).join("");
}
function renderGrupos(G){
  const ativos=new Set(G.map(g=>g.id));
  $("grupos-chips").innerHTML=GRUPOS.map(g=>`<button type="button" class="chip-g${ativos.has(g.id)?"":" apagado"}" data-g="${g.id}" aria-pressed="${S.grupoAberto===g.id}"><span aria-hidden="true">${g.emoji}</span>${esc(g.nome)}</button>`).join("");
  $("grupos-chips").querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>{S.grupoAberto=S.grupoAberto===b.dataset.g?null:b.dataset.g;renderGrupos(G)});
  const sel=S.grupoAberto&&GRUPOS.find(g=>g.id===S.grupoAberto);
  if(sel){
    const nomes={tempestade:"⛈️ Tempestade",chuva:"🌧️ Chuva",calor:"🌡️ Calor",seco:"🏜️ Ar seco",base:"📋 No dia a dia"};
    const at=tiposAtivos(avaliarRiscos(prevDoDia(S.dia),S.dia===0?S.avisos:avisosDoDia(S.avisos,S.prev.daily.time[S.dia]),S.dia===0?S.radar:null));
    $("grupos").innerHTML=`<article class="grupo aberto"><header><span class="ge">${sel.emoji}</span><h3>${esc(sel.nome)}</h3></header>
      <ul class="todas">${Object.entries(sel.dicas).map(([k,v])=>`<li class="${at.has(k)?"ativo":""}"><b>${nomes[k]||k}${at.has(k)?" · risco agora":""}</b>${esc(v)}</li>`).join("")}</ul></article>`;
  } else {
    $("grupos").innerHTML=G.map(g=>`<article class="grupo"><header><span class="ge">${g.emoji}</span><h3>${esc(g.nome)}</h3></header><p>${esc(g.lista[0])}</p></article>`).join("");
  }
}

/* ---------- texto do WhatsApp e cópia dos cards ---------- */
function setMsg(t){$("msg").value=t;$("btn-wa").href="https://wa.me/?text="+encodeURIComponent(t)}
$("msg").addEventListener("input",()=>{$("btn-wa").href="https://wa.me/?text="+encodeURIComponent($("msg").value)});
$("btn-copiar").onclick=()=>{const t=$("msg").value,ok=()=>aviso("Texto copiado. Cole no grupo do WhatsApp.");
  if(navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(ok,()=>{$("msg").select();document.execCommand("copy");ok()}); else {$("msg").select();document.execCommand("copy");ok()}};
document.querySelectorAll("[data-copiar]").forEach(btn=>btn.onclick=()=>{const id=btn.dataset.copiar,n=id.slice(-1);
  $(id).toBlob(b=>{if(!navigator.clipboard?.write||!window.ClipboardItem){aviso(`Este navegador não copia imagens. Use "Salvar card ${n}".`);return}
    navigator.clipboard.write([new ClipboardItem({"image/png":b})]).then(()=>aviso(`Card ${n} copiado. Abra o grupo e cole com Ctrl + V.`),()=>aviso(`Não deu para copiar. Use "Salvar card ${n}".`))},"image/png")});
let tAviso; function aviso(t){const el=$("toast");el.textContent=t;el.hidden=false;clearTimeout(tAviso);tAviso=setTimeout(()=>el.hidden=true,4500)}

/* ---------- notificações no computador ---------- */
function prepararNotif(){ if(!("Notification" in window)) return;
  if(Notification.permission==="default"){ $("btn-notif").hidden=false; $("btn-notif").onclick=()=>Notification.requestPermission().then(()=>{$("btn-notif").hidden=true}) } }
function notificarNovos(avisos){
  const vistos=new Set(store.get("avisosVistos")||[]), novos=avisos.filter(a=>!vistos.has(a.codigo));
  if(novos.length&&vistos.size&&"Notification" in window&&Notification.permission==="granted")
    novos.forEach(a=>new Notification(`Novo aviso ${a.fonte||"INMET"} – Jaborandi`,{body:`${a.descricao} (${a.severidade}) – ${a.texto||quando(a)}`}));
  if(novos.length&&vistos.size) aviso(`Novo aviso (${novos[0].fonte||"INMET"}): ${novos[0].descricao} (${novos[0].severidade})`);
  store.set("avisosVistos",avisos.map(a=>a.codigo));
}

/* ---------- ciclo automático ---------- */
let intervaloMin = store.get("intervaloMin") || 5, auto = store.get("auto") ?? true, proxima = 0;
let atualizando=false;
async function atualizarTudo(){
  // evita cargas repetidas enquanto a anterior ainda não terminou
  if(atualizando) return; atualizando=true;
  try{ await atualizarTudoAgora(); } finally { atualizando=false; }
}
async function atualizarTudoAgora(){
  proxima = Date.now()+intervaloMin*60e3;
  $("status-txt").textContent="Atualizando…";
  await Promise.allSettled([atualizarAvisos(),atualizarSituacao(),atualizarPrevisao(),atualizarFontes(),analisarRadar()]);
  notificarNovos(S.avisos);
  Mapa.recarregarNuvens(); Mapa.recarregarChuva(); if(Mapa.ventoLigado()) Mapa.carregarVento().catch(()=>{});
  carimbar("mapa");
  const ok=!S.erroAvisos&&!S.situacaoErro&&!S.radarErro&&S.prev&&S.fontes;
  $("status").dataset.ok=ok?"sim":"nao";
  $("status-txt").textContent=ok?"AO VIVO":"PARCIAL";
  proxima = Date.now()+intervaloMin*60e3;
}
function contagem(){
  const anel=$("anel");
  if(!auto){anel.style.setProperty("--p","0");$("cont").textContent="pausado";return}
  const rest=Math.max(0,proxima-Date.now()), tot=intervaloMin*60e3;
  anel.style.setProperty("--p",((1-rest/tot)*100).toFixed(1));
  $("cont").textContent=`${Math.floor(rest/60e3)}:${String(Math.floor(rest/1e3)%60).padStart(2,"0")}`;
  if(rest<=0 && !document.hidden) atualizarTudo();
}
$("sel-intervalo").value=String(intervaloMin);
$("sel-intervalo").onchange=e=>{intervaloMin=+e.target.value;store.set("intervaloMin",intervaloMin);proxima=Date.now()+intervaloMin*60e3};
$("btn-auto").setAttribute("aria-pressed",auto);
$("btn-auto").onclick=()=>{auto=!auto;store.set("auto",auto);$("btn-auto").setAttribute("aria-pressed",auto);$("btn-auto").textContent=auto?"Automático ligado":"Automático pausado";if(auto)proxima=Date.now()+intervaloMin*60e3};
$("btn-auto").textContent=auto?"Automático ligado":"Automático pausado";
$("btn-tudo").onclick=e=>girar(e.currentTarget,atualizarTudo);
document.querySelectorAll("[data-atualizar]").forEach(b=>b.onclick=()=>girar(b,{
  avisos:()=>Promise.allSettled([atualizarAvisos(),atualizarSituacao()]), agora:()=>Promise.allSettled([atualizarPrevisao(),analisarRadar()]), fontes:atualizarFontes,
  mapa:async()=>{await analisarRadar();Mapa.recarregarNuvens();Mapa.recarregarChuva();if(Mapa.ventoLigado())await Mapa.carregarVento();carimbar("mapa")}
}[b.dataset.atualizar]));
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && auto && Date.now()>proxima) atualizarTudo(); });

prepararNotif();
setInterval(()=>{tick();contagem()},1000);
setInterval(renderMonitor,30e3);
atualizarTudo();

// logo
$("logo").innerHTML=logoSVG();
$("btn-logo").addEventListener("click",baixarLogoGrupo);
