const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Rules = require("../game-rules.js");

function makeState(overrides) {
  return Rules.normalize(Object.assign({
    pi: 0,
    round: 1,
    aquifer: 10,
    game: true,
    rolled: false,
    moving: false,
    rolling: false,
    moveRemaining: 0,
    pendingLanding: null,
    pendingChoice: null,
    combat: null,
    territories: [],
    players: [
      { id: "P1", uid: "u1", name: "Rota A", pos: 0, score: 0 },
      { id: "P2", uid: "u2", name: "Rota B", pos: 0, score: 0 }
    ]
  }, overrides || {}));
}

test("normaliza partidas antigas sem perder jogadores e cria estado cooperativo", () => {
  const state = makeState({ aquifer: 8 });
  assert.equal(state.version, 2);
  assert.equal(state.contract.id, "corredor-regional");
  assert.deepEqual(state.contract.visitedSites, []);
  assert.equal(state.aquiferHistory[0].value, 8);
  assert.equal(state.players[0].interventionTokens, 1);
  assert.deepEqual(state.players[0].footprint, { water: 0, energy: 0 });
  assert.deepEqual(Rules.validate(state), []);
});

test("valida a fase do turno antes de permitir rolar, responder ou encerrar", () => {
  const state = makeState();
  assert.equal(Rules.canPerform(state, "roll", "P1"), true);
  assert.equal(Rules.canPerform(state, "roll", "P2"), false);
  assert.equal(Rules.canPerform(state, "roll", "P1", "u2"), false);
  state.rolled = true;
  assert.equal(Rules.canPerform(state, "finish", "P1"), true);
  state.moveRemaining = 2;
  assert.equal(Rules.canPerform(state, "finish", "P1"), false);
  state.moveRemaining = 0;
  state.pendingChoice = { type: "dilemma" };
  assert.equal(Rules.canPerform(state, "finish", "P1"), false);
  assert.equal(Rules.canPerform(state, "resolve", "P1"), true);
});

test("registra mudanças do aquífero dentro da escala de 0 a 10", () => {
  const state = makeState({ aquifer: 1 });
  assert.equal(Rules.changeAquifer(state, -4, "seca"), -1);
  assert.equal(state.aquifer, 0);
  assert.equal(Rules.changeAquifer(state, 30, "reuso"), 10);
  assert.deepEqual(state.aquiferHistory.map(row => row.value), [1, 0, 10]);
  assert.deepEqual(state.aquiferHistory.map(row => row.delta), [0, -1, 10]);
});

test("classifica pegadas individuais e aplica as sinergias dos territórios", () => {
  const state = makeState(), player = state.players[0];
  assert.equal(Rules.footprintBand(player).label, "Sustentável");
  Rules.recordFootprint(player, { water: 3, energy: 2 });
  assert.equal(Rules.footprintBand(player).label, "Moderado");
  Rules.recordFootprint(player, { water: 4, energy: 1 });
  assert.equal(Rules.footprintBand(player).label, "Predador");
  assert.match(Rules.visitHouse(state, player, 24), /crédito de energia/);
  assert.equal(player.windCredit, true);
  player.cargo = { maquiada: false };
  assert.match(Rules.visitHouse(state, player, 8), /consulta registrada/);
  assert.equal(player.anaceConsulted, true);
  assert.match(Rules.visitHouse(state, player, 4), /ficha de intervenção/);
  assert.equal(player.interventionTokens, 2);
});

test("contrato exige os três locais e duas pessoas antes de premiar a equipe", () => {
  const state = makeState({ aquifer: 7 });
  const a = state.players[0], b = state.players[1];
  assert.equal(Rules.visitContractSite(state, a, "porto").added, true);
  Rules.visitContractSite(state, a, "eolica");
  const third = Rules.visitContractSite(state, a, "datacenter");
  assert.equal(third.completed, false);
  assert.equal(state.contract.visitedSites.length, 3);
  const completed = Rules.visitContractSite(state, b, "porto");
  assert.equal(completed.completed, true);
  assert.equal(state.contract.complete, true);
  assert.equal(state.aquifer, 9);
  assert.equal(a.score, 2);
  assert.equal(b.score, 2);
});

test("prazo perdido cobra o aquífero e os pontos dos participantes uma única vez", () => {
  const state = makeState({ round: 7, aquifer: 5 });
  state.contract.deadlineRound = 6;
  state.contract.participants = ["P1"];
  state.players[0].score = 3;
  const first = Rules.failContract(state);
  assert.match(first.message, /falhou no prazo/);
  assert.equal(state.aquifer, 4);
  assert.equal(state.players[0].score, 2);
  assert.equal(Rules.failContract(state), null);
});

test("prévia de entrega mostra prazo, recompensa, aquífero e crédito eólico", () => {
  const state = makeState(), player = state.players[0];
  const standard = Rules.deliveryPreview(state, player, "standard");
  assert.equal(standard.deadline, 3);
  assert.equal(standard.aquiferDelta, 0);
  assert.equal(standard.honestPoints, 3);
  const express = Rules.deliveryPreview(state, player, "express");
  assert.equal(express.deadline, 2);
  assert.equal(express.aquiferDelta, -1);
  assert.equal(express.honestPoints, 5);
  player.windCredit = true;
  assert.equal(Rules.deliveryPreview(state, player, "express").energyFootprint, 2);
});

test("distribui os oito territórios conforme o número de marcadores", () => {
  const seeds = Array.from({ length: 8 }, (_, index) => ({ id: "T" + index, house: (index + 1) * 4, owner: null }));
  for (const [count, expectedPerPlayer, expectedNeutral] of [[2, 3, 2], [3, 2, 2], [4, 2, 0]]) {
    const ids = Array.from({ length: count }, (_, index) => "P" + (index + 1));
    const deal = Rules.dealTerritories(seeds, ids, seeds.map(seed => seed.id));
    assert.equal(deal.assignments.length, count);
    assert.ok(deal.assignments.every(row => row.territoryIds.length === expectedPerPlayer));
    assert.equal(deal.neutral, expectedNeutral);
    assert.equal(deal.territories.filter(row => row.owner == null).length, expectedNeutral);
  }
});

test("aplica vitória, derrota e empate em Disputa com recuo e carga corretos", () => {
  const seed = makeState({
    territories: [{ id: "T1", house: 4, owner: 1 }],
    players: [
      { id: "P1", uid: "u1", name: "Ataque", pos: 10, score: 0, cargo: { id: "C1", pickedUp: true } },
      { id: "P2", uid: "u2", name: "Defesa", pos: 3, score: 0 }
    ]
  });
  const attack = Rules.resolveDispute(seed, "P1", "T1", 6, 2);
  assert.equal(attack.valid, true);
  assert.equal(attack.state.territories[0].owner, 0);
  assert.equal(attack.state.players[0].pos, 10);
  assert.ok(attack.state.players[0].cargo);

  const defense = Rules.resolveDispute(seed, "P1", "T1", 2, 5);
  assert.equal(defense.state.territories[0].owner, 1);
  assert.equal(defense.state.players[0].pos, 8);
  assert.equal(defense.state.players[0].cargo, null);
  assert.equal(defense.state.deliveryDiscard[0].id, "C1");

  const tie = Rules.resolveDispute(seed, "P1", "T1", 4, 4);
  assert.equal(tie.state.territories[0].owner, 1);
  assert.equal(tie.state.players[0].pos, 9);
  assert.equal(tie.state.players[0].cargo.id, "C1");
  assert.equal(tie.state.deliveryDiscard.length, 0);
});

test("entrega vencida devolve a carga sem penalidade de pontos", () => {
  const state = makeState();
  state.players[0].score = 4;
  state.players[0].cargo = { id: "C2", pickedUp: true, expiresRound: 2 };
  const expired = Rules.expireCargo(state, "P1");
  assert.equal(expired.outcome.scoreDelta, 0);
  assert.equal(expired.state.players[0].score, 4);
  assert.equal(expired.state.players[0].cargo, null);
  assert.equal(expired.state.deliveryDeck[0].id, "C2");
});

test("rebote só ocorre após duas entregas e o SLM bloqueia a rodada", () => {
  const state = makeState({ deliveriesThisRound: 1 });
  assert.equal(Rules.shouldApplyRebound(state), false);
  state.deliveriesThisRound = 2;
  const rebound = Rules.applyRebound(state);
  assert.equal(rebound.applied, true);
  assert.equal(rebound.state.aquifer, 9);
  assert.equal(rebound.state.reboundCount, 1);
  state.rebateBlockedRound = state.round;
  const blocked = Rules.applyRebound(state);
  assert.equal(blocked.applied, false);
  assert.equal(blocked.state.aquifer, 10);
});

test("a derrota coletiva prevalece quando o aquífero chega a zero", () => {
  const outcome = Rules.gameOutcome(makeState({ aquifer: 0 }), 10, true);
  assert.equal(outcome.ended, true);
  assert.equal(outcome.won, false);
  assert.equal(outcome.reason, "aquifer");
  assert.deepEqual(outcome.winners, []);
});

test("vitória por três entregas e fim da rodada 10 usa território e preserva empates", () => {
  const byDeliveries = makeState();
  byDeliveries.players[1].deliveries = 3;
  byDeliveries.players[0].score = 5;
  byDeliveries.players[1].score = 4;
  byDeliveries.territories = [{ id: "T1", house: 4, owner: 1 }, { id: "T2", house: 8, owner: 0 }];
  let outcome = Rules.gameOutcome(byDeliveries, 10, false);
  assert.equal(outcome.reason, "deliveries");
  assert.equal(outcome.ranking[0].total, 6);
  assert.equal(outcome.winners[0].player.id, "P1");

  const atLimit = makeState({ round: 10 });
  atLimit.players[0].score = 4;
  atLimit.players[1].score = 3;
  atLimit.territories = [{ id: "T1", house: 4, owner: 0 }, { id: "T2", house: 8, owner: 1 }];
  outcome = Rules.gameOutcome(atLimit, 10, true);
  assert.equal(outcome.reason, "round-limit");
  assert.equal(outcome.ranking[0].total, 5);
  assert.equal(outcome.ranking[1].total, 4);
  assert.deepEqual(outcome.winners.map(row => row.player.id), ["P1"]);

  atLimit.players[1].score = 4;
  outcome = Rules.gameOutcome(atLimit, 10, true);
  assert.deepEqual(outcome.winners.map(row => row.player.id), ["P1", "P2"]);
});

test("auditoria independente devolve carga maquiada e cobra dois pontos", () => {
  const state = makeState();
  state.players[1].score = 3;
  state.players[1].cargo = { id: "C3", maquiada: true };
  const audited = Rules.applyAudit(state, "P2");
  assert.equal(audited.outcome.revealed, true);
  assert.equal(audited.state.players[1].score, 1);
  assert.equal(audited.state.players[1].cargo, null);
  assert.equal(audited.state.deliveryDiscard[0].id, "C3");
  assert.equal(audited.state.auditCount, 1);
  const clean = Rules.applyAudit(state, "P1");
  assert.equal(clean.outcome.revealed, false);
  assert.equal(clean.state.players[0].score, 0);
});

test("Tribunal aceita intervenção com ficha ou acordo de poupança", () => {
  assert.deepEqual(Rules.councilOutcome("veto", 1), {
    valid: true, tokenDelta: -1, actorScoreDelta: -1, aquiferDelta: 0, choice: "veto"
  });
  assert.equal(Rules.councilOutcome("veto", 0).valid, false);
  assert.equal(Rules.councilOutcome("agreement", 0).valid, true);
});

test("contabiliza entregas honestas e maquiadas para o relatório", () => {
  const state = makeState({ territories: [{ id: "T1", house: 4, owner: null }] });
  state.players[0].cargo = { id: "C4", to: 4, pickedUp: true, maquiada: false, serviceLevel: "standard" };
  const honest = Rules.completeDelivery(state, "P1", 4);
  assert.equal(honest.completed, true);
  assert.equal(honest.result.points, 3);
  assert.equal(honest.state.players[0].deliveries, 1);
  assert.equal(honest.state.deliveriesThisRound, 1);
  assert.equal(honest.state.territories[0].owner, 0);

  honest.state.players[1].cargo = { id: "C5", to: 4, pickedUp: true, maquiada: true, serviceLevel: "standard" };
  const disguised = Rules.completeDelivery(honest.state, "P2", 4);
  assert.equal(disguised.result.honest, false);
  assert.equal(disguised.result.points, 4);
  assert.equal(disguised.state.deliveriesThisRound, 2);
});

test("transições puras aplicam dilema, SLA e sinergias sem alterar o estado de origem", () => {
  const state = makeState();
  state.players[0].cargo = { id: "C6", from: 4, to: 12, pickedUp: false, maquiada: false };
  const dilemma = Rules.applyDilemma(state, "P1", false);
  assert.equal(state.aquifer, 10);
  assert.equal(state.players[0].cargo.maquiada, false);
  assert.equal(dilemma.state.aquifer, 9);
  assert.equal(dilemma.state.players[0].cargo.maquiada, true);
  assert.deepEqual(dilemma.state.players[0].footprint, { water: 2, energy: 1 });

  const standard = Rules.applyDeliverySelection(state, "P1", "standard");
  assert.equal(standard.state.players[0].cargo.serviceLevel, "standard");
  assert.equal(standard.state.players[0].cargo.expiresRound, 4);
  assert.equal(state.players[0].cargo.serviceLevel, undefined);

  state.players[0].windCredit = true;
  const express = Rules.applyDeliverySelection(state, "P1", "express");
  assert.equal(express.state.aquifer, 9);
  assert.equal(express.state.players[0].windCredit, false);
  assert.equal(express.state.players[0].cargo.expiresRound, 3);
  assert.deepEqual(express.state.players[0].footprint, { water: 1, energy: 1 });

  state.players[0].windCredit = false;
  const visited = Rules.visitHouseState(state, "P1", 24);
  assert.equal(state.players[0].windCredit, false);
  assert.equal(visited.state.players[0].windCredit, true);
  assert.match(visited.message, /crédito de energia/);
});

test("Tribunal aplica custo e ficha numa transição sem mutar o estado recebido", () => {
  const state = makeState();
  const veto = Rules.applyCouncil(state, "P2", "P1", "veto");
  assert.equal(veto.valid, true);
  assert.equal(veto.state.players[1].interventionTokens, 0);
  assert.equal(veto.state.players[0].score, -1);
  assert.equal(state.players[1].interventionTokens, 1);
  assert.equal(state.players[0].score, 0);
  const exhausted = Rules.applyCouncil(veto.state, "P2", "P1", "veto");
  assert.equal(exhausted.valid, false);
});

test("Power Ups e movimento usam transições puras", () => {
  const state = makeState({ round: 3, territories: [{ id: "T1", house: 4, owner: 1 }] });
  state.players[0].pos = 3;
  const consultation = Rules.applyPowerEffect(state, "P1", "consulta");
  assert.equal(consultation.valid, true);
  assert.equal(consultation.state.territories[0].owner, 0);
  assert.equal(state.territories[0].owner, 1);
  const slm = Rules.applyPowerEffect(state, "P1", "slm");
  assert.equal(slm.state.rebateBlockedRound, 3);
  assert.equal(state.rebateBlockedRound, 0);
  const move = Rules.movePlayer(state, "P1", -2);
  assert.equal(move.position, 1);
  assert.equal(state.players[0].pos, 3);
});

test("compra e reciclagem de cartas mantêm baralhos dentro do estado puro", () => {
  const state = makeState({
    deliveryDeck: [{ id: "D1", from: 4, to: 8, name: "Poços" }],
    deliveryDiscard: [{ id: "D0" }],
    dilemmaDeck: [], dilemmaDiscard: [{ id: "L1", title: "Dilema" }],
    powerDeck: [{ id: "P1", name: "Circuito" }], powerDiscard: []
  });
  const delivery = Rules.drawDeliveryCard(state, "P1");
  assert.equal(state.players[0].cargo, undefined);
  assert.equal(delivery.state.players[0].cargo.id, "D1");
  assert.equal(delivery.state.pendingChoice.type, "delivery");
  assert.equal(delivery.state.players[0].cargo.expiresRound, 4);

  const recycled = Rules.recycleDeck(state, "dilemma", [{ id: "L2" }]);
  const dilemma = Rules.drawChoiceCard(recycled.state, "dilemma");
  assert.equal(state.dilemmaDeck.length, 0);
  assert.equal(dilemma.card.id, "L2");
  assert.equal(dilemma.state.pendingChoice.card.id, "L2");
  assert.equal(dilemma.state.dilemmaDiscard[0].id, "L2");

  const choice = Rules.drawChoiceCard(state, "power", "teste");
  const discarded = Rules.discardPowerCard(choice.state, choice.card);
  assert.equal(state.powerDeck.length, 1);
  assert.equal(discarded.state.powerDiscard[0].id, "P1");
});

test("avanço de rodada zera entregas e aplica prazo do contrato", () => {
  const state = makeState({ round: 6, deliveriesThisRound: 2, aquifer: 7 });
  state.contract = { complete: false, failed: false, deadlineRound: 6, participants: ["P1", "P2"] };
  const advanced = Rules.advanceRoundState(state);
  assert.equal(state.round, 6);
  assert.equal(state.deliveriesThisRound, 2);
  assert.equal(advanced.state.round, 7);
  assert.equal(advanced.state.deliveriesThisRound, 0);
  assert.equal(advanced.state.contract.failed, true);
  assert.equal(advanced.state.aquifer, 6);
});

test("fecha o turno com validação, rebote e transição para a rodada seguinte", () => {
  const first = makeState({ rolled: true });
  const nextPlayer = Rules.advanceTurnState(first, "P1", 10, false);
  assert.equal(nextPlayer.valid, true);
  assert.equal(nextPlayer.state.pi, 1);
  assert.equal(nextPlayer.state.rolled, false);
  assert.equal(nextPlayer.state.turnSerial, 1);
  assert.equal(first.pi, 0);
  assert.equal(first.rolled, true);

  const unrolled = Rules.advanceTurnState(makeState(), "P1", 10, false);
  assert.equal(unrolled.valid, false);

  const finalPlayer = makeState({ pi: 1, rolled: true, round: 1, deliveriesThisRound: 2 });
  const closedRound = Rules.advanceTurnState(finalPlayer, "P2", 10, false);
  assert.equal(closedRound.roundClosed, true);
  assert.equal(closedRound.roundAdvanced, true);
  assert.equal(closedRound.rebound, true);
  assert.equal(closedRound.state.round, 2);
  assert.equal(closedRound.state.pi, 0);
  assert.equal(closedRound.state.deliveriesThisRound, 0);
  assert.equal(closedRound.state.aquifer, 9);

  const lastRound = makeState({ pi: 1, rolled: true, round: 10 });
  const ended = Rules.advanceTurnState(lastRound, "P2", 10, false);
  assert.equal(ended.roundClosed, true);
  assert.equal(ended.roundAdvanced, false);
  assert.equal(Rules.gameOutcome(ended.state, 10, ended.roundClosed).reason, "round-limit");
});

test("liminar encerra a vez automaticamente sem mutar estado recebido", () => {
  const state = makeState();
  state.players[0].skipNext = true;
  const skipped = Rules.advanceTurnState(state, "P1", 10, true);
  assert.equal(skipped.valid, true);
  assert.equal(skipped.state.pi, 1);
  assert.equal(skipped.state.players[0].skipNext, false);
  assert.equal(state.players[0].skipNext, true);
  assert.equal(state.turnSerial, undefined);
});

test("valida a forma mínima da sala online antes da hidratação", () => {
  const state = makeState({
    revision: 2,
    started: true,
    territories: Array.from({ length: 8 }, (_, index) => ({ id: "T" + index, house: (index + 1) * 4, owner: null }))
  });
  state.players.forEach((player, index) => {
    player.color = index ? "#72aeb8" : "#75a36c";
    player.deliveries = 0;
  });
  assert.deepEqual(Rules.validateOnlineState(state), []);
  const malformed = Object.assign({}, state, { players: [{ id: "P1" }], aquifer: "seco" });
  assert.ok(Rules.validateOnlineState(malformed).length > 0);
});

test("regras do Firebase conferem o ator salvo e a revisão crescente", () => {
  const config = JSON.parse(fs.readFileSync(require.resolve("../database.rules.json"), "utf8"));
  const write = config.rules.rooms.$roomId.state[".write"];
  assert.match(write, /auth\.uid === data\.child\('players'\)\.child\(data\.child\('pi'\)\.val\(\) \+ ''\)\.child\('uid'\)\.val\(\)/);
  assert.match(write, /newData\.child\('revision'\)\.val\(\) === data\.child\('revision'\)\.val\(\) \+ 1/);
});
