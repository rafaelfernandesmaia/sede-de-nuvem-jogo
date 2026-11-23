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
  function inspectHouse(index){
    if(!G||!G.game||!$("#overlay").classList.contains("hidden"))return;
    const info=houseCardText(index);
    modal('<span class="eyebrow">CASA '+(index+1)+' DE 32 · CONSULTA</span><div class="cards-face"><span class="card-label">'+esc(info.icon+" "+info.name.toUpperCase())+'</span><h2>'+esc(info.name)+'</h2><p>'+esc(info.detail)+'</p><p class="inspect-note">Esta consulta não move o peão nem aplica o efeito.</p></div><div class="form-actions"><button class="btn primary" id="closeHouseInspect" type="button">Fechar</button></div>');
    $("#closeHouseInspect").onclick=closeModal;
  }
  SedeHooks.on("boardRendered",function(payload){
    const board=payload&&payload.board;if(!board)return;
    document.querySelectorAll("#board .cell").forEach(function(cell,index){
      cell.setAttribute("tabindex","0");
      cell.setAttribute("aria-label",cell.getAttribute("aria-label")+" · Ative para consultar esta casa");
      cell.onclick=function(){inspectHouse(index)};
      cell.onkeydown=function(event){
        if(event.key==="Enter"||event.key===" "){event.preventDefault();inspectHouse(index)}
      };
    });
  });

  /* Explica os efeitos das duas escolhas sem alterar as regras do roteiro. */
  SedeHooks.on("dialogRendered",function(){
    const honest=$("#honestChoice small"),shortcut=$("#riskyChoice small");
    if(honest&&!honest.querySelector(".decision-impact"))honest.insertAdjacentHTML("beforeend",'<i class="decision-impact">Sem custo imediato de água · recebe um Power Up.</i>');
    if(shortcut&&!shortcut.querySelector(".decision-impact"))shortcut.insertAdjacentHTML("beforeend",'<i class="decision-impact">Aquífero −1 · avança 3 casas.</i>');
  });

  /* Salva somente partidas locais neste aparelho; partidas online ficam no Firebase. */
  SedeHooks.on("afterRender",saveGame);
  SedeHooks.on("gameEnded",clearSave);

  window.hasSavedLocalGame=function(){return!!readSave()};
  window.restoreSavedLocalGame=function(){
    const state=readSave();
    if(!state){showMainMenu();return}
    const wasRolling=!!state.rolling,wasMoving=!!state.moving||Number(state.moveRemaining)>0;
    G=SedeRules.normalize(Object.assign({},state,{online:null,rolling:false,moving:false,turnNotice:state.turnNotice||"",turnNoticeSerial:state.turnNoticeSerial==null?-1:state.turnNoticeSerial}));
    if(SedeRules.validate(G).length){clearSave();showMainMenu();toast("O salvamento está incompleto e não pôde ser retomado.");return}
    G.players=G.players||[];G.territories=G.territories||[];G.log=G.log||[];G.pendingChoice=G.pendingChoice||null;G.pendingLanding=G.pendingLanding==null?null:G.pendingLanding;
    if(wasRolling){G.rolled=false;G.lastRoll=0;G.previewTarget=null;G.moveRemaining=0}
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
    if(G.rolled&&G.moveRemaining>0){movePawn(G.moveRemaining,false);toast("Retomando o movimento que ficou em curso.");return}
    if(wasMoving&&G.rolled){land(G.players[G.pi].pos);return}
    if(isMyTurn())prepareTurn();
    toast("Partida local retomada.");
  };

  /* Mostra a opção de retomada no menu após recarregar a página. */
  SedeHooks.on("mainMenuRendered",function(payload){
    if(payload&&payload.active)return;
    if(!readSave()||$("#menuSavedGame"))return;
    const grid=$(".menu-grid"),newGame=$("#menuNewGame");
    if(!grid||!newGame)return;
    const button=document.createElement("button");
    button.id="menuSavedGame";button.type="button";button.className="btn menu-wide";
    button.textContent="↻ Retomar partida salva";
    button.onclick=window.restoreSavedLocalGame;
    newGame.insertAdjacentElement("afterend",button);
  });

  render();
  showMainMenu();
})();

/* Camada avançada: Pecém vivo, escolhas, eventos e debriefing. */
(()=>{
  const $=s=>document.querySelector(s);

  let audio=null,muted=false;try{muted=localStorage.getItem("sede-som-muted")==="true"}catch(e){}
  function sound(kind){
    if(muted)return;
    try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audio=audio||new C();if(audio.state==="suspended")audio.resume();const now=audio.currentTime,o=audio.createOscillator(),g=audio.createGain(),f=kind==="water"?[490,710]:kind==="warning"?[180,120]:kind==="card"?[520,380]:kind==="step"?[250,330]:kind==="score"?[620,780]:[180,420,260,550];o.type=kind==="warning"?"triangle":"sine";o.frequency.setValueAtTime(f[0],now);if(f.length>1)o.frequency.exponentialRampToValueAtTime(f[f.length-1],now+.16);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime((kind==="warning" ? 0.055 : 0.035),now+.018);g.gain.exponentialRampToValueAtTime(.0001,now+.22);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+.23)}catch(e){}
  }
  function mountSound(){const nav=$(".top-actions");if(!nav||$("#soundToggle"))return;const b=document.createElement("button");b.id="soundToggle";b.type="button";b.className="btn sound-toggle";b.setAttribute("aria-pressed",String(!muted));b.textContent=muted?"Som: desligado":"Som: ligado";b.onclick=function(){muted=!muted;try{localStorage.setItem("sede-som-muted",String(muted))}catch(e){}b.textContent=muted?"Som: desligado":"Som: ligado";b.setAttribute("aria-pressed",String(!muted));if(!muted)sound("card")};nav.insertBefore(b,nav.firstChild)}
  function waterState(){const n=G&&Number.isFinite(+G.aquifer)?+G.aquifer:10;return n>=8?"healthy":n>=3?"dry":"critical"}
  const paths={
    tribunal:'<path d="M3 9 12 3l9 6M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 20h18"/>',
    aldeia:'<path d="M4 18c4-3 12-3 16 0M6 13c2-3 10-3 12 0M8 8c1.8-2 6.2-2 8 0"/><circle cx="12" cy="5" r="1.4"/><circle cx="6" cy="18" r="1"/><circle cx="18" cy="18" r="1"/>',
    pocos:'<path d="M12 2c-2.4 3.3-5 6-5 9.5a5 5 0 0 0 10 0C17 8 14.4 5.3 12 2Z"/><path d="M3 16c2.5-1.8 4.8-1.8 7.2 0s4.8 1.8 7.2 0 3.2-1.3 3.6-1.1M4 20c2.3-1.5 4.5-1.5 6.8 0s4.5 1.5 6.8 0 2.2-1 2.8-.8"/>',
    universidade:'<path d="M9 2h6M10 2v7l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V2M8 15h8"/>',
    datacenter:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/><circle cx="16" cy="18" r=".8"/>',
    eolica:'<path d="M12 12v9m-3 1h6"/><circle cx="12" cy="9" r="1.5"/><path d="m11 8-2-6 3 1 1 5m0 2 6 2-2 2-5-3m-1-1-4 5-2-2 5-4"/>',
    porto:'<path d="M3 15h18l-3 5H6l-3-5Zm3 0V8h6v7m-3-7V4h9v11M7 11h4m5-4h3M4 23c2-1 4-1 6 0s4 1 6 0 3-1 4 0"/>',
    governo:'<path d="m3 9 9-6 9 6H3Zm2 1v8m5-8v8m4-8v8m5-8v8M3 20h18"/>',
    dilemma:'<path d="m12 3 10 17H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    power:'<path d="m13 2-9 12h7l-1 8 10-13h-7V2Z"/>',
    drought:'<path d="M12 3c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11Z M5 21 19 7"/>',
    neutral:'<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>'
  };
  function iconSvg(id){return '<svg viewBox="0 0 24 24" aria-hidden="true"><g>'+(paths[id]||paths.neutral)+'</g></svg>'}
  function seedAt(i){return TERRITORY_SEEDS.find(t=>t.house-1===i)}
  function mapNode(id,x,y,label,code,alert){
    const right=x>390,offset=right?-16:16,anchor=right?"end":"start";
    return '<g transform="translate('+x+' '+y+')"><path class="map-pin '+(alert?'map-pin-alert':'')+'" d="M0 -15Q13 -14 12 -2L2 13Q0 16 -2 13L-12 -2Q-13 -13 0 -15Z"/><g class="map-icon" transform="translate(-8 -8) scale(.67)">'+paths[id]+'</g><path class="map-cross" d="M-18 0h5m26 0h5M0-22v5m0 25v5"/><text class="map-label" text-anchor="'+anchor+'" x="'+offset+'" y="-3">'+label+'</text><text class="map-code" text-anchor="'+anchor+'" x="'+offset+'" y="8">'+code+'</text></g>'
  }
  function mapSvg(){
    const state=waterState(),alert=state==="critical",water=alert?"#ad5747":"#477d8b";
    return '<svg class="pecem-map" viewBox="0 0 520 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Croqui de campo do litoral oeste do Ceará com rotas de água e energia entre Porto, Parque Eólico, Data Center, Aldeia Anacé, Poços, Tribunal e Governo"><defs><pattern id="mapGrid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#455b4b" stroke-width=".35" opacity=".18"/></pattern><linearGradient id="mapLand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d8c79c"/><stop offset="1" stop-color="#b8af83"/></linearGradient><linearGradient id="mapSea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#79a6a1"/><stop offset="1" stop-color="#426d77"/></linearGradient></defs><path d="M0 0H520V300H0Z" fill="url(#mapLand)"/><path d="M0 207Q67 196 125 211T246 205T362 211T520 199V300H0Z" fill="url(#mapSea)"/><path d="M0 207Q67 196 125 211T246 205T362 211T520 199" fill="none" stroke="#f1e6c8" stroke-width="2"/><path class="map-contour" d="M-12 63Q38 43 90 59T190 61T300 53T416 60T532 48M-8 74Q44 54 98 70T198 72T305 65T419 71T531 59M-10 88Q42 68 100 84T203 87T309 79T422 85T535 73M12 135Q68 117 121 131T225 136T328 124T445 132M4 147Q65 130 122 145T229 149T333 138T452 145M246 45Q275 30 307 41T367 44T430 35M270 54Q299 40 331 50T390 53T450 44"/><path d="M14 27H505M14 282H505" fill="none" stroke="#53624e" stroke-width=".7" stroke-dasharray="2 5" opacity=".55"/><rect width="520" height="300" fill="url(#mapGrid)"/><text x="17" y="20" class="map-topline">CADERNO DE CAMPO · PECÉM · CEARÁ</text><text x="18" y="33" class="map-note">CROQUI DO SISTEMA HÍDRICO E DE ENERGIA · 2030</text><path class="map-route map-route-water" d="M70 161C111 177 146 150 193 155S268 174 314 151S394 139 438 157"/><path class="map-route map-route-energy" d="M150 80C196 95 218 113 258 115S322 91 366 94S420 119 452 133"/><path class="map-route map-route-delivery" d="M83 160C112 125 146 97 184 82M260 115C299 125 325 145 360 159"/><path d="M68 161l7-2-2 7m108-90 5 7-8 1m174 74 7-3-1 8" fill="none" stroke="#374f44" stroke-width="1.4"/><text x="101" y="146" class="map-route-label">ROTA H₂O · R-01</text><text x="286" y="105" class="map-route-label">REDE EÓLICA · R-02</text>'+mapNode("porto",70,161,"PORTO","P-01",false)+mapNode("pocos",117,211,"POÇOS","H₂O-1",alert)+mapNode("tribunal",134,112,"TRIBUNAL","J-01",false)+mapNode("eolica",150,80,"PARQUE EÓLICO","E-01",false)+mapNode("aldeia",258,115,"ALDEIA ANACÉ","T-01",false)+mapNode("datacenter",360,159,"DATA CENTER","DC-01",alert)+mapNode("universidade",438,157,"UNIVERSIDADE","U-01",false)+mapNode("governo",316,66,"GOVERNO","G-01",false)+'<g class="map-scale"><path d="M24 265h48m-48-4v8m24-8v8m24-8v8"/><text x="24" y="278">0</text><text x="63" y="278">5 KM</text></g><g class="map-north"><path d="M487 50v22m0-22-5 8m5-8 5 8"/><text x="484" y="45">N</text></g><text x="302" y="278" class="map-field-note">COLETA ▸ DESTINO · REGISTRO DE ROTA</text></svg>'
  }
  function routeMarksSvg(){
    const cargo=G&&current()&&current().cargo;if(!cargo)return "";
    const coords={tribunal:[134,112],aldeia:[258,115],pocos:[117,211],universidade:[438,157],datacenter:[360,159],eolica:[150,80],porto:[70,161],governo:[314,68]};
    function mark(house,label,type){
      const seed=TERRITORY_SEEDS.find(item=>item.house===house),point=seed&&coords[seed.id];if(!point)return "";
      const color=type==="origin"?"#9c4b3f":"#2c7049",offset=point[0]>390?-14:14,anchor=point[0]>390?"end":"start";
      return '<g class="map-route-mark map-route-mark-'+type+'" transform="translate('+point[0]+' '+point[1]+')"><path d="M0-4 4 0 0 4-4 0Z" fill="'+color+'"/><path d="M0-10v-5m-7 0h14" stroke="'+color+'" stroke-width="1.4"/><text text-anchor="'+anchor+'" x="'+offset+'" y="-12">'+label+'</text></g>';
    }
    return '<svg class="map-route-markers" viewBox="0 0 520 300" aria-hidden="true">'+mark(cargo.from,"COLETA","origin")+mark(cargo.to,"ENTREGA","destination")+'</svg>';
  }
  function centerHtml(){
    const s=waterState(),label=s==="healthy"?"CAMPO · NÍVEL ESTÁVEL":s==="dry"?"CAMPO · ATENÇÃO":"CAMPO · ALERTA DE ESCASSEZ";
    const headline=G&&G.lastEventRound===G.round&&G.lastEvent?G.lastEvent:G&&(G.newsTicker||G.log&&G.log[0]&&G.log[0].text)||"A partida começa na casa 1. Decisões locais afetam o aquífero comum.";
    return mapSvg()+routeMarksSvg()+'<span class="water-state-label">'+label+'</span><div class="news-ticker" aria-live="polite"><b>JORNAL DO PECÉM</b><span>'+esc(headline)+'</span></div>'
  }
  function decorateBoard(payload){
    const board=payload&&payload.board;if(!board)return;const state=waterState();board.classList.remove("water-healthy","water-dry","water-critical");board.classList.add("water-"+state);const frame=board.closest(".board-frame");if(frame)frame.dataset.aquifer=state;
    document.querySelectorAll("#board .cell").forEach(function(cell,i){const seed=seedAt(i),kind=seed?seed.id:houseTypeAt(i),ico=cell.querySelector(".ico");cell.classList.toggle("datacenter",kind==="datacenter");cell.classList.toggle("pocos",kind==="pocos");if(ico)ico.innerHTML=iconSvg(paths[kind]?kind:"neutral");cell.querySelectorAll(".scarcity-flag").forEach(x=>x.remove());if(state==="critical"&&(kind==="datacenter"||kind==="pocos")||state==="dry"&&kind==="datacenter"){const flag=document.createElement("span");flag.className="scarcity-flag";flag.textContent="!";flag.title="Alerta de abastecimento";flag.setAttribute("aria-label","Alerta de escassez de água");cell.appendChild(flag)}const token=cell.querySelector(".tokens .token");if(token&&G&&G.moving&&i===G.players[G.pi].pos)token.classList.add("moving-token")});
    const center=board.querySelector(".board-center");if(center){center.innerHTML=centerHtml();center.classList.add("pecem-center");center.setAttribute("aria-label","Mapa do Pecém, escala de campo e notícia; consulte a barra para o nível exato do aquífero.")}
  }
  SedeHooks.on("boardRendered",decorateBoard);
  function ensureStats(){if(!G)return;G.decisions=G.decisions||[];G.deliveryResults=G.deliveryResults||[];G.events=G.events||[];G.ethicalCounters=G.ethicalCounters||{};(G.players||[]).forEach(p=>{if(!G.ethicalCounters[p.id])G.ethicalCounters[p.id]={honest:0,shortcut:0,honestDelivery:0,disguisedDelivery:0,blocked:0,agreement:0}})}
  SedeHooks.on("onlineStateApplied",ensureStats);
  let previous=null;
  function floatAt(target,text,good){if(!target)return;const el=document.createElement("span");el.className="float-delta "+(good?"good":"bad");el.textContent=text;const r=target.getBoundingClientRect();el.style.left=(r.left+r.width/2+window.scrollX)+"px";el.style.top=(r.top+window.scrollY)+"px";document.body.appendChild(el);setTimeout(()=>el.remove(),1250)}
  SedeHooks.on("afterRender",function(){
    const prior=previous,id=G&&(G.sessionId||"shared"),water=G?+G.aquifer:10,pos=G?(G.players||[]).map(p=>p.pos):[],score=G?(G.players||[]).map(p=>p.score):[];
    mountSound();const meter=$("#trackWrap");if(meter){meter.classList.remove("water-healthy","water-dry","water-critical");meter.classList.add("water-"+waterState())}
    if(G){ensureStats();const same=prior&&prior.id===id,change=same?water-prior.water:0;if(change){floatAt($("#trackWrap .track")||$("#trackWrap"),(change>0?"+":"")+change,change>0);sound(change>0?"water":"warning")}if(same&&prior.pos)pos.forEach((p,i)=>{if(p!==prior.pos[i])sound("step");const d=p===undefined?0:score[i]-(prior.score[i]||0);if(d){floatAt($("#players .player-row:nth-child("+(i+1)+")"),(d>0?"+":"")+d+" pts",d>0);if(d>0)sound("score")}});previous={id:id,water:water,pos:pos,score:score}}else previous=null;
  });  function cardFx(){const face=$("#overlay .cards-face");if(!face)return;const title=$("#overlay .eyebrow"),txt=title?title.textContent.toLowerCase():"";face.classList.add("physical-card");if(face.querySelector(".impact-seal"))return;const seal=document.createElement("span");seal.className="impact-seal "+(txt.includes("dilema")||txt.includes("crise")?"risk":txt.includes("entrega")?"water":"");seal.textContent=txt.includes("entrega")?"IMPACTO HÍDRICO":txt.includes("dilema")?"ESCOLHA ÉTICA":txt.includes("power")?"RECURSO DE APOIO":"PECÉM · CAMPO";face.insertBefore(seal,face.firstChild)}
  SedeHooks.on("dialogRendered",function(){requestAnimationFrame(function(){if($("#overlay .cards-face")){cardFx();sound("card")}})});
  SedeHooks.on("actionStarted",function(event){if(event&&event.type==="roll")sound("dice")});
  SedeHooks.on("dilemmaResolved",function(event){if(!G||!event||!event.player)return;ensureStats();const player=event.player,key=event.honest?"honest":"shortcut";G.decisions.push({round:G.round,playerId:player.id,playerName:player.name,choice:key,title:event.card&&event.card.title});G.ethicalCounters[player.id][key]++});
  SedeHooks.on("deliveryResolved",function(event){if(!G||!event||!event.player)return;ensureStats();G.deliveryResults.push({round:G.round,playerId:event.player.id,playerName:event.player.name,honest:!!event.honest,card:event.cargo&&event.cargo.name});G.ethicalCounters[event.player.id][event.honest?"honestDelivery":"disguisedDelivery"]++});
  const EVENTS=[
    {id:"estiagem",name:"Estiagem prolongada no Ceará",description:"A estiagem pressiona os poços: aquífero −1."},
    {id:"pico-ia",name:"Pico de processamento de IA",description:"A demanda computacional cresce: aquífero −1."},
    {id:"fiscalizacao",name:"Fiscalização ambiental no Tribunal",description:"Cargas maquiadas ativas são devolvidas; cada responsável perde 2 pontos."},
    {id:"reuso",name:"Mutirão de reuso de água",description:"Comunidade e universidade recuperam 1 ponto do aquífero."},
    {id:"acordo",name:"Acordo regional de poupança",description:"Os territórios coordenam a demanda: aquífero +1."}
  ];
  SedeHooks.on("roundAdvanced",function(event){
    if(!G||!G.game)return;const round=event&&event.round||G.round;if(round<=1||(round-1)%2!==0||G.lastEventRound===round)return;
    G.lastEventRound=round;ensureStats();const item=EVENTS[Math.floor(Math.random()*EVENTS.length)],applied=SedeRules.applyGlobalEvent(G,item.id);G=applied.state;G.events.push({round:round,id:item.id,name:item.name,description:item.description});G.lastEvent=item.name+": "+item.description;G.newsTicker="EVENTO GLOBAL · "+G.lastEvent;
    if(applied.messages.length)applied.messages.forEach(addLog);else addLog("Evento global da rodada "+round+" — "+item.name+". "+item.description);
    render();toast("Evento global: "+item.name);sound(item.id==="estiagem"||item.id==="pico-ia"?"warning":"water")
  });
  function leaders(rows){
    const max=rows.length?rows[0].n:0;
    return max?rows.filter(function(row){return row.n===max}).map(function(row){return esc(row.p.name)}).join(" · "):"nenhum registro";
  }
  function debriefHtml(){
    ensureStats();const count=G.ethicalCounters||{},players=G.players||[],best=players.map(p=>({p:p,n:(count[p.id].honest||0)+(count[p.id].honestDelivery||0)})).sort((a,b)=>b.n-a.n),risk=players.map(p=>({p:p,n:(count[p.id].shortcut||0)+(count[p.id].disguisedDelivery||0)})).sort((a,b)=>b.n-a.n);
    const ethical=(G.decisions||[]).filter(x=>x.choice==="honest").length,shortcuts=(G.decisions||[]).filter(x=>x.choice==="shortcut").length,good=(G.deliveryResults||[]).filter(x=>x.honest).length,bad=(G.deliveryResults||[]).filter(x=>!x.honest).length,events=(G.events||[]).map(x=>esc(x.name)).join(" · ")||"Nenhum evento global.";
    const transparent=leaders(best),risky=leaders(risk),elapsed=Math.max(1,Math.floor((G.durationMs||0)/1000)),duration=elapsed<60?elapsed+" s":Math.floor(elapsed/60)+" min"+(elapsed%60?" "+(elapsed%60)+" s":""),waterCost=10-(Number(G.aquifer)||0);
    const waterText=waterCost>=0?"−"+waterCost:"+"+Math.abs(waterCost),outcome=G.aquifer<=0?"Perda coletiva: os poços chegaram a zero.":"A mesa encerrou com água no aquífero.";
    return '<section class="debrief"><h3>Fechamento de campo</h3><p>'+outcome+' Unidades didáticas; sem conversão direta para litros ou kWh.</p><div class="debrief-grid"><div class="debrief-stat"><b>QUANTO CUSTA?</b>Variação líquida do aquífero: '+waterText+' · saldo '+G.aquifer+'/10 · '+duration+'.</div><div class="debrief-stat"><b>PARA QUEM?</b>O custo recaiu sobre a água comum. Mais atalhos e cargas maquiadas: '+risky+'.</div><div class="debrief-stat"><b>QUEM DECIDIU?</b>'+ethical+' respostas transparentes · '+shortcuts+' atalhos. Mais escolhas transparentes: '+transparent+'.</div><div class="debrief-stat"><b>SEM AUDITORIA</b>'+bad+' carga(s) maquiada(s) chegaram ao destino · '+(G.auditCount||0)+' fiscalização(ões) · '+(G.auditFinds||0)+' carga(s) revelada(s).</div><div class="debrief-stat"><b>EFEITO REBOTE</b>'+(G.usedDeliveries||[]).length+' entrega(s) concluída(s) · '+(G.reboundCount||0)+' ativação(ões).</div></div><p class="small-note"><b>Eventos:</b> '+events+'</p><p class="small-note">Debate: quem arcou com o desgaste e quem escolheu a rota?</p></section>'
  }
  function putDebrief(){const box=$("#overlay .modal");if(!box||box.querySelector(".debrief"))return;const actions=box.querySelector(".form-actions");if(actions)actions.insertAdjacentHTML("beforebegin",debriefHtml());else box.insertAdjacentHTML("beforeend",debriefHtml())}
  SedeHooks.on("gameEnded",function(){requestAnimationFrame(putDebrief)});
  mountSound();render()
})();




/* Aviso animado e não bloqueante para o jogador da vez. */
(()=>{
  let announced="",pending="",timer=0,hideTimer=0;
  const $=selector=>document.querySelector(selector);
  function showCue(player,key){
    let cue=$("#turnSplash");if(cue)cue.remove();
    cue=document.createElement("aside");cue.id="turnSplash";cue.setAttribute("role","status");cue.setAttribute("aria-live","polite");
    const index=G.players.indexOf(player);
    cue.innerHTML='<div class="turn-splash-card"><span class="turn-splash-piece" style="--piece-color:'+esc(player.color)+'">'+(index+1)+'</span><div class="turn-splash-copy"><small>SEDE DE NUVEM · PECÉM</small><strong>A MESA ESTÁ COM VOCÊ</strong><b>'+esc(player.name)+'</b><span>Confira a carga e trace a rota.</span></div><button type="button" class="turn-splash-close" aria-label="Fechar aviso">×</button></div>';
    document.body.appendChild(cue);
    requestAnimationFrame(()=>cue.classList.add("turn-splash-visible"));
    cue.querySelector(".turn-splash-close").onclick=()=>dismiss(cue);
    clearTimeout(hideTimer);hideTimer=setTimeout(()=>dismiss(cue),2800);
  }
  function dismiss(cue){if(!cue||!cue.isConnected)return;cue.classList.remove("turn-splash-visible");setTimeout(()=>cue.remove(),300)}
  function tryShow(){
    timer=0;
    if(!G||!G.game||!rulesSeen||!isMyTurn()||!current()){pending="";return}
    const p=current(),key=(G.sessionId||"partida")+":"+G.turnSerial+":"+p.id;
    if(key!==pending){pending="";return}
    const overlay=$("#overlay");
    if(overlay&&!overlay.classList.contains("hidden")){timer=setTimeout(tryShow,300);return}
    pending="";if(announced===key)return;announced=key;showCue(p,key)
  }
  function requestCue(){
    if(!G||!G.game||!rulesSeen||!isMyTurn()||!current())return;
    const p=current(),key=(G.sessionId||"partida")+":"+G.turnSerial+":"+p.id;
    if(key===announced||key===pending)return;
    clearTimeout(timer);pending=key;timer=setTimeout(tryShow,220)
  }
  SedeHooks.on("afterRender",requestCue);
})();


/* Conselho aberto: uma reação coletiva pode travar um atalho ou propor poupança. */
(()=>{
  const $=selector=>document.querySelector(selector);
  const applyDilemma=resolveDilemma;
  function responder(){
    const council=G&&G.pendingChoice;
    return council&&council.type==="council"?G.players.find(player=>player.id===council.responders[council.index]):null;
  }
  function maySpeak(player){return!!player&&(!G.online||player.uid===G.online.uid)}
  function recordIntervention(player,choice,card){
    ensureCouncilStats();
    G.decisions.push({round:G.round,playerId:player.id,playerName:player.name,choice:choice,title:card.title});
    G.ethicalCounters[player.id][choice]=(G.ethicalCounters[player.id][choice]||0)+1;
  }
  function ensureCouncilStats(){
    G.decisions=G.decisions||[];G.ethicalCounters=G.ethicalCounters||{};
    G.players.forEach(player=>{G.ethicalCounters[player.id]=G.ethicalCounters[player.id]||{honest:0,shortcut:0,honestDelivery:0,disguisedDelivery:0,blocked:0,agreement:0}});
  }
  function applyChoice(honest,card){
    G.pendingChoice={type:"dilemma",card:card};
    G.bypassCouncil=true;const result=applyDilemma.call(this,honest,card);G.bypassCouncil=false;return result;
  }
  function showCouncil(){
    const pending=G&&G.pendingChoice;if(!pending)return;
    if(pending.type==="council"){
      const voter=responder();
      if(!voter){finishCouncil();return}
      const actor=G.players.find(player=>player.id===pending.actorId),canVote=maySpeak(voter);
      const actions=canVote?'<div class="choice-grid">'+(voter.interventionTokens>0?'<button class="choice risky" id="councilVeto" type="button">ACIONAR O TRIBUNAL<small>Gaste 1 ficha e bloqueie o atalho. O responsável perde 1 ponto; a água fica preservada.</small></button>':'')+'<button class="choice" id="councilAgreement" type="button">PROPOR ACORDO DE POUPANÇA<small>'+esc(voter.name)+' pede uma troca transparente; '+esc(actor?actor.name:"quem propôs")+' decide se aceita.</small></button><button class="btn council-pass" id="councilPass" type="button">Passar a palavra</button></div>':'<div class="status-msg">Aguardando '+esc(voter.name)+' reagir ao atalho de '+esc(actor?actor.name:"outro jogador")+'.</div>';
      modal('<span class="eyebrow">TRIBUNAL · RODADA DE NEGOCIAÇÃO</span><h2>O atalho vai custar água comum</h2><div class="cards-face"><span class="card-label">⚠️ '+esc(pending.card.theme.toUpperCase())+'</span><h3>'+esc(pending.card.title)+'</h3><p>'+esc(pending.card.shortcut)+'</p><p class="card-note">'+esc(actor?actor.name:"Um jogador")+' propôs avançar 3 casas e reduzir o aquífero em 1. Cada colega pode agir, negociar ou passar.</p></div><p class="council-order"><b>Vez de reagir:</b> '+esc(voter.name)+' · fichas do Tribunal: '+voter.interventionTokens+'</p>'+actions);
      if(canVote){const veto=$("#councilVeto"),agreement=$("#councilAgreement"),pass=$("#councilPass");if(veto)veto.onclick=()=>submitCouncil(voter.id,"veto");agreement.onclick=()=>submitCouncil(voter.id,"agreement");pass.onclick=()=>submitCouncil(voter.id,"pass")}
      return;
    }
    if(pending.type==="councilActor"){
      const actor=G.players.find(player=>player.id===pending.actorId),proposer=G.players.find(player=>player.id===pending.agreementBy),canDecide=maySpeak(actor);
      const actions=canDecide?'<div class="choice-grid"><button class="choice" id="acceptPact" type="button">🤝 Aceitar o acordo<small>Responder com transparência: sem perda de água, recebe um Power Up e encerra o movimento.</small></button><button class="choice risky" id="rejectPact" type="button">⚡ Recusar e seguir o atalho<small>Avançar 3 casas, aquífero −1 e carga maquiada, se houver.</small></button></div>':'<div class="status-msg">Aguardando '+esc(actor?actor.name:"quem propôs")+' aceitar ou recusar o acordo de '+esc(proposer?proposer.name:"outro jogador")+'.</div>';
      modal('<span class="eyebrow">ACORDO DE POUPANÇA · DECISÃO FINAL</span><h2>'+esc(proposer?proposer.name:"Outro jogador")+' propôs poupar o aquífero</h2><div class="cards-face"><h3>'+esc(pending.card.title)+'</h3><p>'+esc(pending.card.honest)+'</p><p class="card-note">A proposta é pública. Aceitar encerra o atalho; recusar mantém o ganho rápido e o custo compartilhado.</p></div>'+actions);
      if(canDecide){$("#acceptPact").onclick=()=>finishCouncil("agreement");$("#rejectPact").onclick=()=>finishCouncil("shortcut")}
    }
  }
  function submitCouncil(playerId,choice){
    let pending=G&&G.pendingChoice;const voter=responder();
    if(!pending||pending.type!=="council"||!voter||voter.id!==playerId||!maySpeak(voter))return;
    if(choice==="veto"){
      const transition=SedeRules.applyCouncil(G,playerId,pending.actorId,"veto");if(!transition.valid)return;
      G=transition.state;const activePending=G.pendingChoice;activePending.vetoBy=playerId;recordIntervention(G.players.find(player=>player.id===playerId),"blocked",activePending.card);finishCouncil("veto");return;
    }
    if(choice==="agreement"&&!pending.agreementBy){const transition=SedeRules.applyCouncil(G,playerId,pending.actorId,"agreement");if(!transition.valid)return;G=transition.state;pending=G.pendingChoice;pending.agreementBy=playerId;recordIntervention(G.players.find(player=>player.id===playerId),"agreement",pending.card);}
    pending.index++;if(pending.index>=pending.responders.length)finishCouncil();else{render();showCouncil();sync()}
  }
  function finishCouncil(result){
    const pending=G&&G.pendingChoice;if(!pending)return;
    if(pending.type==="council"&&result!=="veto"&&pending.agreementBy){
      G.pendingChoice={type:"councilActor",actorId:pending.actorId,agreementBy:pending.agreementBy,card:pending.card};
      render();showCouncil();sync();return;
    }
    const card=pending.card,actor=G.players.find(player=>player.id===pending.actorId)||current();
    G.pendingChoice=null;closeModal();
    if(result==="veto"){
      addLog("O Tribunal bloqueou o atalho de "+actor.name+". Uma ficha foi gasta; o aquífero foi preservado e o responsável perdeu 1 ponto.");render();sync();return;
    }
    const honest=result==="agreement";
    if(honest)addLog(actor.name+" aceitou o Acordo de Poupança proposto pela mesa.");
    applyChoice(honest,card);
  }
  SedeHooks.on("beforeDilemma",function(event){
    if(!G||!G.pendingChoice||G.pendingChoice.type!=="dilemma"||!event||!event.player)return;
    const actor=event.player,responders=G.players.filter(player=>player.id!==actor.id).map(player=>player.id);
    G.pendingChoice={type:"council",actorId:actor.id,card:event.card,responders:responders,index:0,agreementBy:null,vetoBy:null};
    addLog(actor.name+" propôs um atalho. A mesa pode acionar o Tribunal ou negociar poupança.");render();showCouncil();sync();return true;
  });
  SedeHooks.on("renderChoice",function(event){
    if(!event||!event.choice||!["council","councilActor"].includes(event.choice.type))return;
    showCouncil();return true;
  });})();


/* Fecha o relatório com a série do aquífero, contrato e pegadas individuais. */
(()=>{
  const $=selector=>document.querySelector(selector);
  function aquiferChart(){
    const rows=(G.aquiferHistory||[]).slice(-40);
    if(!rows.length)return '<p class="small-note">Sem registros de variação do aquífero.</p>';
    const left=36,right=474,top=12,bottom=90,width=right-left,height=bottom-top;
    const points=rows.map((row,index)=>{
      const x=rows.length===1?left+width/2:left+index*width/(rows.length-1),y=bottom-(Math.max(0,Math.min(10,Number(row.value)||0))/10)*height;
      return{x:x,y:y,round:row.round||1,value:Math.max(0,Math.min(10,Number(row.value)||0))};
    });
    const polyline=points.map(point=>point.x.toFixed(1)+","+point.y.toFixed(1)).join(" ");
    const dots=points.map(point=>'<circle cx="'+point.x.toFixed(1)+'" cy="'+point.y.toFixed(1)+'" r="2.6"><title>Rodada '+point.round+': aquífero '+point.value+'/10</title></circle>').join("");
    const first=points[0],last=points[points.length-1],minimum=Math.min.apply(null,points.map(point=>point.value));
    return '<svg class="aquifer-chart" viewBox="0 0 500 112" role="img" aria-label="Evolução do aquífero: começou em '+first.value+' de 10 e terminou em '+last.value+' de 10"><path class="chart-grid" d="M36 12H474M36 51H474M36 90H474"/><text x="8" y="15">10</text><text x="15" y="54">5</text><text x="22" y="93">0</text><polyline points="'+polyline+'"/>'+dots+'<text x="36" y="107">início · rodada '+first.round+'</text><text x="474" y="107" text-anchor="end">fim · rodada '+last.round+'</text></svg><p class="small-note">O aquífero saiu de <b>'+first.value+'/10</b>, chegou ao mínimo de <b>'+minimum+'/10</b> e terminou em <b>'+last.value+'/10</b>. A escala é didática; não representa litros.</p>';
  }
  function addReportDetails(){
    const report=$("#overlay .debrief");if(!report||report.querySelector(".aquifer-chart"))return;
    const contract=G.contract||{},contractText=contract.complete?"Concluído; participantes receberam a recompensa coletiva.":contract.failed?"Não concluído no prazo; o custo coletivo foi aplicado.":"Sem desfecho registrado.";
    const players=(G.players||[]).map(player=>{const band=SedeRules.footprintBand(player);return '<div class="report-player"><span class="report-player-name"><i style="background:'+esc(player.color)+'"></i>'+esc(player.name)+'</span><b class="footprint-badge '+band.className+'">'+band.label+'</b><small>Água '+player.footprint.water+' · Energia '+player.footprint.energy+'</small></div>'}).join("");
    const history='<section class="report-section"><h4>Traçado do aquífero</h4>'+aquiferChart()+'</section>';
    const team='<section class="report-section"><h4>Fechamento de equipe</h4><p class="small-note"><b>Contrato:</b> '+esc(contractText)+' <span class="contract-result">Progresso: '+(contract.visitedSites||[]).length+'/'+(contract.sites||[]).length+' pontos.</span></p><div class="report-footprints">'+players+'</div></section>';
    report.insertAdjacentHTML("beforeend",history+team);
  }
  SedeHooks.on("gameEnded",function(){requestAnimationFrame(addReportDetails)});
})();


