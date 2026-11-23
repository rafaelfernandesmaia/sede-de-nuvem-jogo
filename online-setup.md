# Preparar uma partida online

O modo local funciona sem Firebase. Para compartilhar uma sala entre aparelhos:

1. No console do Firebase, habilite o Realtime Database e o provedor de autenticação anônima.
2. Confira se `firebase-config.js` aponta para o projeto e para o endereço do banco corretos. Os identificadores desse arquivo são usados pelo navegador; a proteção das salas fica nas regras do banco.
3. Instale e autentique o Firebase CLI pelo canal oficial, selecione o projeto do jogo e, na raiz do repositório, publique `database.rules.json` com `firebase deploy --only database`.
4. Abra o jogo em dois aparelhos, crie uma sala no primeiro e entre com o código no segundo.

O banco permite entrada em salas com código válido, limita a sala a quatro marcadores e exige uma revisão crescente em cada atualização. A regra da sala confere o marcador da vez e reserva ao anfitrião o início e os fechamentos globais de rodada. O navegador também valida o estado recebido antes de carregá-lo.

Se a conexão cair, o aviso no jogo permite continuar naquele aparelho. A continuação local deixa de sincronizar a sala; os outros participantes continuam vendo o último estado confirmado no banco.
