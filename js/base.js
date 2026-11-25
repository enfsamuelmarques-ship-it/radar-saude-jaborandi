/* Configuração e utilitários do painel */
"use strict";
const LOCAL = {nome:"Jaborandi", ibge:"3524204", lat:-20.68806, lon:-48.4125};
const CIDADES = [
  ["Jaborandi",-20.688,-48.412],["Barretos",-20.557,-48.568],["Colina",-20.713,-48.541],
  ["Bebedouro",-20.949,-48.479],["Terra Roxa",-20.787,-48.330],["Viradouro",-20.873,-48.297],
  ["Morro Agudo",-20.731,-48.058],["Guaíra",-20.318,-48.311],["Monte Azul Paulista",-20.907,-48.641],
  ["Pitangueiras",-21.009,-48.221],["Severínia",-20.808,-48.803]
];
const ASSINATURA = "Vigilância em Saúde – Prefeitura Municipal de Jaborandi/SP";
const MODELOS=[["ecmwf_ifs025","ECMWF","Europa"],["gfs_seamless","GFS","NOAA, EUA"],["icon_seamless","ICON","Alemanha"],["ukmo_seamless","UKMO","Reino Unido"]];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (n, d=0) => (n==null||isNaN(n)) ? "--" : Number(n).toLocaleString("pt-BR",{maximumFractionDigits:d,minimumFractionDigits:d});
const store = {get(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}, set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const hhmm = d => d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
async function getJSON(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(r.status);return r.json()}
const OM = "https://api.open-meteo.com/v1/forecast";
// resumo gravado pelo monitor 24 h (GitHub Actions) a cada 10 min: alertas da Defesa Civil e status do monitor
const SITUACAO_URL = "https://raw.githubusercontent.com/enfsamuelmarques-ship-it/radar-saude-jaborandi/dados/situacao.json";
const RADAR_API = "https://api.rainviewer.com/public/weather-maps.json";
const qs = o => new URLSearchParams(o).toString();
function direcao(g){return ["N","NE","L","SE","S","SO","O","NO"][Math.round(((g%360)+360)%360/45)%8]}
