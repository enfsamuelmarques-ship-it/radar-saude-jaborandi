/* Mapa interativo: radar de chuva, satélite, nuvens animadas (GOES-East), chuva por satélite, avisos, vento e cidades */
"use strict";
const GIBS="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/";
const ESRI="https://server.arcgisonline.com/ArcGIS/rest/services/";
const Mapa = (() => {
  const m = L.map("mapa",{zoomControl:false,attributionControl:true,minZoom:5,maxZoom:16}).setView([LOCAL.lat,LOCAL.lon],10);
  L.control.zoom({position:"bottomright"}).addTo(m);
  const bases = {
    satelite: L.layerGroup([
      L.tileLayer(ESRI+"World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:17,attribution:"Imagens © Esri, Maxar"}),
      L.tileLayer(ESRI+"Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",{maxZoom:17,pane:"overlayPane",opacity:.9})]),
    ruas: L.tileLayer(ESRI+"World_Street_Map/MapServer/tile/{z}/{y}/{x}",{maxZoom:17,attribution:"Mapa © Esri"}),
    escuro: L.layerGroup([
      L.tileLayer(ESRI+"Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",{maxZoom:16,attribution:"Mapa © Esri"}),
      L.tileLayer(ESRI+"Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",{maxZoom:16})])
  };
  let baseAtual = "satelite"; bases.satelite.addTo(m);

  // painéis para ordenar as camadas
  m.createPane("nuvens"); m.getPane("nuvens").style.zIndex=350;
  m.createPane("chuva"); m.getPane("chuva").style.zIndex=360;
  m.createPane("radar"); m.getPane("radar").style.zIndex=380;
  m.createPane("limites"); m.getPane("limites").style.zIndex=420;

  const cam = {
    radar: L.layerGroup().addTo(m),
    avisos: L.layerGroup().addTo(m),
    cidades: L.layerGroup().addTo(m),
    vento: L.layerGroup(),
    chuva: L.layerGroup(),
    limites: L.layerGroup().addTo(m)
  };

  // contornos: Jaborandi em destaque, vizinhos tracejados
  let poliJab = null;
  MALHA.forEach(mu => {
    const latlngs = mu.p.map(pl => pl.map(([x,y]) => [y,x]));
    if (mu.n === "Jaborandi") {
      poliJab = L.polygon(latlngs,{pane:"limites",color:"#ffffff",weight:3,fillColor:"#2f8f5b",fillOpacity:.18}).addTo(cam.limites);
      poliJab.bindTooltip("JABORANDI",{permanent:true,direction:"center",className:"rotulo-jab"});
    } else {
      L.polygon(latlngs,{pane:"limites",color:"#cfe7ea",weight:1.2,dashArray:"4 4",fill:false,interactive:false}).addTo(cam.limites);
    }
  });

  /* ---- nuvens por satélite com linha do tempo ---- */
  const PROD = {
    real: {id:"GOES-East_ABI_GeoColor", nivel:"Level7", ext:"jpeg", nome:"Nuvens (cor real)"},
    ir:   {id:"GOES-East_ABI_Band13_Clean_Infrared", nivel:"Level6", ext:"png", nome:"Nuvens (infravermelho)"}
  };
  let prod = "real", opac = .55, quadros = [], camQuadros = [], idx = 0, timer = null, nuvensLigadas = true;
  const camNuvens = L.layerGroup().addTo(m);
  // o satélite chega com 40 a 90 min de atraso: testa horários de 10 em 10 min até achar a imagem mais recente publicada
  function existe(t){ return new Promise(ok=>{ const p=PROD[prod], img=new Image(); img.onload=()=>ok(true); img.onerror=()=>ok(false);
    const tile = p.nivel==="Level7" ? "7/71/46" : "6/35/23"; // quadro que cobre Jaborandi
    img.src=`${GIBS}${p.id}/default/${t.toISOString().slice(0,19)}Z/GoogleMapsCompatible_${p.nivel}/${tile}.${p.ext}`; }); }
  async function acharUltimo(){
    const base = Math.floor((Date.now()-30*60e3)/600e3)*600e3;
    for(let k=0;k<20;k++){ const t=new Date(base-k*600e3); if(await existe(t)) return t; }
    return new Date(base-90*60e3);
  }
  async function calcularQuadros(){
    const ult = await acharUltimo();
    quadros = Array.from({length:12},(_,k)=>new Date(+ult-(11-k)*600e3));
  }
  const url = (t) => { const p=PROD[prod]; return `${GIBS}${p.id}/default/${t.toISOString().slice(0,19)}Z/GoogleMapsCompatible_${p.nivel}/{z}/{y}/{x}.${p.ext}`; };
  function camadaQuadro(t){ const p=PROD[prod]; return L.tileLayer(url(t),{pane:"nuvens",opacity:0,maxNativeZoom:p.nivel==="Level7"?7:6,maxZoom:17,attribution:"Satélite GOES-East © NOAA/NASA GIBS"}); }
  function mostrarQuadro(i){
    idx=i; camQuadros.forEach((l,k)=>l && l.setOpacity(k===i?opac:0));
    const t=quadros[i], atraso=Math.round((Date.now()-t)/60e3);
    $("sat-hora").textContent = `${hhmm(t)}${i===quadros.length-1?` · mais recente (${atraso} min atrás)`:""}`;
    $("sat-slider").value = i;
  }
  async function recarregarNuvens(){
    parar(); if(!nuvensLigadas) return; $("sat-hora").textContent="buscando imagem…";
    await calcularQuadros(); camNuvens.clearLayers(); camQuadros = quadros.map(()=>null);
    $("sat-slider").max = quadros.length-1;
    if(!nuvensLigadas) return;
    const i = quadros.length-1; camQuadros[i] = camadaQuadro(quadros[i]).addTo(camNuvens); mostrarQuadro(i);
  }
  function garantirQuadro(i){ if(!camQuadros[i]) camQuadros[i] = camadaQuadro(quadros[i]).addTo(camNuvens); }
  function tocar(){
    if(!nuvensLigadas) return;
    quadros.forEach((_,i)=>garantirQuadro(i));
    $("sat-play").textContent="⏸"; $("sat-play").setAttribute("aria-label","Pausar animação");
    let i = idx>=quadros.length-1 ? 0 : idx;
    timer = setInterval(()=>{ mostrarQuadro(i); i=(i+1)%quadros.length; }, 700);
  }
  function parar(){ if(timer){clearInterval(timer);timer=null} const b=$("sat-play"); if(b){b.textContent="▶";b.setAttribute("aria-label","Animar últimas 2 horas")} }
  $("sat-play").onclick = () => timer ? parar() : tocar();
  $("sat-slider").oninput = e => { parar(); const i=+e.target.value; garantirQuadro(i); mostrarQuadro(i); };
  $("sat-opac").oninput = e => { opac = +e.target.value/100; mostrarQuadro(idx); };
  document.querySelectorAll("[data-prod]").forEach(b => b.onclick = () => {
    document.querySelectorAll("[data-prod]").forEach(x=>x.setAttribute("aria-pressed", x===b));
    if(b.dataset.prod==="off"){ nuvensLigadas=false; parar(); camNuvens.clearLayers(); $("sat-hora").textContent="desligado"; return; }
    nuvensLigadas=true; prod=b.dataset.prod; recarregarNuvens();
  });
  document.querySelectorAll("[data-base]").forEach(b => b.onclick = () => {
    document.querySelectorAll("[data-base]").forEach(x=>x.setAttribute("aria-pressed", x===b));
    m.removeLayer(bases[baseAtual]); baseAtual=b.dataset.base; bases[baseAtual].addTo(m);
  });
  document.querySelectorAll("[data-cam]").forEach(b => b.onclick = () => {
    const c = cam[b.dataset.cam], on = b.getAttribute("aria-pressed")!=="true";
    b.setAttribute("aria-pressed", on); on ? c.addTo(m) : m.removeLayer(c);
    if(on && b.dataset.cam==="vento" && !cam.vento.getLayers().length) carregarVento();
  });
  $("btn-centro").onclick = () => m.flyTo([LOCAL.lat,LOCAL.lon],11,{duration:.8});
  $("btn-regiao").onclick = () => m.flyTo([LOCAL.lat,LOCAL.lon],8,{duration:.8});

  /* ---- radar de chuva (mosaico de radares RainViewer, atualizado a cada 10 min) ---- */
  // zoom 7 é o máximo do plano gratuito; acima disso a imagem é ampliada
  async function recarregarRadar(){
    const j = await getJSON(RADAR_API), q = j.radar?.past || [];
    if(!q.length) throw new Error("radar sem quadros");
    const ult = q[q.length-1];
    cam.radar.clearLayers();
    L.tileLayer(`${j.host}${ult.path}/256/{z}/{x}/{y}/2/1_1.png`,{pane:"radar",opacity:.85,maxNativeZoom:7,maxZoom:17,attribution:"Radar © RainViewer"}).addTo(cam.radar);
    return {host:j.host, quadros:q};
  }

  /* ---- chuva estimada por satélite (NASA IMERG) ---- */
  function recarregarChuva(){
    cam.chuva.clearLayers();
    L.tileLayer(GIBS+"IMERG_Precipitation_Rate_30min/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png?v="+Date.now(),
      {pane:"chuva",opacity:.85,maxNativeZoom:6,maxZoom:17,attribution:"Chuva © NASA IMERG"}).addTo(cam.chuva);
  }

  /* ---- vento em grade ---- */
  async function carregarVento(){
    const pts=[]; for(let a=-2;a<=2;a++) for(let b=-2;b<=2;b++) pts.push([LOCAL.lat+a*.13, LOCAL.lon+b*.14]);
    const j = await getJSON(`${OM}?${qs({latitude:pts.map(p=>p[0].toFixed(3)).join(","),longitude:pts.map(p=>p[1].toFixed(3)).join(","),current:"wind_speed_10m,wind_direction_10m,wind_gusts_10m",timezone:"America/Sao_Paulo"})}`);
    cam.vento.clearLayers();
    (Array.isArray(j)?j:[j]).forEach((d,i)=>{
      const v=d.current.wind_speed_10m, g=d.current.wind_gusts_10m, dir=d.current.wind_direction_10m;
      const cor = g>=60?"#ff4d4d":g>=45?"#ffb020":g>=30?"#ffe066":"#7fe3ff";
      const ic = L.divIcon({className:"seta-vento",iconSize:[34,34],html:`<svg viewBox="0 0 24 24" style="transform:rotate(${dir+180}deg)"><path d="M12 2 L18 14 L13 12 L13 22 L11 22 L11 12 L6 14 Z" fill="${cor}" stroke="#062026" stroke-width="1"/></svg>`});
      L.marker(pts[i],{icon:ic}).bindTooltip(`Vento ${fmt(v)} km/h de ${direcao(dir)} · rajada ${fmt(g)} km/h`).addTo(cam.vento);
    });
  }

  /* ---- clique no mapa: previsão daquele ponto ---- */
  m.on("click", async e => {
    const pop = L.popup({className:"pop-ponto"}).setLatLng(e.latlng).setContent("Consultando…").openOn(m);
    try{
      const j = await getJSON(`${OM}?${qs({latitude:e.latlng.lat.toFixed(3),longitude:e.latlng.lng.toFixed(3),timezone:"America/Sao_Paulo",current:"temperature_2m,relative_humidity_2m,weather_code,wind_gusts_10m",minutely_15:"precipitation",forecast_minutely_15:8})}`);
      const c=j.current, ch=j.minutely_15.precipitation.reduce((s,v)=>s+(v||0),0);
      pop.setContent(`<b>${emojiTempo(c.weather_code)} ${esc(WMO[c.weather_code]||"")}</b><br>${fmt(c.temperature_2m)}°C · umidade ${fmt(c.relative_humidity_2m)}%<br>Rajada ${fmt(c.wind_gusts_10m)} km/h · chuva 2 h: ${fmt(ch,1)} mm`);
    }catch{ pop.setContent("Não foi possível consultar este ponto agora."); }
  });

  /* ---- avisos e cidades ---- */
  function desenharAvisos(lista, nivelHoje){
    cam.avisos.clearLayers();
    lista.forEach(a=>{ try{ L.geoJSON(JSON.parse(a.poligono),{style:{color:a.aviso_cor,weight:2.5,fillColor:a.aviso_cor,fillOpacity:.07,dashArray:a.grupo==="futuro"?"8 6":null}})
      .bindPopup(`<b>${esc(a.descricao)}</b> · ${esc(a.severidade)}<br>${esc(quando(a))}`).addTo(cam.avisos);}catch{} });
    if(poliJab) poliJab.setStyle({fillColor:HEX[nivelHoje],fillOpacity:nivelHoje==="verde"?.12:.38,color:nivelHoje==="verde"?"#ffffff":HEX[nivelHoje]});
  }
  function focarAviso(a){ try{ const g=L.geoJSON(JSON.parse(a.poligono)); m.flyToBounds(g.getBounds(),{duration:.8,padding:[20,20]}); }catch{} }
  function corChuva(mm){return mm>=50?"#c10000":mm>=30?"#ff4400":mm>=15?"#ffaa00":mm>=5?"#0099cc":mm>=1?"#88ddee":"#b9c6c9"}
  function desenharCidades(arr){
    cam.cidades.clearLayers();
    arr.forEach((d,i)=>{ if(i===0) return; const [nome,lat,lon]=CIDADES[i]; const mm=d.daily.precipitation_sum[0];
      L.circleMarker([lat,lon],{radius:7+Math.min(mm,60)/5,color:"#fff",weight:1.5,fillColor:corChuva(mm),fillOpacity:.9})
       .bindTooltip(`<b>${esc(nome)}</b><br>${fmt(mm,0)} mm hoje · máx ${fmt(d.daily.temperature_2m_max[0])}°`).addTo(cam.cidades); });
  }

  return { recarregarNuvens, recarregarChuva, recarregarRadar, carregarVento, desenharAvisos, desenharCidades, focarAviso,
    ventoLigado: () => m.hasLayer(cam.vento), mapa: m };
})();
