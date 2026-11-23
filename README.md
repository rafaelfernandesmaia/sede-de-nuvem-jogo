# Sede de Nuvem: o Jogo do Pecém

Jogo de tabuleiro digital para discutir sustentabilidade na nuvem e os custos hídricos e energéticos do processamento de inteligência artificial generativa. A versão digital segue as mecânicas do protótipo analógico descritas no roteiro corrigido.

**[Abrir o jogo](https://rafaelfernandesmaia.github.io/sede-de-nuvem-jogo/)**

## Cenário

Em 2030, uma proposta de data center de IA chega ao litoral oeste do Ceará. A seca pressiona os poços do povo Anacé, enquanto governo, empresa, comunidade e Justiça discutem o uso do território e da água. Os jogadores são entregadores anônimos: levam laudos, licenças e projetos pelo mapa e decidem se suas cargas serão transparentes ou maquiadas.

O cenário é uma simulação didática, baseada no tema e na pesquisa bibliográfica do seminário. As cartas apresentam a divergência entre estimativas de consumo como um dilema de transparência: os números dependem de metodologia, modelo e local.

## Componentes e jogadores

- De 2 a 4 jogadores, com peões identificados apenas por cores.
- Tabuleiro em anel com 32 casas.
- 8 territórios nas casas 4, 8, 12, 16, 20, 24, 28 e 32.
- 8 cartas de Entrega, com origem, destino e prazo de 3 rodadas.
- 10 cartas de Dilema.
- 18 cartas de Power Up: 6 tipos, 3 cópias de cada.
- 1 dado de 6 faces.
- Um aquífero compartilhado, que começa em 10 e pode chegar a 0.

A versão física pode usar papelão de caixas, tampinhas, papel e cartolina reaproveitados. Ela deve ter até 32 fichas de controle: 8 por cor.

## Preparação

Embaralhe as 8 cartas de Território e distribua:

- Com 2 jogadores: 3 territórios para cada pessoa e 2 neutros.
- Com 3 jogadores: 2 territórios para cada pessoa e 2 neutros.
- Com 4 jogadores: 2 territórios para cada pessoa e nenhum neutro.

Todos os peões começam na casa 1 do tabuleiro. Todos rolam o dado; o maior resultado começa. Empates são rolados novamente.

## Como jogar

1. **Receba uma Entrega.** No início do turno, se estiver sem carga, compre uma carta com origem, destino e prazo.
2. **Colete a carga.** Passe pelo território de origem. A carga fica com o peão até a entrega, atraso ou perda em Disputa.
3. **Mova-se.** Role o dado e avance no anel. A casa em que terminar determina o efeito.
4. **Resolva a casa.** Dilema: compre uma carta e escolha uma resposta honesta ou maquiada. Power Up: compre e use o efeito imediatamente. Seca: recue 2 casas. Neutra: sem efeito.
5. **Faça a entrega.** Termine o movimento no território de destino dentro de 3 rodadas. Uma entrega honesta vale 3 pontos e um Power Up. Uma entrega maquiada que não for descoberta vale 4 pontos; o aquífero já caiu 1 quando o atalho foi escolhido.
6. **Encerre o turno.** Após todos jogarem, conclua a rodada e aplique o efeito rebote, se houver.

### Dilemas

A resposta honesta apresenta dados, limites e impactos com transparência e concede um Power Up, usado na hora. O atalho maquiado avança 3 casas, reduz o aquífero em 1 e marca a carga como maquiada. Se uma Auditoria independente revelar essa carga, ela é devolvida e o jogador perde 2 pontos.

Os dilemas tratam de pegada hídrica, consulta prévia, justiça socioambiental, greenwashing, efeito rebote, nexo água-energia e responsabilidade por danos futuros. A carta sobre estimativas de água explica que estudos diferentes podem produzir resultados diferentes.

### Disputas por território

Uma Disputa ocorre somente quando o peão termina o movimento em um território controlado por outra pessoa. Passar por ele não inicia combate. Atacante e defensor rolam um dado:

- Se o atacante tirar mais, assume o território.
- Se o defensor tirar mais, mantém o território; o atacante recua 2 casas e devolve sua carga.
- Em caso de empate, o defensor mantém o território; o atacante recua 1 casa e conserva a carga.

Uma entrega concluída em território neutro permite ao entregador assumir o controle. A carta Consulta prévia realizada também pode transferir o controle sem Disputa quando o peão estiver em um território.

### Power Ups

As cartas têm efeito imediato e são descartadas depois do uso:

- Atalho da imprensa: avance 2 casas.
- Circuito fechado: aquífero +1.
- SLM / modelo compacto: bloqueia o efeito rebote da rodada.
- Liminar: um adversário perde a próxima jogada.
- Consulta prévia realizada: assuma o controle do território em que você está, sem Disputa.
- Auditoria independente: revele a carga ativa de um adversário; se estiver maquiada, devolva-a e perca 2 pontos.

## Fim da partida e pontuação

A partida termina ao fim da rodada 10 ou quando alguém conclui 3 entregas. Se o aquífero chegar a 0, todos perdem. Se continuar acima de 0, vence quem tiver mais pontos. Cada território controlado no fim vale 1 ponto.

Quando 2 ou mais entregas são concluídas na mesma rodada, o aquífero cai 1 pelo efeito rebote, a menos que o SLM tenha bloqueado esse efeito naquela rodada. A duração estimada é de 20 a 25 minutos.

## Jogar em dispositivos diferentes

O modo local pode ser jogado em um único dispositivo. Para uma partida online, todos abrem o mesmo endereço; uma pessoa cria a sala e compartilha o código. Os demais entram com esse código. O anfitrião inicia quando houver pelo menos 2 pessoas, e as jogadas e o estado do tabuleiro são sincronizados pelo Firebase Realtime Database.

O modo online requer que **firebase-config.js** esteja preenchido, o login anônimo esteja ativo e as regras do Realtime Database permitam as salas. Mantenha **melhorias.js** e **melhorias-ambiente.css** na raiz, junto de **index.html**, para carregar as interações e o visual atualizados. Se o jogo pedir configuração, consulte o arquivo **online-setup.md** do projeto.

## Recursos do jogo digital

- Mapa estilizado do Complexo do Pecém ligando Porto, Parque Eólico, Data Center, Aldeia Anacé, Poços e Tribunal.
- Cores e alertas reagem ao aquífero compartilhado: 8–10 saudável, 3–7 em atenção e 0–2 em alerta crítico. A escala é didática e não representa litros reais.
- O Jornal do Pecém registra os acontecimentos e apresenta eventos globais a cada duas rodadas.
- Cartas com visual de peças físicas, selos de impacto, animação de revelação, dado e peões animados. O botão de som permite ativar ou silenciar efeitos leves.
- Ao fim da partida, o debriefing resume escolhas transparentes, atalhos e entregas, e ajuda o grupo a conversar sobre o resultado coletivo.

## TAGS do seminário

Pegada hídrica · Semiárido · Justiça socioambiental · Consulta prévia (Anacé) · Transparência / Greenwashing · Efeito rebote (Jevons) · Nexo água-energia · Green AI · Licença social · Princípio da responsabilidade.
