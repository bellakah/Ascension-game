# Collectible Studio

O catálogo de coletáveis é separado do Map Editor e compartilha Item IDs e assets do jogo.

- `?editor=collectibles`: definições de recursos, ferramenta exigida, animação do jogador, estados visuais e drops.
- Map Editor: posiciona uma instância e configura Grupo de Spawn (quantidade, raio, distância mínima, respawn e variação).
- Monster Studio: continua definindo atributos/IA/aparência do monstro; o mesmo Grupo de Spawn do Map Editor controla populações.
- Item Studio: fonte única para ferramentas e drops.

Estados visuais do coletável: `idle`, `harvest`, `break`, `depleted`, `respawn`.

Ações LPC de coleta:
- cortar: `backslash`;
- minerar/cavar: `halfslash`;
- coleta manual: `emote`.

Os recursos legados de ferro, prata, ervas e carvalho são migrados para definições editáveis mantendo compatibilidade com mapas existentes.
