/* Regras e estado de domínio do Sede de Nuvem. Sem dependência do DOM. */
(function (root) {
  "use strict";

  const CONTRACT_SITES = ["porto", "eolica", "datacenter"];
  const VALID_CHOICES = ["delivery", "dilemma", "power", "council", "councilActor"];
  const isRecord = function (value) { return !!value && typeof value === "object" && !Array.isArray(value); };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  function cloneState(state) {
    const online = state && state.online;
    const source = Object.assign({}, state || {});
    delete source.online;
    const copy = JSON.parse(JSON.stringify(source));
    if (online) copy.online = online;
    return copy;
  }

  function createContract(round) {
    return {
      id: "corredor-regional",
      name: "Corredor Porto · Parque Eólico · Data Center",
      sites: CONTRACT_SITES.slice(),
      visitedSites: [],
      participants: [],
      deadlineRound: Math.min(6, (round || 1) + 5),
      complete: false,
      failed: false
    };
  }

  function normalize(state) {
    if (!state || typeof state !== "object") return state;
    state.version = Math.max(2, Number(state.version) || 0);
    state.aquifer = clamp(state.aquifer, 0, 10);
    state.deliveriesThisRound = Math.max(0, Math.floor(Number(state.deliveriesThisRound) || 0));
    state.rebateBlockedRound = Math.max(0, Math.floor(Number(state.rebateBlockedRound) || 0));
    state.aquiferHistory = Array.isArray(state.aquiferHistory) && state.aquiferHistory.length
      ? state.aquiferHistory
      : [{ round: state.round || 1, value: state.aquifer, delta: 0, reason: "Estado inicial ou retomado" }];
    state.lastMove = state.lastMove || null;
    state.moveRemaining = Math.max(0, Number(state.moveRemaining) || 0);
    state.contract = isRecord(state.contract) ? state.contract : createContract(state.round || 1);
    state.contract.sites = Array.isArray(state.contract.sites) ? state.contract.sites : CONTRACT_SITES.slice();
    state.contract.visitedSites = Array.isArray(state.contract.visitedSites) ? state.contract.visitedSites : [];
    state.contract.participants = Array.isArray(state.contract.participants) ? state.contract.participants : [];
    state.contract.deadlineRound = Number(state.contract.deadlineRound) || 6;
    state.pendingChoice = state.pendingChoice || null;
    state.events = Array.isArray(state.events) ? state.events : [];
    state.decisions = Array.isArray(state.decisions) ? state.decisions : [];
    state.deliveryResults = Array.isArray(state.deliveryResults) ? state.deliveryResults : [];
    state.log = Array.isArray(state.log) ? state.log : [];
    state.usedDeliveries = Array.isArray(state.usedDeliveries) ? state.usedDeliveries : [];
    state.deliveryDeck = Array.isArray(state.deliveryDeck) ? state.deliveryDeck : [];
    state.deliveryDiscard = Array.isArray(state.deliveryDiscard) ? state.deliveryDiscard : [];
    state.dilemmaDeck = Array.isArray(state.dilemmaDeck) ? state.dilemmaDeck : [];
    state.dilemmaDiscard = Array.isArray(state.dilemmaDiscard) ? state.dilemmaDiscard : [];
    state.powerDeck = Array.isArray(state.powerDeck) ? state.powerDeck : [];
    state.powerDiscard = Array.isArray(state.powerDiscard) ? state.powerDiscard : [];
    state.ethicalCounters = isRecord(state.ethicalCounters) ? state.ethicalCounters : {};
    state.auditCount = Math.max(0, Number(state.auditCount) || 0);
    state.auditFinds = Math.max(0, Number(state.auditFinds) || 0);
    state.reboundCount = Math.max(0, Number(state.reboundCount) || 0);
    state.revision = Math.max(0, Math.floor(Number(state.revision) || 0));
    (Array.isArray(state.players) ? state.players : []).forEach(function (player) {
      if (!isRecord(player)) return;
      player.footprint = isRecord(player.footprint) ? player.footprint : { water: 0, energy: 0 };
      player.footprint.water = Math.max(0, Number(player.footprint.water) || 0);
      player.footprint.energy = Math.max(0, Number(player.footprint.energy) || 0);
      player.interventionTokens = player.interventionTokens == null ? 1 : clamp(player.interventionTokens, 0, 2);
      player.windCredit = !!player.windCredit;
      player.anaceConsulted = !!player.anaceConsulted;
    });
    return state;
  }

  function validate(state) {
    const errors = [];
    if (!state || typeof state !== "object") return ["Estado de jogo ausente."];
    if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 4) errors.push("A partida precisa ter de 2 a 4 jogadores.");
    const players = Array.isArray(state.players) ? state.players : [];
    if (!Number.isInteger(state.pi) || state.pi < 0 || state.pi >= players.length) errors.push("Índice do jogador da vez inválido.");
    if (!Number.isInteger(state.round) || state.round < 1 || state.round > 10) errors.push("Rodada fora do intervalo permitido.");
    if (!Number.isInteger(state.revision) || state.revision < 0) errors.push("Revisão da partida inválida.");
    if (!Number.isFinite(state.aquifer) || state.aquifer < 0 || state.aquifer > 10) errors.push("Nível do aquífero inválido.");
    if (!Number.isInteger(state.moveRemaining) || state.moveRemaining < 0 || state.moveRemaining > 6) errors.push("Movimento pendente inválido.");
    players.forEach(function (player, index) {
      if (!isRecord(player)) { errors.push("Registro de jogador inválido."); return; }
      if (!Number.isInteger(player.pos) || player.pos < 0 || player.pos > 31) errors.push("Posição inválida para o jogador " + (index + 1) + ".");
      if (!Number.isFinite(player.score) || player.score < -1000) errors.push("Pontuação inválida para o jogador " + (index + 1) + ".");
    });
    if (!Array.isArray(state.territories)) errors.push("Lista de territórios inválida.");
    (Array.isArray(state.territories) ? state.territories : []).forEach(function (territory) {
      if (!isRecord(territory)) { errors.push("Registro de território inválido."); return; }
      if (territory.owner != null && (!Number.isInteger(territory.owner) || territory.owner < 0 || territory.owner >= players.length)) errors.push("Controle de território inválido.");
    });
    if (state.pendingChoice && !VALID_CHOICES.includes(state.pendingChoice.type)) errors.push("Etapa de escolha pendente desconhecida.");
    return errors;
  }

  function validateOnlineState(state) {
    const errors = validate(state);
    if (!isRecord(state)) return errors;
    if (state.started !== true) errors.push("A sala ainda não iniciou uma partida.");
    if (!Number.isSafeInteger(state.revision) || state.revision < 0) errors.push("Revisão online inválida.");
    if (!Number.isInteger(state.aquifer) || state.aquifer < 0 || state.aquifer > 10) errors.push("Aquífero online fora da escala.");
    if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 4) return errors;
    state.players.forEach(function (player) {
      if (!isRecord(player) || typeof player.id !== "string" || typeof player.uid !== "string" || !player.uid || typeof player.name !== "string" || player.name.length > 18 || typeof player.color !== "string" || !Number.isInteger(player.deliveries) || player.deliveries < 0 || player.deliveries > 3) {
        errors.push("Jogador online malformado.");
      } else if (player.cargo != null && (!isRecord(player.cargo) || !Number.isInteger(player.cargo.from) || !Number.isInteger(player.cargo.to) || player.cargo.from < 1 || player.cargo.from > 32 || player.cargo.to < 1 || player.cargo.to > 32)) {
        errors.push("Carga online malformada.");
      }
    });
    if (!Array.isArray(state.territories) || state.territories.length !== 8) errors.push("A sala precisa conter os oito territórios.");
    else {
      const houses = state.territories.map(function (territory) { return territory && territory.house; });
      const expected = [4, 8, 12, 16, 20, 24, 28, 32];
      if (expected.some(function (house) { return !houses.includes(house); })) errors.push("As casas dos territórios estão incompletas.");
    }
    ["deliveryDeck", "deliveryDiscard", "dilemmaDeck", "dilemmaDiscard", "powerDeck", "powerDiscard", "log", "events", "decisions", "deliveryResults", "aquiferHistory"].forEach(function (key) {
      if (state[key] != null && !Array.isArray(state[key])) errors.push("Lista de sala inválida: " + key + ".");
    });
    if (Array.isArray(state.aquiferHistory) && state.aquiferHistory.length > 40) errors.push("Histórico do aquífero excede o limite.");
    const limits = { deliveryDeck: 8, deliveryDiscard: 8, dilemmaDeck: 10, dilemmaDiscard: 10, powerDeck: 18, powerDiscard: 18, log: 36, events: 10, decisions: 200, deliveryResults: 100 };
    Object.keys(limits).forEach(function (key) {
      if (Array.isArray(state[key]) && (state[key].length > limits[key] || state[key].some(function (item) { return !isRecord(item); }))) errors.push("Conteúdo ou tamanho inválido na lista " + key + ".");
    });
    if (Array.isArray(state.aquiferHistory) && state.aquiferHistory.some(function (item) { return !isRecord(item) || !Number.isInteger(item.value) || item.value < 0 || item.value > 10; })) errors.push("Histórico do aquífero malformado.");
    if (!isRecord(state.contract) || !Array.isArray(state.contract.sites) || !Array.isArray(state.contract.visitedSites) || !Array.isArray(state.contract.participants)) errors.push("Contrato regional malformado.");
    if (state.pendingChoice != null && (!isRecord(state.pendingChoice) || !VALID_CHOICES.includes(state.pendingChoice.type))) errors.push("Escolha pendente malformada.");
    return errors;
  }

  function currentPlayer(state) {
    return state && state.players && state.players[state.pi] || null;
  }

  function canPerform(state, action, actorId, onlineUid) {
    if (!state || !state.game || validate(state).length) return false;
    const actor = currentPlayer(state);
    if (!actor || actor.id !== actorId || onlineUid && actor.uid !== onlineUid) return false;
    if (state.moving || state.rolling) return false;
    const pending = state.pendingLanding != null || !!state.pendingChoice || !!state.combat;
    if (action === "roll") return !pending && !state.rolled && state.moveRemaining === 0;
    if (action === "finish") return !pending && !!state.rolled && state.moveRemaining === 0;
    if (action === "resolve") return pending;
    return false;
  }

  function changeAquifer(state, delta, reason) {
    const previous = clamp(state.aquifer, 0, 10);
    const next = clamp(previous + (Number(delta) || 0), 0, 10);
    state.aquifer = next;
    state.aquiferHistory = Array.isArray(state.aquiferHistory) ? state.aquiferHistory : [];
    if (next !== previous) {
      state.aquiferHistory.push({ round: state.round || 1, value: next, delta: next - previous, reason: String(reason || "Ação da partida") });
      if (state.aquiferHistory.length > 40) state.aquiferHistory.shift();
    }
    return next - previous;
  }

  function changeAquiferState(state, delta, reason) {
    const next = cloneState(state);
    return { state: next, delta: changeAquifer(next, delta, reason) };
  }

  function recordFootprint(player, impact) {
    if (!player) return;
    player.footprint = player.footprint || { water: 0, energy: 0 };
    player.footprint.water = Math.max(0, player.footprint.water + (Number(impact && impact.water) || 0));
    player.footprint.energy = Math.max(0, player.footprint.energy + (Number(impact && impact.energy) || 0));
  }

  function footprintBand(player) {
    const footprint = player && player.footprint || { water: 0, energy: 0 };
    const total = (Number(footprint.water) || 0) + (Number(footprint.energy) || 0);
    if (total <= 3) return { label: "Sustentável", className: "low", score: total };
    if (total <= 8) return { label: "Moderado", className: "medium", score: total };
    return { label: "Predador", className: "high", score: total };
  }

  function recordLastMove(state, player, text) {
    if (!state) return;
    state.lastMove = {
      round: state.round || 1,
      playerId: player && player.id || null,
      playerName: player && player.name || "Mesa",
      text: String(text || "A partida foi atualizada.")
    };
  }

  function visitHouse(state, player, house) {
    if (!state || !player) return "";
    if (house === 24 && !player.windCredit) {
      player.windCredit = true;
      return "Sinergia: o Parque Eólico concedeu 1 crédito de energia para uma entrega expressa.";
    }
    if (house === 8 && player.cargo && !player.cargo.maquiada && !player.anaceConsulted) {
      player.anaceConsulted = true;
      return "Aldeia Anacé: consulta registrada; a próxima entrega transparente vale +1 ponto.";
    }
    if (house === 4 && player.interventionTokens < 2) {
      player.interventionTokens++;
      return "Tribunal: ganhou 1 ficha de intervenção para auditoria ou acordo de poupança.";
    }
    return "";
  }

  function visitHouseState(state, playerId, house) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    return { state: next, message: visitHouse(next, player, house) };
  }

  function visitContractSite(state, player, siteId) {
    const contract = state && state.contract;
    if (!contract || contract.complete || contract.failed || !contract.sites.includes(siteId)) return null;
    const joined = !contract.participants.includes(player.id);
    if (joined) contract.participants.push(player.id);
    let added = false;
    if (!contract.visitedSites.includes(siteId)) {
      contract.visitedSites.push(siteId);
      added = true;
    }
    const sitesComplete = contract.sites.every(function (site) { return contract.visitedSites.includes(site); });
    if (sitesComplete && contract.participants.length >= 2) {
      contract.complete = true;
      (state.players || []).forEach(function (participant) {
        if (contract.participants.includes(participant.id)) participant.score += 2;
      });
      const water = changeAquifer(state, 2, "Contrato regional concluído");
      return { completed: true, added: added, message: "Contrato concluído: Porto, Parque Eólico e Data Center conectados. Participantes recebem +2 pontos e o aquífero recupera " + water + "." };
    }
    if (sitesComplete && joined) return { completed: false, added: false, message: "Os três locais estão conectados. Falta uma segunda pessoa participar para fechar o contrato." };
    return added ? { completed: false, added: true, message: player.name + " avançou o contrato regional: " + contract.visitedSites.length + "/" + contract.sites.length + " locais visitados." } : null;
  }

  function visitContractSiteState(state, playerId, siteId) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    return { state: next, result: visitContractSite(next, player, siteId) };
  }

  function failContract(state) {
    const contract = state && state.contract;
    if (!contract || contract.complete || contract.failed || state.round <= contract.deadlineRound) return null;
    contract.failed = true;
    const water = changeAquifer(state, -1, "Contrato regional não concluído");
    contract.participants.forEach(function (id) {
      const player = (state.players || []).find(function (item) { return item.id === id; });
      if (player) player.score -= 1;
    });
    return { message: "O contrato regional falhou no prazo: aquífero " + water + "; cada participante perde 1 ponto." };
  }

  function failContractState(state) {
    const next = cloneState(state);
    return { state: next, result: failContract(next) };
  }

  function movePlayer(state, playerId, steps) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    const amount = Number(steps);
    if (!player || !Number.isInteger(amount)) return { state: next, valid: false };
    player.pos = (player.pos + amount % 32 + 32) % 32;
    return { state: next, valid: true, position: player.pos };
  }

  function collectCargo(state, playerId) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    if (!player || !player.cargo || player.cargo.pickedUp) return { state: next, valid: false };
    player.cargo.pickedUp = true;
    return { state: next, valid: true, cargo: player.cargo };
  }

  function recycleDeck(state, deckName, shuffledCards) {
    const keys = { delivery: ["deliveryDeck", "deliveryDiscard"], dilemma: ["dilemmaDeck", "dilemmaDiscard"], power: ["powerDeck", "powerDiscard"] }[deckName];
    const next = cloneState(state);
    if (!keys || !Array.isArray(shuffledCards)) return { state: next, valid: false };
    next[keys[0]] = shuffledCards.slice();
    next[keys[1]] = [];
    return { state: next, valid: true };
  }

  function drawDeliveryCard(state, playerId) {
    const next = cloneState(state), player = (next.players || []).find(function (item) { return item.id === playerId; });
    if (!player || !Array.isArray(next.deliveryDeck) || !next.deliveryDeck.length) return { state: next, card: null };
    const card = next.deliveryDeck.pop();
    player.cargo = Object.assign({}, card, { pickedUp: false, maquiada: false, serviceLevel: null, expiresRound: Number(next.round || 1) + 3 });
    next.pendingChoice = { type: "delivery", playerId: player.id, card: player.cargo };
    return { state: next, card: player.cargo };
  }

  function drawChoiceCard(state, type, reason) {
    const next = cloneState(state), keys = type === "dilemma" ? ["dilemmaDeck", "dilemmaDiscard"] : type === "power" ? ["powerDeck", "powerDiscard"] : null;
    if (!keys || !Array.isArray(next[keys[0]]) || !next[keys[0]].length) return { state: next, card: null };
    const card = next[keys[0]].pop();
    if (type === "dilemma") next[keys[1]].push(card);
    next.pendingChoice = type === "dilemma" ? { type: type, card: card } : { type: type, card: card, reason: String(reason || "ação da partida") };
    return { state: next, card: card };
  }

  function discardPowerCard(state, card) {
    const next = cloneState(state);
    if (!card || !isRecord(card)) return { state: next, valid: false };
    next.powerDiscard = Array.isArray(next.powerDiscard) ? next.powerDiscard : [];
    next.powerDiscard.push(card);
    return { state: next, valid: true };
  }

  function advanceRoundState(state) {
    const next = cloneState(state);
    next.round = Number(next.round || 1) + 1;
    next.deliveriesThisRound = 0;
    const contract = failContract(next);
    return { state: next, contract: contract };
  }

  function advanceTurnState(state, actorId, roundLimit, automatic) {
    const next = cloneState(state);
    const actor = currentPlayer(state);
    const pending = state && (state.pendingLanding != null || !!state.pendingChoice || !!state.combat);
    const canSkip = !!(automatic && state && state.game && !validate(state).length && actor && actor.id === actorId && actor.skipNext && !state.moving && !state.rolling && !pending && Number(state.moveRemaining) === 0);
    if (!canSkip && !canPerform(state, "finish", actorId)) return { state: next, valid: false, roundClosed: false, roundAdvanced: false, rebound: false, contract: null };
    if (automatic) next.players[next.pi].skipNext = false;
    next.pendingLanding = null;
    next.pendingChoice = null;
    next.previewTarget = null;
    next.moveRemaining = 0;
    next.rolled = false;
    next.lastRoll = 0;
    next.moving = false;
    next.rolling = false;
    next.turnSerial = (Number(next.turnSerial) || 0) + 1;
    if (state.pi !== state.players.length - 1) {
      next.pi = state.pi + 1;
      return { state: next, valid: true, roundClosed: false, roundAdvanced: false, rebound: false, contract: null };
    }
    const reboundTransition = applyRebound(next);
    let result = reboundTransition.state;
    let contract = null;
    let roundAdvanced = false;
    const limit = Number(roundLimit) || 10;
    if (result.aquifer > 0 && Number(result.round) < limit) {
      const advance = advanceRoundState(result);
      result = advance.state;
      contract = advance.contract;
      result.pi = 0;
      roundAdvanced = true;
    }
    return { state: result, valid: true, roundClosed: true, roundAdvanced: roundAdvanced, rebound: reboundTransition.applied, contract: contract };
  }

  function deliveryPreview(state, player, level) {
    const express = level === "express";
    const wind = express && player && player.windCredit;
    return {
      level: express ? "Entrega Expressa de Alta Demanda" : "Entrega Padrão",
      deadline: express ? 2 : 3,
      honestPoints: express ? 5 : 3,
      disguisedPoints: express ? 6 : 4,
      aquiferDelta: express ? -1 : 0,
      waterFootprint: express ? 2 : 1,
      energyFootprint: express ? (wind ? 2 : 3) : 1,
      windCredit: !!wind,
      summary: express
        ? "+2 pontos potenciais, prazo de 2 rodadas e aquífero −1. " + (wind ? "O crédito eólico reduz 1 ponto da pegada energética." : "Pegada energética maior.")
        : "Prazo de 3 rodadas, sem custo extra no aquífero."
    };
  }

  function territoryDistribution(playerCount) {
    const count = Number(playerCount);
    if (!Number.isInteger(count) || count < 2 || count > 4) throw new RangeError("A partida precisa ter de 2 a 4 jogadores.");
    const perPlayer = count === 2 ? 3 : 2;
    return { perPlayer: perPlayer, neutral: 8 - count * perPlayer };
  }

  function dealTerritories(seeds, playerIds, dealtIds) {
    const rule = territoryDistribution((playerIds || []).length);
    const ids = (seeds || []).map(function (seed) { return seed.id; });
    const requested = Array.isArray(dealtIds) ? dealtIds : ids;
    const order = requested.filter(function (id, index) { return ids.includes(id) && requested.indexOf(id) === index; });
    ids.forEach(function (id) { if (!order.includes(id)) order.push(id); });
    const owners = new Map();
    const assignments = (playerIds || []).map(function (id, seat) {
      const territoryIds = order.slice(seat * rule.perPlayer, (seat + 1) * rule.perPlayer);
      territoryIds.forEach(function (territoryId) { owners.set(territoryId, seat); });
      return { playerId: id, territoryIds: territoryIds };
    });
    return {
      assignments: assignments,
      territories: (seeds || []).map(function (seed) {
        return Object.assign({}, seed, { owner: owners.has(seed.id) ? owners.get(seed.id) : null });
      }),
      neutral: rule.neutral
    };
  }

  function disputeOutcome(attackerRoll, defenderRoll) {
    const attack = Number(attackerRoll), defense = Number(defenderRoll);
    if (!Number.isInteger(attack) || !Number.isInteger(defense) || attack < 1 || attack > 6 || defense < 1 || defense > 6) {
      return { valid: false, winner: null, retreat: 0, returnCargo: false };
    }
    if (attack > defense) return { valid: true, winner: "attacker", retreat: 0, returnCargo: false };
    if (defense > attack) return { valid: true, winner: "defender", retreat: 2, returnCargo: true };
    return { valid: true, winner: "defender", retreat: 1, returnCargo: false };
  }

  function resolveDispute(state, attackerId, territoryId, attackerRoll, defenderRoll) {
    const next = cloneState(state);
    next.deliveryDiscard = Array.isArray(next.deliveryDiscard) ? next.deliveryDiscard : [];
    const attacker = (next.players || []).find(function (player) { return player.id === attackerId; });
    const territory = (next.territories || []).find(function (item) { return item.id === territoryId; });
    const outcome = disputeOutcome(attackerRoll, defenderRoll);
    if (!attacker || !territory || territory.owner == null || !outcome.valid || territory.owner === next.players.indexOf(attacker)) {
      return { state: next, valid: false, outcome: outcome, message: "Disputa inválida." };
    }
    if (outcome.winner === "attacker") territory.owner = next.players.indexOf(attacker);
    if (outcome.retreat) attacker.pos = (attacker.pos + 32 - outcome.retreat) % 32;
    if (outcome.returnCargo && attacker.cargo) {
      next.deliveryDiscard.push(attacker.cargo);
      attacker.cargo = null;
    }
    return { state: next, valid: true, outcome: outcome, message: outcome.winner === "attacker"
      ? "Ataque venceu. O atacante assume o território."
      : outcome.returnCargo ? "Defesa venceu. O atacante recua 2 casas e devolve a carga."
      : "Empate. O defensor mantém o território; o atacante recua 1 casa e conserva a carga." };
  }

  function scoreDelivery(player, cargo) {
    if (!player || !cargo) return { valid: false, points: 0, honest: false, consultationBonus: 0 };
    const honest = !cargo.maquiada;
    const express = cargo.serviceLevel === "express";
    const consultationBonus = honest && player.anaceConsulted ? 1 : 0;
    return {
      valid: true,
      points: (honest ? 3 : 4) + (express ? 2 : 0) + consultationBonus,
      honest: honest,
      express: express,
      consultationBonus: consultationBonus,
      aquiferDelta: 0
    };
  }

  function deliveryChoice(state, player, level) {
    const preview = deliveryPreview(state, player, level);
    return {
      level: level === "express" ? "express" : "standard",
      deadline: preview.deadline,
      aquiferDelta: preview.aquiferDelta,
      waterFootprint: preview.waterFootprint - (level === "express" ? 1 : 0),
      energyFootprint: preview.energyFootprint - (level === "express" ? 1 : 0),
      windCredit: preview.windCredit,
      honestPoints: preview.honestPoints,
      disguisedPoints: preview.disguisedPoints
    };
  }

  function dilemmaOutcome(honest) {
    return honest
      ? { aquiferDelta: 0, movement: 0, scoreDelta: 0, waterFootprint: 0, energyFootprint: 0, disguisesCargo: false, grantsPowerUp: true }
      : { aquiferDelta: -1, movement: 3, scoreDelta: 0, waterFootprint: 2, energyFootprint: 1, disguisesCargo: true, grantsPowerUp: false };
  }

  function applyDilemma(state, playerId, honest) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    const outcome = dilemmaOutcome(honest);
    if (!player) return { state: next, valid: false, outcome: outcome };
    if (outcome.disguisesCargo && player.cargo) player.cargo.maquiada = true;
    if (outcome.aquiferDelta) changeAquifer(next, outcome.aquiferDelta, "Atalho maquiado");
    recordFootprint(player, { water: outcome.waterFootprint, energy: outcome.energyFootprint });
    return { state: next, valid: true, outcome: outcome };
  }

  function applyDeliverySelection(state, playerId, level) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    if (!player || !player.cargo) return { state: next, valid: false, preview: null };
    const selected = level === "express" ? "express" : "standard";
    const preview = deliveryPreview(next, player, selected);
    player.cargo.serviceLevel = selected;
    player.cargo.expiresRound = Number(next.round || 1) + preview.deadline;
    if (selected === "express") {
      changeAquifer(next, preview.aquiferDelta, "Entrega expressa de alta demanda");
      recordFootprint(player, { water: preview.waterFootprint - 1, energy: preview.energyFootprint - 1 });
      if (preview.windCredit) player.windCredit = false;
    }
    next.pendingChoice = null;
    return { state: next, valid: true, preview: preview };
  }

  function auditOutcome(cargo) {
    if (!cargo) return { found: false, revealed: false, scoreDelta: 0, returnCargo: false };
    if (!cargo.maquiada) return { found: true, revealed: false, scoreDelta: 0, returnCargo: false };
    return { found: true, revealed: true, scoreDelta: -2, returnCargo: true };
  }

  function councilOutcome(choice, interventionTokens) {
    if (choice === "veto") {
      const canVeto = Number(interventionTokens) > 0;
      return { valid: canVeto, tokenDelta: canVeto ? -1 : 0, actorScoreDelta: canVeto ? -1 : 0, aquiferDelta: 0, choice: "veto" };
    }
    if (choice === "agreement") return { valid: true, tokenDelta: 0, actorScoreDelta: 0, aquiferDelta: 0, choice: "agreement" };
    return { valid: choice === "pass", tokenDelta: 0, actorScoreDelta: 0, aquiferDelta: 0, choice: "pass" };
  }

  function applyCouncil(state, voterId, actorId, choice) {
    const next = cloneState(state);
    const voter = (next.players || []).find(function (player) { return player.id === voterId; });
    const actor = (next.players || []).find(function (player) { return player.id === actorId; });
    if (!voter || !actor || voterId === actorId) return { state: next, valid: false, outcome: councilOutcome(choice, 0) };
    const outcome = councilOutcome(choice, voter.interventionTokens);
    if (!outcome.valid) return { state: next, valid: false, outcome: outcome };
    voter.interventionTokens = (Number(voter.interventionTokens) || 0) + outcome.tokenDelta;
    actor.score = (Number(actor.score) || 0) + outcome.actorScoreDelta;
    return { state: next, valid: true, outcome: outcome };
  }

  function shouldApplyRebound(state) {
    return !!state && Number(state.deliveriesThisRound) >= 2 && Number(state.rebateBlockedRound) !== Number(state.round);
  }

  function applyRebound(state) {
    if (!state) return { state: state, applied: false, delta: 0 };
    const next = cloneState(state);
    if (!shouldApplyRebound(next)) return { state: next, applied: false, delta: 0 };
    const delta = changeAquifer(next, -1, "Efeito rebote");
    next.reboundCount = (Number(next.reboundCount) || 0) + 1;
    return { state: next, applied: true, delta: delta };
  }

  function rankPlayers(state) {
    const players = state && state.players || [];
    return players.map(function (player, index) {
      const land = (state.territories || []).filter(function (territory) { return territory.owner === index; }).length;
      return { player: player, index: index, score: Number(player.score) || 0, land: land, total: (Number(player.score) || 0) + land };
    }).sort(function (a, b) { return b.total - a.total || a.index - b.index; });
  }

  function gameOutcome(state, roundLimit, roundClosed) {
    const limit = Number(roundLimit) || 10;
    const ranking = rankPlayers(state || {});
    if (!state || Number(state.aquifer) <= 0) return { ended: true, won: false, reason: "aquifer", ranking: ranking, winners: [] };
    if ((state.players || []).some(function (player) { return Number(player.deliveries) >= 3; })) {
      const top = ranking.length ? ranking[0].total : 0;
      return { ended: true, won: true, reason: "deliveries", ranking: ranking, winners: ranking.filter(function (row) { return row.total === top; }) };
    }
    if (roundClosed && Number(state.round) >= limit) {
      const top = ranking.length ? ranking[0].total : 0;
      return { ended: true, won: true, reason: "round-limit", ranking: ranking, winners: ranking.filter(function (row) { return row.total === top; }) };
    }
    return { ended: false, won: false, reason: null, ranking: ranking, winners: [] };
  }

  function expireDelivery(player) {
    return { returned: !!(player && player.cargo), scoreDelta: 0, message: "A carga atrasada volta ao baralho sem penalidade de pontos." };
  }

  function completeDelivery(state, playerId, territoryHouse) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    const cargo = player && player.cargo;
    if (!player || !cargo || !cargo.pickedUp || Number(cargo.to) !== Number(territoryHouse)) {
      return { state: next, completed: false, result: null };
    }
    const result = scoreDelivery(player, cargo);
    player.score += result.points;
    player.deliveries = (Number(player.deliveries) || 0) + 1;
    player.footprint = player.footprint || { water: 0, energy: 0 };
    recordFootprint(player, { water: 1, energy: 1 });
    if (result.consultationBonus) player.anaceConsulted = false;
    next.deliveriesThisRound = (Number(next.deliveriesThisRound) || 0) + 1;
    next.usedDeliveries = Array.isArray(next.usedDeliveries) ? next.usedDeliveries : [];
    next.usedDeliveries.push(cargo.id);
    next.deliveryDiscard = Array.isArray(next.deliveryDiscard) ? next.deliveryDiscard : [];
    next.deliveryDiscard.push(cargo);
    const territory = (next.territories || []).find(function (item) { return Number(item.house) === Number(territoryHouse); });
    if (territory && territory.owner == null) territory.owner = next.players.indexOf(player);
    player.cargo = null;
    return { state: next, completed: true, result: result };
  }

  function expireCargo(state, playerId) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    const outcome = expireDelivery(player);
    if (player && outcome.returned) {
      next.deliveryDeck = Array.isArray(next.deliveryDeck) ? next.deliveryDeck : [];
      next.deliveryDeck.push(player.cargo);
      player.cargo = null;
    }
    return { state: next, outcome: outcome };
  }

  function applyAudit(state, targetId) {
    if (!state) return { state: state, outcome: auditOutcome(null), targetId: targetId };
    const next = cloneState(state);
    const target = (next.players || []).find(function (player) { return player.id === targetId; });
    const outcome = auditOutcome(target && target.cargo);
    if (!target) return { state: next, outcome: { found: false, revealed: false, scoreDelta: 0, returnCargo: false }, targetId: targetId };
    next.auditCount = (Number(next.auditCount) || 0) + 1;
    if (outcome.revealed) {
      target.score += outcome.scoreDelta;
      next.auditFinds = (Number(next.auditFinds) || 0) + 1;
      next.deliveryDiscard = next.deliveryDiscard || [];
      next.deliveryDiscard.push(target.cargo);
      target.cargo = null;
    }
    return { state: next, outcome: outcome, targetId: targetId };
  }

  function applyPowerEffect(state, playerId, powerId, targetId) {
    const next = cloneState(state);
    const player = (next.players || []).find(function (item) { return item.id === playerId; });
    const target = (next.players || []).find(function (item) { return item.id === targetId; });
    if (!player || targetId != null && !target) return { state: next, valid: false, outcome: null };
    const outcome = { movement: 0, aquiferDelta: 0, audit: null };
    if (powerId === "atalho") outcome.movement = 2;
    else if (powerId === "circuito") outcome.aquiferDelta = changeAquifer(next, 1, "Circuito fechado");
    else if (powerId === "slm") next.rebateBlockedRound = next.round;
    else if (powerId === "liminar") {
      if (!target || target.id === player.id) return { state: next, valid: false, outcome: outcome };
      target.skipNext = true;
    }
    else if (powerId === "consulta") {
      const territory = (next.territories || []).find(function (item) { return item.house - 1 === player.pos; });
      if (!territory) return { state: next, valid: true, outcome: Object.assign(outcome, { territoryCaptured: false }) };
      territory.owner = next.players.indexOf(player);
      outcome.territoryCaptured = true;
    } else if (powerId === "auditoria") {
      if (!target || target.id === player.id) return { state: next, valid: false, outcome: outcome };
      const result = applyAudit(next, target.id);
      return { state: result.state, valid: true, outcome: Object.assign(outcome, { audit: result.outcome }) };
    } else return { state: next, valid: false, outcome: outcome };
    return { state: next, valid: true, outcome: outcome };
  }

  function applyGlobalEvent(state, eventId) {
    if (!state) return { state: state, messages: [], aquiferDelta: 0 };
    const next = cloneState(state);
    const messages = [];
    let aquiferDelta = 0;
    if (eventId === "estiagem") aquiferDelta = changeAquifer(next, -1, "Estiagem prolongada");
    else if (eventId === "pico-ia") aquiferDelta = changeAquifer(next, -1, "Pico de processamento de IA");
    else if (eventId === "reuso") aquiferDelta = changeAquifer(next, 1, "Mutirão de reuso");
    else if (eventId === "acordo") aquiferDelta = changeAquifer(next, 1, "Acordo regional de poupança");
    else if (eventId === "fiscalizacao") {
      (next.players || []).forEach(function (player) {
        const outcome = auditOutcome(player.cargo);
        if (!outcome.revealed) return;
        player.score += outcome.scoreDelta;
        next.auditFinds = (Number(next.auditFinds) || 0) + 1;
        next.deliveryDiscard = next.deliveryDiscard || [];
        next.deliveryDiscard.push(player.cargo);
        player.cargo = null;
        next.auditCount = (Number(next.auditCount) || 0) + 1;
        messages.push(player.name + " teve carga maquiada auditada e perdeu 2 pontos.");
      });
      if (!messages.length) messages.push("Fiscalização ambiental: nenhuma carga maquiada ativa foi encontrada.");
    } else return { state: next, messages: [], aquiferDelta: 0 };
    return { state: next, messages: messages, aquiferDelta: aquiferDelta };
  }

  function landingPreview(index, player) {
    const house = index + 1;
    const messages = {
      4: "Tribunal: pode recuperar 1 ficha de intervenção (limite 2).",
      8: "Aldeia Anacé: consulta transparente prepara +1 ponto numa entrega honesta.",
      20: "Data Center: local de contrato regional; entregas expressas têm maior pegada.",
      24: "Parque Eólico: recebe crédito que reduz a pegada energética da próxima entrega expressa.",
      28: "Porto: completa o corredor regional e habilita a recompensa coletiva."
    };
    const base = messages[house] || "";
    const cargo = player && player.cargo;
    if (cargo && cargo.to === house && cargo.pickedUp) return base + (base ? " " : "") + "Destino da carga: entrega " + (cargo.serviceLevel === "express" ? "expressa" : "padrão") + " pode ser concluída aqui.";
    return base;
  }

  const api = {
    createContract: createContract,
    normalize: normalize,
    validate: validate,
    validateOnlineState: validateOnlineState,
    canPerform: canPerform,
    changeAquifer: changeAquifer,
    changeAquiferState: changeAquiferState,
    recordFootprint: recordFootprint,
    footprintBand: footprintBand,
    recordLastMove: recordLastMove,
    visitHouse: visitHouse,
    visitHouseState: visitHouseState,
    visitContractSite: visitContractSite,
    visitContractSiteState: visitContractSiteState,
    failContract: failContract,
    failContractState: failContractState,
    movePlayer: movePlayer,
    collectCargo: collectCargo,
    recycleDeck: recycleDeck,
    drawDeliveryCard: drawDeliveryCard,
    drawChoiceCard: drawChoiceCard,
    discardPowerCard: discardPowerCard,
    advanceRoundState: advanceRoundState,
    advanceTurnState: advanceTurnState,
    deliveryPreview: deliveryPreview,
    territoryDistribution: territoryDistribution,
    dealTerritories: dealTerritories,
    disputeOutcome: disputeOutcome,
    resolveDispute: resolveDispute,
    scoreDelivery: scoreDelivery,
    completeDelivery: completeDelivery,
    deliveryChoice: deliveryChoice,
    dilemmaOutcome: dilemmaOutcome,
    applyDilemma: applyDilemma,
    applyDeliverySelection: applyDeliverySelection,
    auditOutcome: auditOutcome,
    applyAudit: applyAudit,
    councilOutcome: councilOutcome,
    applyCouncil: applyCouncil,
    applyPowerEffect: applyPowerEffect,
    shouldApplyRebound: shouldApplyRebound,
    applyRebound: applyRebound,
    rankPlayers: rankPlayers,
    gameOutcome: gameOutcome,
    expireDelivery: expireDelivery,
    expireCargo: expireCargo,
    applyGlobalEvent: applyGlobalEvent,
    landingPreview: landingPreview
  };

  root.SedeRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
