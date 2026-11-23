/* Renderização do tabuleiro e dos painéis. Regras ficam em game-rules.js. */
"use strict";

function trackHTML() {
  const water = G ? G.aquifer : 10;
  return '<div class="track-head"><span><i class="bi bi-droplet-half" aria-hidden="true"></i> Aquífero compartilhado</span><strong>' + water + ' / 10</strong></div>' +
    '<div class="track" role="meter" aria-label="Nível do aquífero" aria-valuemin="0" aria-valuemax="10" aria-valuenow="' + water + '"><i style="width:' + water * 10 + '%"></i></div>' +
    '<div class="track-caption"><span>0 · crise coletiva</span><span>10 · recurso preservado</span></div>';
}

function drawBoard() {
  const board = $("board");
  board.innerHTML = "";
  for (let i = 0; i < 32; i++) {
    const stateTerritory = territoryAt(i), seed = TERRITORY_SEEDS.find(function (item) { return item.house - 1 === i; });
    const kind = houseTypeAt(i), info = seed ? { icon: seed.icon, label: seed.short, name: seed.name } : HOUSE_INFO[kind];
    const cell = document.createElement("div");
    cell.className = "cell " + kind;
    cell.style.gridRow = String(COORDS[i][0] + 1);
    cell.style.gridColumn = String(COORDS[i][1] + 1);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", "Casa " + (i + 1) + ": " + (seed ? seed.name : info.name));
    const number = document.createElement("span"); number.className = "num"; number.textContent = String(i + 1); cell.appendChild(number);
    if (stateTerritory && stateTerritory.owner != null && G && G.players[stateTerritory.owner]) {
      const owner = document.createElement("span"); owner.className = "owner-mark";
      owner.style.background = G.players[stateTerritory.owner].color; owner.title = "Controlado por " + G.players[stateTerritory.owner].name; cell.appendChild(owner);
    }
    const icon = document.createElement("span"); icon.className = "ico"; icon.setAttribute("aria-hidden", "true"); icon.textContent = info.icon; cell.appendChild(icon);
    const label = document.createElement("span"); label.className = "label"; label.textContent = info.label; cell.appendChild(label);
    const tokens = document.createElement("span"); tokens.className = "tokens";
    if (G) G.players.forEach(function (player, index) {
      if (player.pos !== i) return;
      const token = document.createElement("span"); token.className = "token"; token.style.background = player.color;
      token.setAttribute("aria-label", "Marcador " + player.colorName); token.title = "Marcador " + player.colorName; tokens.appendChild(token);
      if (index === G.pi) cell.classList.add("active");
    });
    cell.appendChild(tokens); board.appendChild(cell);
  }
  const center = document.createElement("div"); center.className = "board-center";
  center.setAttribute("aria-label", "Mapa do Pecém e estado do aquífero");
  center.innerHTML = '<span>PECÉM · CEARÁ</span><strong class="center-water">AQUÍFERO · ' + (G ? G.aquifer : 10) + ' / 10</strong>';
  board.appendChild(center);
  if (window.SedeHooks) window.SedeHooks.emit("boardRendered", { board: board, state: G });
}

function renderPlayers() {
  const box = $("players"), announcement = $("turnAnnouncement");
  if (!G) {
    announcement.innerHTML = "";
    box.innerHTML = '<div class="card-note">Comece uma partida para escolher os marcadores.</div>';
    return;
  }
  const active = current(), myTurn = isMyTurn();
  announcement.innerHTML = '<div class="turn-banner"><span class="turn-icon"><i class="bi bi-dice-5" aria-hidden="true"></i></span><div><small>AGORA É A VEZ DE</small><strong>' + esc(active.name) + '</strong><em>' +
    (myTurn ? "Confira a carga e lance o dado." : "A rota está com outro marcador.") + '</em></div></div>' +
    (G.turnNotice && G.turnNoticeSerial === G.turnSerial ? '<p class="turn-notice">' + esc(G.turnNotice) + '</p>' : "");
  box.innerHTML = G.players.map(function (player, index) {
    const controlled = G.territories.filter(function (item) { return item.owner === index; }).length;
    const cargo = player.cargo ? (player.cargo.pickedUp ? "coletada" : "busca origem") + " · " + (player.cargo.serviceLevel === "express" ? "expressa" : player.cargo.serviceLevel === "standard" ? "padrão" : "SLA pendente") + (player.cargo.serviceLevel ? " " + Math.max(0, player.cargo.expiresRound - G.round) + "r" : "") + " · " + (player.cargo.maquiada ? "maquiada" : "transparente") : "sem carga";
    const support = [player.anaceConsulted ? "+1 Anacé" : "", player.windCredit ? "crédito eólico" : ""].filter(Boolean).join(" · ");
    const band = SedeRules.footprintBand(player), activePlayer = index === G.pi;
    const badge = activePlayer ? (myTurn ? "SUA VEZ" : "VEZ ATUAL") : "NA FILA";
    return '<div class="player-row ' + (activePlayer ? "current turn-highlight" : "") + '"><span class="player-chip" style="background:' + esc(player.color) + '" aria-label="Marcador '+esc(player.colorName)+'"></span><div class="player-text"><div class="player-name-row"><b>' + esc(player.name) + '</b><span class="turn-badge ' +
      (activePlayer ? "active" : "") + '">' + badge + '</span></div><small>' + controlled + ' territórios · ' + cargo + '</small><small class="footprint-line"><b class="footprint-badge ' + band.className + '">' +
      band.label + '</b> · água ' + player.footprint.water + ' · energia ' + player.footprint.energy + ' · Tribunal ' + player.interventionTokens + (support ? ' · ' + esc(support) : '') + '</small></div><div class="player-score">' +
      player.score + ' pts<small>' + player.deliveries + '/3 entregas</small></div></div>';
  }).join("");
}

function renderCargo() {
  const box = $("cargoPanel");
  if (!G || !current()) { box.innerHTML = '<p class="card-note">A partida ainda não começou.</p>'; return; }
  const player = current(), cargo = player.cargo;
  $("deliveryProgress").textContent = player.deliveries + " / 3";
  if (!cargo) {
    box.innerHTML = '<div class="cargo-card"><b>Sem carga ativa</b><p>Uma carta de Entrega será sorteada no início do seu turno.</p></div>';
    return;
  }
  const from = TERRITORY_SEEDS.find(function (item) { return item.house === cargo.from; });
  const to = TERRITORY_SEEDS.find(function (item) { return item.house === cargo.to; });
  const rounds = Math.max(0, cargo.expiresRound - G.round);
  const level = cargo.serviceLevel === "express" ? "EXPRESSA · ALTA DEMANDA" : "PADRÃO";
  box.innerHTML = '<article class="cargo-card"><span class="card-label">📦 CARTA DE ENTREGA · ' + level + '</span><h3>' + esc(cargo.name) + '</h3><p>' + esc(cargo.note) +
    '</p><div class="cargo-route"><span>Origem: ' + esc(from ? from.short : "Território") + '</span><span>Destino: ' + esc(to ? to.short : "Território") +
    '</span></div><div class="cargo-state">' + (cargo.pickedUp ? "CARGA COLETADA · " : "PASSE PELA ORIGEM · ") + "PRAZO: " + rounds + " RODADA(S)</div></article>";
  const stateLine=document.createElement("div");stateLine.className="cargo-status-strip";
  stateLine.innerHTML='<b class="cargo-transparency '+(cargo.maquiada?'risk':'clear')+'">'+(cargo.maquiada?'MAQUIADA':'TRANSPARENTE')+'</b>'+(player.anaceConsulted?'<span>ANACÉ · +1 NA PRÓXIMA ENTREGA</span>':'')+(player.windCredit?'<span>CRÉDITO EÓLICO DISPONÍVEL</span>':'');
  box.querySelector(".cargo-card").appendChild(stateLine);
}

function renderTerritories() {
  const box = $("territoryList");
  if (!G) { box.innerHTML = ""; return; }
  box.innerHTML = G.territories.map(function (territory) {
    const owner = territory.owner == null ? "Neutro" : G.players[territory.owner].name;
    const color = territory.owner == null ? "#d5d0bd" : G.players[territory.owner].color;
    return '<div class="territory-item" title="Casa ' + territory.house + '"><span class="territory-dot" style="background:' + esc(color) + '"></span><span>' +
      esc(territory.short) + '<br><small>' + esc(owner) + '</small></span></div>';
  }).join("");
}

function renderLog() {
  const box = $("log");
  if (!G) { box.innerHTML = '<div class="log-entry"><p>A partida ainda não começou. Use o menu inicial para jogar.</p></div>'; return; }
  box.innerHTML = (G.log || []).map(function (item) {
    return '<div class="log-entry"><small>RODADA ' + item.round + '</small><p>' + esc(item.text) + '</p></div>';
  }).join("");
}

function renderContract() {
  const box = $("contractPanel");
  if (!box) return;
  if (!G || !G.contract) { box.innerHTML = '<p class="card-note">O contrato aparece ao iniciar uma partida.</p>'; return; }
  const contract = G.contract;
  const labels = { porto: "Porto", eolica: "Parque Eólico", datacenter: "Data Center" };
  const sites = contract.sites.map(function (site) {
    const done = contract.visitedSites.includes(site);
    return '<li class="contract-site ' + (done ? "done" : "") + '"><span>' + (done ? "✓" : "○") + '</span>' + labels[site] + '</li>';
  }).join("");
  const roundsLeft=Math.max(0,contract.deadlineRound-G.round+1),participants=(contract.participants||[]).length;
  let status = contract.complete ? "Concluído · +2 pontos por participante e aquífero +2" : contract.failed ? "Prazo encerrado · custo coletivo aplicado" :
    contract.visitedSites.length===contract.sites.length&&participants<2 ? "Locais conectados · falta uma segunda pessoa participar" : "Rodada 6 · faltam "+roundsLeft+" rodada(s)";
  box.innerHTML = '<div class="contract-card ' + (contract.complete ? "complete" : contract.failed ? "failed" : "") + '"><b>Contrato compartilhado</b><h3>' + esc(contract.name) +
    '</h3><ul>' + sites + '</ul><div class="contract-progress"><b>'+participants+'</b> participante(s) · <b>'+contract.visitedSites.length+'/3</b> locais · <span>'+esc(status)+'</span></div></div>';
}

function renderLastMove() {
  const box = $("lastMoveSummary");
  if (!box) return;
  const move = G && G.lastMove;
  box.innerHTML = move ? '<div class="last-move-card"><small>RODADA ' + move.round + ' · ' + esc(move.playerName) + '</small><p>' + esc(move.text) + '</p></div>' :
    '<div class="last-move-card"><small>RESUMO DA ÚLTIMA JOGADA</small><p>A partida ainda não começou.</p></div>';
}

function renderImpactPreview() {
  const box = $("impactPreview");
  if (!box) return;
  if (!G || !current()) { box.innerHTML = ""; return; }
  const player = current();
  if (G.previewTarget != null) {
    const impact = SedeRules.landingPreview(G.previewTarget, player);
    box.innerHTML = '<b>Prévia do impacto</b><p>O dado indicou a casa ' + (G.previewTarget + 1) + '. ' + esc(impact || "A casa não tem efeito especial conhecido.") + '</p>';
    return;
  }
  if (player.cargo) {
    const preview = SedeRules.deliveryPreview(G, player, player.cargo.serviceLevel || "standard");
    box.innerHTML = '<b>Prévia do impacto</b><p>' + esc(preview.summary) + ' · até ' + preview.honestPoints + ' pontos se a entrega for transparente.</p>';
    return;
  }
  box.innerHTML = '<b>Prévia do impacto</b><p>Na próxima carta, compare Entrega Padrão (3 rodadas) e Expressa (2 rodadas, aquífero −1).</p>';
}

function render() {
  $("trackWrap").innerHTML = trackHTML();
  drawBoard(); renderPlayers(); renderCargo(); renderTerritories(); renderContract(); renderLastMove(); renderImpactPreview(); renderLog();
  const demoPanel=$("demoToolsPanel");if(demoPanel)demoPanel.hidden=!(G&&G.demoMode);
  if (!G) { if(window.SedeHooks)window.SedeHooks.emit("afterRender",{state:G}); return; }
  const roundLimit=G.roundLimit||10;
  $("round").textContent = "RODADA " + Math.min(G.round, roundLimit) + " / " + roundLimit;
  $("dilemmaCount").textContent = (G.dilemmaDeck || []).length + " no baralho · 10 no total";
  $("powerCount").textContent = (G.powerDeck || []).length + " no baralho · 18 no total";
  $("deliveryCount").textContent = (G.deliveryDeck || []).length + " no baralho · 8 no total";
  $("territoryCount").textContent = "8 cartas · sorteio inicial";
  $("diceFace").textContent = G.lastRoll ? "⚀⚁⚂⚃⚄⚅"[G.lastRoll - 1] : "🎲";
  $("diceLabel").textContent = G.lastRoll ? (G.players[G.pi].name + " tirou " + G.lastRoll) : "Dado de 6 faces";
  $("turnMsg").textContent = !G.game ? "Partida encerrada." : !isMyTurn() ? "A decisão agora é de " + current().name + "." :
    G.pendingChoice ? "A carta está aberta; conversem antes de escolher." : G.pendingLanding != null ? "Confira o registro desta casa antes de seguir." : G.rolled ? "Rota traçada. Encerre o turno depois da conversa." : "Sua vez no Pecém. Lance o dado e confira o impacto.";
  $("rollBtn").disabled = !canAct() || G.rolled;
  $("endTurnBtn").disabled = !canAct() || !G.rolled;
  if(window.SedeHooks)window.SedeHooks.emit("afterRender",{state:G});
}
