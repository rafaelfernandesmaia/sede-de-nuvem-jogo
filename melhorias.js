/* Sede de Nuvem · melhorias.js
   Camada complementar para o jogo atual.
   Inclua depois do script principal e antes de firebase-config.js.
*/
(()=>{
  const $=selector=>document.querySelector(selector);
  const SAVE_KEY="sede-de-nuvem-save-v2";

  function readSave(){
    try{
      const state=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
      return state&&state.game&&!state.online?state:null;
    }catch(error){return null}
  }
  function clearSave(){try{localStorage.removeItem(SAVE_KEY)}catch(error){}}
  window.clearSavedLocalGame=clearSave;
  function saveGame(){
    try{
      if(G&&G.game&&!G.online)localStorage.setItem(SAVE_KEY,JSON.stringify(G));
      else if(G&&!G.game)clearSave();
    }catch(error){}
  }

  /* Casas clicáveis: permite consultar o efeito antes de cair nelas. */
  const style=document.createElement("style");
  style.textContent=".cell{cursor:pointer}.cell:focus-visible{outline:4px solid #f4c845;outline-offset:2px}.cell .label{font-size:clamp(7px,.82vw,11px)}.decision-impact{display:block;margin-top:4px;color:#456044;font-style:normal;font-weight:800}.inspect-note{font-size:11px;font-weight:700;color:#657263}";
  document.head.appendChild(style);

  function inspectHouse(index){
    if(!G||!G.game||!$("#overlay").classList.contains("hidden"))return;
    const info=houseCardText(index);
    modal('<span class="eyebrow">CASA '+(index+1)+' DE 32 · CONSULTA</span><div class="cards-face"><span class="card-label">'+esc(info.icon+" "+info.name.toUpperCase())+'</span><h2>'+esc(info.name)+'</h2><p>'+esc(info.detail)+'</p><p class="inspect-note">Esta consulta não move o peão nem aplica o efeito.</p></div><div class="form-actions"><button class="btn primary" id="closeHouseInspect" type="button">Fechar</button></div>');
    $("#closeHouseInspect").onclick=closeModal;
  }
  const originalDrawBoard=drawBoard;
  drawBoard=function(){
    originalDrawBoard.apply(this,arguments);
    document.querySelectorAll("#board .cell").forEach(function(cell,index){
      cell.setAttribute("tabindex","0");
      cell.setAttribute("aria-label",cell.getAttribute("aria-label")+" · Ative para consultar esta casa");
      cell.onclick=function(){inspectHouse(index)};
      cell.onkeydown=function(event){
        if(event.key==="Enter"||event.key===" "){event.preventDefault();inspectHouse(index)}
      };
    });
  };

  /* Explica os efeitos das duas escolhas sem alterar as regras do roteiro. */
  const originalShowDilemma=showDilemma;
  showDilemma=function(card,readOnly){
    originalShowDilemma.apply(this,arguments);
    if(readOnly)return;
    const honest=$("#honestChoice small"),shortcut=$("#riskyChoice small");
    if(honest)honest.insertAdjacentHTML("beforeend",'<i class="decision-impact">Efeito: mantém a transparência e recebe um Power Up.</i>');
    if(shortcut)shortcut.insertAdjacentHTML("beforeend",'<i class="decision-impact">Efeito: aquífero −1 e avanço de 3 casas; se houver carga, ela fica marcada como maquiada.</i>');
  };

  /* Salva somente partidas locais neste aparelho; partidas online ficam no Firebase. */
  const originalRender=render;
  render=function(){
    const result=originalRender.apply(this,arguments);
    saveGame();
    return result;
  };
  const originalEndGame=endGame;
  endGame=function(){
    clearSave();
    return originalEndGame.apply(this,arguments);
  };

  window.hasSavedLocalGame=function(){return!!readSave()};
  window.restoreSavedLocalGame=function(){
    const state=readSave();
    if(!state){showMainMenu();return}
    const wasRolling=!!state.rolling;
    G=Object.assign({},state,{online:null,rolling:false,moving:false,turnNotice:state.turnNotice||"",turnNoticeSerial:state.turnNoticeSerial==null?-1:state.turnNoticeSerial});
    G.players=G.players||[];G.territories=G.territories||[];G.log=G.log||[];G.pendingChoice=G.pendingChoice||null;G.pendingLanding=G.pendingLanding==null?null:G.pendingLanding;
    if(wasRolling){G.rolled=false;G.lastRoll=0}
    if(G.combat&&G.combat.phase==="rolling"){
      const house=G.combat.house;G.combat=null;
      const territory=G.territories.find(function(item){return item.house===house});
      if(territory)G.pendingLanding=territory.house-1;
    }else if(G.combat&&G.combat.phase==="result")G.combat=null;
    if(!G.game){clearSave();showMainMenu();return}
    rulesSeen=true;closeModal();render();
    if(G.pendingLanding!==null){showHouseCard(G.pendingLanding,false);return}
    if(G.pendingChoice){openCurrentChoice(false);return}
    if(G.combat){showCombatCard(G.combat,false);return}
    if(isMyTurn())prepareTurn();
    toast("Partida local retomada.");
  };

  /* Mostra a opção de retomada no menu após recarregar a página. */
  const originalShowMainMenu=showMainMenu;
  showMainMenu=function(){
    originalShowMainMenu.apply(this,arguments);
    if(G&&G.game)return;
    if(!readSave()||$("#menuSavedGame"))return;
    const grid=$(".menu-grid"),newGame=$("#menuNewGame");
    if(!grid||!newGame)return;
    const button=document.createElement("button");
    button.id="menuSavedGame";button.type="button";button.className="btn menu-wide";
    button.textContent="↻ Retomar partida salva";
    button.onclick=window.restoreSavedLocalGame;
    newGame.insertAdjacentElement("afterend",button);
  };

  render();
  showMainMenu();
})();

/* Camada avançada: Pecém vivo, escolhas, eventos e debriefing. */
(()=>{
  const $=s=>document.querySelector(s);
  const skin=document.createElement("link");skin.rel="stylesheet";skin.href="./melhorias-ambiente.css";document.head.appendChild(skin);
  let audio=null,muted=localStorage.getItem("sede-som-muted")==="true";
  function sound(kind){
    if(muted)return;
    try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audio=audio||new C();if(audio.state==="suspended")audio.resume();const now=audio.currentTime,o=audio.createOscillator(),g=audio.createGain(),f=kind==="water"?[490,710]:kind==="warning"?[180,120]:kind==="card"?[520,380]:kind==="step"?[250,330]:kind==="score"?[620,780]:[180,420,260,550];o.type=kind==="warning"?"triangle":"sine";o.frequency.setValueAtTime(f[0],now);if(f.length>1)o.frequency.exponentialRampToValueAtTime(f[f.length-1],now+.16);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime((kind==="warning" ? 0.055 : 0.035),now+.018);g.gain.exponentialRampToValueAtTime(.0001,now+.22);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+.23)}catch(e){}
  }
  function mountSound(){const nav=$(".top-actions");if(!nav||$("#soundToggle"))return;const b=document.createElement("button");b.id="soundToggle";b.type="button";b.className="btn sound-toggle";b.setAttribute("aria-pressed",String(!muted));b.textContent=muted?"🔇 Som desligado":"🔊 Som ligado";b.onclick=function(){muted=!muted;localStorage.setItem("sede-som-muted",String(muted));b.textContent=muted?"🔇 Som desligado":"🔊 Som ligado";b.setAttribute("aria-pressed",String(!muted));if(!muted)sound("card")};nav.insertBefore(b,nav.firstChild)}
  function waterState(){const n=G&&Number.isFinite(+G.aquifer)?+G.aquifer:10;return n>=8?"healthy":n>=3?"dry":"critical"}
  const paths={
    tribunal:'<path d="M3 9 12 3l9 6M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 20h18"/>',
    aldeia:'<path d="M3 11 12 4l9 7M5 10v10h14V10M9 20v-6h6v6M12 4V1"/>',
    pocos:'<circle cx="12" cy="12" r="8"/><path d="M5 12h14M8 9l2 3-2 3m8-6-2 3 2 3"/>',
    universidade:'<path d="m3 9 9-5 9 5-9 5-9-5Zm3 2v6c4 3 8 3 12 0v-6m3-2v7"/>',
    datacenter:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/><circle cx="16" cy="18" r=".8"/>',
    eolica:'<path d="M12 12v9m-3 1h6"/><circle cx="12" cy="9" r="1.5"/><path d="m11 8-2-6 3 1 1 5m0 2 6 2-2 2-5-3m-1-1-4 5-2-2 5-4"/>',
    porto:'<path d="M3 12h18l-3 7H7l-4-7Zm4 0V7h5v5m-2-5V3h8v9m-8-6h8M5 22c2 1 4 1 6 0s4-1 7 0"/>',
    governo:'<path d="m3 9 9-6 9 6H3Zm2 1v8m5-8v8m4-8v8m5-8v8M3 20h18"/>',
    dilemma:'<path d="m12 3 10 17H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    power:'<path d="m13 2-9 12h7l-1 8 10-13h-7V2Z"/>',
    drought:'<path d="M12 3c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11Z M5 21 19 7"/>',
    neutral:'<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>'
  };
  function iconSvg(id){return '<svg viewBox="0 0 24 24" aria-hidden="true"><g>'+(paths[id]||paths.neutral)+'</g></svg>'}
  function seedAt(i){return TERRITORY_SEEDS.find(t=>t.house-1===i)}
  function mapSvg(){
    const state=waterState(),water=state==="healthy"?"#43c2da":state==="dry"?"#d6aa49":"#ec5a4e",land=state==="healthy"?"#699960":state==="dry"?"#ab955f":"#9a704e",alert=state==="critical";
    return '<svg class="pecem-map" viewBox="0 0 520 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa do Pecém: Porto, Parque Eólico, Data Center, Aldeia Anacé, Poços e Tribunal ligados por rotas de água e energia"><defs><linearGradient id="mapLand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+land+'"/><stop offset="1" stop-color="#d0bb80"/></linearGradient><linearGradient id="mapSea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+water+'"/><stop offset="1" stop-color="#346f82"/></linearGradient></defs><path d="M0 55Q90 38 170 54T340 48T520 60V300H0Z" fill="url(#mapLand)"/><path d="M0 232Q80 219 160 232T320 230T520 228V300H0Z" fill="url(#mapSea)" opacity=".88"/><path d="M10 82Q110 102 170 82T330 94T515 78" fill="none" stroke="#fff4d3" stroke-width="2" stroke-dasharray="4 7" opacity=".6"/><text x="15" y="20" class="map-topline">PECÉM · CEARÁ · SISTEMA HÍDRICO</text><path class="map-water" d="M90 187C140 222 167 184 220 166S305 122 384 142S438 196 465 205"/><path class="map-water" d="M90 187C106 144 148 115 205 107S290 119 326 128"/><path class="map-energy" d="M136 65C198 76 258 75 315 90S401 122 454 156"/><g transform="translate(44 179)"><circle class="map-node" r="17"/><text class="map-icon" y="6">⚓</text><text class="map-label" x="-20" y="29">PORTO</text></g><g transform="translate(136 65)"><circle class="map-node" r="17"/><text class="map-icon" y="6">⚡</text><text class="map-label" x="-35" y="-25">PARQUE EÓLICO</text></g><g transform="translate(220 166)"><circle class="map-node '+(alert?'map-node-alert':'')+'" r="19"/><text class="map-icon" y="6">▣</text><text class="map-label" x="-35" y="33">DATA CENTER</text></g><g transform="translate(326 128)"><circle class="map-node" r="17"/><text class="map-icon" y="6">⌂</text><text class="map-label" x="-37" y="-24">ALDEIA ANACÉ</text></g><g transform="translate(384 142)"><circle class="map-node '+(alert?'map-node-alert':'')+'" r="16"/><text class="map-icon" y="6">◉</text><text class="map-label" x="-21" y="28">POÇOS</text></g><g transform="translate(465 205)"><circle class="map-node" r="17"/><text class="map-icon" y="6">⚖</text><text class="map-label" x="-28" y="28">TRIBUNAL</text></g><text x="11" y="292" class="map-topline">ÁGUA</text><text x="450" y="292" class="map-topline">ENERGIA</text></svg>'
  }
  function centerHtml(){
    const n=G?G.aquifer:10,s=waterState(),label=s==="healthy"?"AQUÍFERO SAUDÁVEL":s==="dry"?"ATENÇÃO · SOLO SECO":"ALERTA · ESCASSEZ";
    const headline=G&&G.lastEventRound===G.round&&G.lastEvent?G.lastEvent:G&&(G.newsTicker||G.log&&G.log[0]&&G.log[0].text)||"A partida começa na casa 1. Decisões locais afetam o aquífero comum.";
    return mapSvg()+'<span class="water-state-label">'+label+'</span><strong class="center-water">AQUÍFERO · '+n+' / 10</strong><div class="news-ticker" aria-live="polite"><b>JORNAL DO PECÉM</b><span>'+esc(headline)+'</span></div>'
  }
  const oldDraw=drawBoard;
  drawBoard=function(){oldDraw.apply(this,arguments);const board=$("#board"),state=waterState();board.classList.remove("water-healthy","water-dry","water-critical");board.classList.add("water-"+state);const frame=board.closest(".board-frame");if(frame)frame.dataset.aquifer=state;document.querySelectorAll("#board .cell").forEach(function(cell,i){const seed=seedAt(i),kind=seed?seed.id:houseTypeAt(i),ico=cell.querySelector(".ico");cell.classList.toggle("datacenter",kind==="datacenter");cell.classList.toggle("pocos",kind==="pocos");if(ico)ico.innerHTML=iconSvg(paths[kind]?kind:"neutral");cell.querySelectorAll(".scarcity-flag").forEach(x=>x.remove());if(state==="critical"&&(kind==="datacenter"||kind==="pocos")||state==="dry"&&kind==="datacenter"){const flag=document.createElement("span");flag.className="scarcity-flag";flag.textContent="!";flag.title="Alerta de abastecimento";flag.setAttribute("aria-label","Alerta de escassez de água");cell.appendChild(flag)}const token=cell.querySelector(".tokens .token");if(token&&G&&G.moving&&i===G.players[G.pi].pos)token.classList.add("moving-token")});const center=board.querySelector(".board-center");if(center){center.innerHTML=centerHtml();center.classList.add("pecem-center");center.setAttribute("aria-label","Mapa do Pecém e notícias. Aquífero "+(G?G.aquifer:10)+" de 10.")}};
  const oldLog=addLog;addLog=function(message){oldLog.apply(this,arguments);if(G)G.newsTicker=String(message)};
  const oldMake=makeGame;makeGame=function(){const s=oldMake.apply(this,arguments);s.sessionId="game-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);s.decisions=[];s.deliveryResults=[];s.events=[];s.newsTicker="A partida começa no tabuleiro do Pecém.";s.ethicalCounters={};return s};
  function ensureStats(){if(!G)return;G.decisions=G.decisions||[];G.deliveryResults=G.deliveryResults||[];G.events=G.events||[];G.ethicalCounters=G.ethicalCounters||{};(G.players||[]).forEach(p=>{if(!G.ethicalCounters[p.id])G.ethicalCounters[p.id]={honest:0,shortcut:0,honestDelivery:0,disguisedDelivery:0}})}
  const oldApply=window.applyOnlineState;if(oldApply)window.applyOnlineState=function(){const r=oldApply.apply(this,arguments);ensureStats();return r};
  const oldRender=render;let previous=null;
  function floatAt(target,text,good){if(!target)return;const el=document.createElement("span");el.className="float-delta "+(good?"good":"bad");el.textContent=text;const r=target.getBoundingClientRect();el.style.left=(r.left+r.width/2+window.scrollX)+"px";el.style.top=(r.top+window.scrollY)+"px";document.body.appendChild(el);setTimeout(()=>el.remove(),1250)}
  render=function(){const prior=previous,id=G&&(G.sessionId||"shared"),water=G?+G.aquifer:10,pos=G?(G.players||[]).map(p=>p.pos):[],score=G?(G.players||[]).map(p=>p.score):[];const out=oldRender.apply(this,arguments);mountSound();if(G){ensureStats();const same=prior&&prior.id===id,change=same?water-prior.water:0;if(change){floatAt($("#trackWrap .track")||$("#trackWrap"),(change>0?"+":"")+change,change>0);sound(change>0?"water":"warning")}if(same&&prior.pos)pos.forEach((p,i)=>{if(p!==prior.pos[i])sound("step");const d=p===undefined?0:score[i]-(prior.score[i]||0);if(d){floatAt($("#players .player-row:nth-child("+(i+1)+")"),(d>0?"+":"")+d+" pts",d>0);if(d>0)sound("score")}});previous={id:id,water:water,pos:pos,score:score}}else previous=null;return out};
  function cardFx(){const face=$("#overlay .cards-face");if(!face)return;const title=$("#overlay .eyebrow"),txt=title?title.textContent.toLowerCase():"";face.classList.add("physical-card");if(face.querySelector(".impact-seal"))return;const seal=document.createElement("span");seal.className="impact-seal "+(txt.includes("dilema")||txt.includes("crise")?"risk":txt.includes("entrega")?"water":"");seal.textContent=txt.includes("entrega")?"IMPACTO HÍDRICO":txt.includes("dilema")?"ESCOLHA ÉTICA":txt.includes("power")?"RECURSO DE APOIO":"PECÉM · CAMPO";face.insertBefore(seal,face.firstChild)}
  ["showDeliveryCard","showDilemma","showPowerCard","showHouseCard"].forEach(name=>{if(typeof window[name]!=="function")return;const fn=window[name];window[name]=function(){const r=fn.apply(this,arguments);requestAnimationFrame(cardFx);sound("card");return r}});
  const oldCargo=renderCargo;renderCargo=function(){const r=oldCargo.apply(this,arguments),card=$("#cargoPanel .cargo-card");if(card&&!card.querySelector(".impact-seal")){const seal=document.createElement("span");seal.className="impact-seal water";seal.textContent="PRAZO · 3 RODADAS";card.insertBefore(seal,card.firstChild)}return r};
  const oldRoll=rollDie;rollDie=async function(){const box=$(".dice-box");if(box)box.classList.add("rolling-local");sound("dice");try{return await oldRoll.apply(this,arguments)}finally{if(box)box.classList.remove("rolling-local")}};
  const oldDilemma=resolveDilemma;resolveDilemma=async function(honest,card){if(G&&G.pendingChoice&&G.pendingChoice.type==="dilemma"&&isMyTurn()){ensureStats();const p=current(),key=honest?"honest":"shortcut";G.decisions.push({round:G.round,playerId:p.id,playerName:p.name,choice:key,title:card.title});G.ethicalCounters[p.id][key]++}return await oldDilemma.apply(this,arguments)};
  const oldDelivery=completeDelivery;completeDelivery=function(player,territory){const c=player&&player.cargo;if(G&&c&&c.pickedUp&&c.to===territory.house){ensureStats();const honest=!c.maquiada;G.deliveryResults.push({round:G.round,playerId:player.id,playerName:player.name,honest:honest,card:c.name});G.ethicalCounters[player.id][honest?"honestDelivery":"disguisedDelivery"]++}return oldDelivery.apply(this,arguments)};
  const EVENTS=[
    {id:"estiagem",name:"Estiagem prolongada no Ceará",description:"A estiagem pressiona os poços: aquífero −1.",run:()=>G.aquifer=Math.max(0,G.aquifer-1)},
    {id:"pico-ia",name:"Pico de processamento de IA",description:"A demanda computacional cresce: aquífero −1.",run:()=>G.aquifer=Math.max(0,G.aquifer-1)},
    {id:"fiscalizacao",name:"Fiscalização ambiental no Tribunal",description:"Cargas maquiadas ativas são devolvidas; cada responsável perde 2 pontos.",run:()=>{let found=false;G.players.forEach(p=>{if(p.cargo&&p.cargo.maquiada){found=true;p.cargo=null;p.score=Math.max(0,p.score-2);addLog(p.name+" teve carga maquiada auditada: devolveu a carta e perdeu 2 pontos.")}});if(!found)addLog("Fiscalização ambiental: nenhuma carga maquiada ativa foi encontrada.")}},
    {id:"reuso",name:"Mutirão de reuso de água",description:"Comunidade e universidade recuperam 1 ponto do aquífero.",run:()=>G.aquifer=Math.min(10,G.aquifer+1)}
  ];
  const oldAdvance=advanceRound;advanceRound=function(){const ok=oldAdvance.apply(this,arguments);if(!ok||!G||!G.game)return ok;const r=G.round;if(r>1&&(r-1)%2===0&&G.lastEventRound!==r){G.lastEventRound=r;ensureStats();const e=EVENTS[Math.floor(Math.random()*EVENTS.length)];e.run();G.events.push({round:r,id:e.id,name:e.name,description:e.description});G.lastEvent=e.name+": "+e.description;G.newsTicker="EVENTO GLOBAL · "+G.lastEvent;addLog("Evento global da rodada "+r+" — "+G.lastEvent);render();toast("Evento global: "+e.name);sound(e.id==="estiagem"||e.id==="pico-ia"?"warning":"water");if(G.aquifer<=0){endGame(true);return false}}return true};
  const oldRules=showRules;showRules=function(){const r=oldRules.apply(this,arguments),grid=$("#overlay .rule-grid");if(grid&&!grid.querySelector(".global-event-rule")){const item=document.createElement("div");item.className="rule-item global-event-rule";item.innerHTML="<b>Eventos globais</b>A cada duas rodadas, um acontecimento pode alterar o aquífero ou fiscalizar cargas maquiadas. Acompanhe o Jornal do Pecém no centro do tabuleiro.";grid.appendChild(item)}return r};
  function debriefHtml(){ensureStats();const count=G.ethicalCounters||{},players=G.players||[],best=players.map(p=>({p:p,n:(count[p.id].honest||0)+(count[p.id].honestDelivery||0)})).sort((a,b)=>b.n-a.n),risk=players.map(p=>({p:p,n:(count[p.id].shortcut||0)+(count[p.id].disguisedDelivery||0)})).sort((a,b)=>b.n-a.n),ethical=(G.decisions||[]).filter(x=>x.choice==="honest").length,shortcuts=(G.decisions||[]).filter(x=>x.choice==="shortcut").length,good=(G.deliveryResults||[]).filter(x=>x.honest).length,bad=(G.deliveryResults||[]).filter(x=>!x.honest).length,events=(G.events||[]).map(x=>esc(x.name)).join(" · ")||"Nenhum evento global ocorreu.";const leader=best[0]&&best[0].n?esc(best[0].p.name)+" ("+best[0].n+" escolha(s) transparentes)":"Nenhuma decisão transparente registrada.";const risky=risk[0]&&risk[0].n?esc(risk[0].p.name)+" ("+risk[0].n+" atalho(s)/entrega(s) maquiada(s))":"Nenhum atalho ou entrega maquiada registrado.";const outcome=G.aquifer<=0?"A competição individual gerou uma perda coletiva: o recurso compartilhado chegou a zero.":"O grupo preservou água suficiente para concluir a simulação.";return '<section class="debrief"><h3>Debriefing · o que as decisões mostraram?</h3><p>'+outcome+' A escala de 0 a 10 é didática e não equivale a litros: o consumo real varia com refrigeração, fonte de energia, clima e operação do data center.</p><div class="debrief-grid"><div class="debrief-stat"><b>Mais decisões transparentes</b>'+leader+'</div><div class="debrief-stat"><b>Mais decisões de risco</b>'+risky+'</div><div class="debrief-stat"><b>Escolhas nos dilemas</b>'+ethical+' honestas · '+shortcuts+' atalhos</div><div class="debrief-stat"><b>Entregas concluídas</b>'+good+' honestas · '+bad+' maquiadas</div></div><p class="small-note"><b>Eventos:</b> '+events+'</p><p class="small-note">Para debater: quando o ganho individual justifica um custo ambiental compartilhado pela comunidade?</p></section>'}
  function putDebrief(){const box=$("#overlay .modal");if(!box||box.querySelector(".debrief"))return;const actions=box.querySelector(".form-actions");if(actions)actions.insertAdjacentHTML("beforebegin",debriefHtml());else box.insertAdjacentHTML("beforeend",debriefHtml())}
  const oldEnd=endGame;endGame=function(){const r=oldEnd.apply(this,arguments);requestAnimationFrame(putDebrief);return r};
  const oldShowEnd=showEndFromState;showEndFromState=function(){const r=oldShowEnd.apply(this,arguments);requestAnimationFrame(putDebrief);return r};
  mountSound();render()
})();


