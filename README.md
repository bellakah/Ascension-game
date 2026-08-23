# Ascension Game

Projeto experimental de RPG 2D para navegador e dispositivos móveis.

O desenvolvimento inicial é feito em TypeScript + PixiJS + Vite.

## Testar localmente no Windows

Depois de baixar/extrair o projeto, você não precisa abrir terminal manualmente.

- `start.bat` — abre um menu para escolher Jogo ou Editor.
- `start-game.bat` — abre diretamente o jogo.
- `start-editor.bat` — abre diretamente o Map Editor.

Na primeira execução o launcher:

1. verifica se existe Node.js 22 ou mais recente;
2. se necessário, tenta instalar Node LTS automaticamente pelo `winget`;
3. executa `npm install` para preparar as dependências;
4. inicia o servidor local em `http://127.0.0.1:5173`;
5. abre o navegador automaticamente.

As próximas execuções reutilizam as dependências já instaladas. Se `package.json` ou `package-lock.json` mudar, o launcher atualiza os pacotes automaticamente.

Para desligar o servidor local, feche a janela chamada **Ascension Local Server**.

### URLs locais

- Jogo: `http://127.0.0.1:5173/Ascension-game/`
- Editor: `http://127.0.0.1:5173/Ascension-game/?editor=map`
