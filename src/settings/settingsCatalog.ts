export type InputActionId =
  | 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight'
  | 'basicAttack' | 'interact'
  | 'skill1' | 'skill2' | 'skill3' | 'skill4'
  | 'inventory' | 'character' | 'quests' | 'pet' | 'map' | 'guild' | 'chat' | 'menu';

export type InputActionDefinition = {
  id: InputActionId;
  group: 'Movimento' | 'Combate' | 'Interfaces';
  label: string;
  description: string;
  defaultCode: string;
};

// O futuro Editor de Configurações/Controles poderá gerar este mesmo catálogo.
export const INPUT_ACTIONS: InputActionDefinition[] = [
  { id: 'moveUp', group: 'Movimento', label: 'Mover para cima', description: 'Movimenta o personagem para o norte.', defaultCode: 'KeyW' },
  { id: 'moveDown', group: 'Movimento', label: 'Mover para baixo', description: 'Movimenta o personagem para o sul.', defaultCode: 'KeyS' },
  { id: 'moveLeft', group: 'Movimento', label: 'Mover para esquerda', description: 'Movimenta o personagem para oeste.', defaultCode: 'KeyA' },
  { id: 'moveRight', group: 'Movimento', label: 'Mover para direita', description: 'Movimenta o personagem para leste.', defaultCode: 'KeyD' },
  { id: 'basicAttack', group: 'Combate', label: 'Ataque básico', description: 'Executa o ataque básico da classe com o botão esquerdo do mouse.', defaultCode: 'Mouse0' },
  { id: 'interact', group: 'Combate', label: 'Interagir / coletar', description: 'Conversa, usa objetos e coleta recursos.', defaultCode: 'KeyE' },
  { id: 'skill1', group: 'Combate', label: 'Habilidade 1', description: 'Usa a habilidade do slot 1.', defaultCode: 'Digit1' },
  { id: 'skill2', group: 'Combate', label: 'Habilidade 2', description: 'Usa a habilidade do slot 2.', defaultCode: 'Digit2' },
  { id: 'skill3', group: 'Combate', label: 'Habilidade 3', description: 'Usa a habilidade do slot 3.', defaultCode: 'Digit3' },
  { id: 'skill4', group: 'Combate', label: 'Habilidade 4', description: 'Usa a habilidade do slot 4.', defaultCode: 'Digit4' },
  { id: 'inventory', group: 'Interfaces', label: 'Inventário', description: 'Abre ou fecha o inventário.', defaultCode: 'KeyI' },
  { id: 'character', group: 'Interfaces', label: 'Personagem', description: 'Abre ou fecha a ficha do personagem.', defaultCode: 'KeyC' },
  { id: 'quests', group: 'Interfaces', label: 'Diário de Missões', description: 'Abre ou fecha o diário de missões.', defaultCode: 'KeyJ' },
  { id: 'pet', group: 'Interfaces', label: 'Mascote', description: 'Abre ou fecha as opções do mascote.', defaultCode: 'KeyP' },
  { id: 'map', group: 'Interfaces', label: 'Mapa', description: 'Abre ou fecha o mapa mundial.', defaultCode: 'KeyM' },
  { id: 'guild', group: 'Interfaces', label: 'Guilda', description: 'Abre ou fecha a janela de guilda e descoberta.', defaultCode: 'KeyG' },
  { id: 'chat', group: 'Interfaces', label: 'Abrir Chat', description: 'Abre o chat e posiciona o cursor no campo de mensagem.', defaultCode: 'Enter' },
  { id: 'menu', group: 'Interfaces', label: 'Menu do jogo', description: 'Abre o menu de pausa. ESC continua funcionando como tecla de segurança.', defaultCode: 'Escape' },
];

export type SettingsCategoryId = 'controls' | 'graphics' | 'audio' | 'interface' | 'gameplay';

export const SETTINGS_CATEGORIES: Array<{ id: SettingsCategoryId; label: string; icon: string; description: string }> = [
  { id: 'controls', label: 'Controles', icon: '⌨', description: 'Teclas e ações do jogo.' },
  { id: 'graphics', label: 'Gráficos', icon: '◈', description: 'Qualidade, renderização e desempenho.' },
  { id: 'audio', label: 'Áudio', icon: '🔊', description: 'Volumes independentes por canal.' },
  { id: 'interface', label: 'Interface', icon: '▣', description: 'Elementos visíveis do HUD.' },
  { id: 'gameplay', label: 'Gameplay', icon: '⚙', description: 'Preferências gerais de jogabilidade.' },
];

export type SettingDescriptor = {
  id: string;
  category: Exclude<SettingsCategoryId, 'controls'>;
  label: string;
  description: string;
  type: 'toggle' | 'slider' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string | number; label: string }>;
  restartRequired?: boolean;
  future?: boolean;
};

// A UI é orientada por estes dados. O Editor futuro poderá criar/ordenar opções equivalentes.
export const SETTINGS_CATALOG: SettingDescriptor[] = [
  { id: 'graphics.preset', category: 'graphics', label: 'Qualidade', description: 'Aplica um conjunto equilibrado de opções gráficas.', type: 'select', options: [
    { value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }, { value: 'ultra', label: 'Ultra' }, { value: 'custom', label: 'Personalizada' },
  ] },
  { id: 'graphics.renderScale', category: 'graphics', label: 'Escala de renderização', description: 'Reduz para ganhar desempenho ou aumenta para deixar a imagem mais nítida.', type: 'select', restartRequired: true, options: [
    { value: .65, label: '65%' }, { value: .85, label: '85%' }, { value: 1, label: '100%' }, { value: 1.25, label: '125%' },
  ] },
  { id: 'graphics.antialias', category: 'graphics', label: 'Antialiasing', description: 'Suaviza bordas. É aplicado ao entrar novamente no personagem.', type: 'toggle', restartRequired: true },
  { id: 'graphics.fpsLimit', category: 'graphics', label: 'Limite de FPS', description: 'Controla a taxa máxima de atualização do jogo.', type: 'select', options: [
    { value: 30, label: '30 FPS' }, { value: 60, label: '60 FPS' }, { value: 120, label: '120 FPS' }, { value: 0, label: 'Sem limite' },
  ] },
  { id: 'graphics.effects', category: 'graphics', label: 'Efeitos de habilidades', description: 'Permite efeitos visuais de ataques e habilidades.', type: 'toggle' },
  { id: 'graphics.particles', category: 'graphics', label: 'Partículas', description: 'Preparado para partículas de habilidades, clima e cenário.', type: 'toggle', future: true },
  { id: 'graphics.lighting', category: 'graphics', label: 'Iluminação avançada', description: 'Preparado para luzes dinâmicas do mundo e habilidades.', type: 'toggle', future: true },
  { id: 'graphics.bloom', category: 'graphics', label: 'Bloom', description: 'Preparado para brilho em magia, cristais e iluminação.', type: 'toggle', future: true },

  { id: 'audio.master', category: 'audio', label: 'Volume geral', description: 'Controla todos os canais de áudio.', type: 'slider', min: 0, max: 100, step: 1 },
  { id: 'audio.music', category: 'audio', label: 'Música', description: 'Músicas de mapas, cidades e combates.', type: 'slider', min: 0, max: 100, step: 1 },
  { id: 'audio.sfx', category: 'audio', label: 'Efeitos', description: 'Combate, habilidades, crafting e coleta.', type: 'slider', min: 0, max: 100, step: 1 },
  { id: 'audio.ambient', category: 'audio', label: 'Ambiente', description: 'Floresta, vento, chuva, água e outros sons do mapa.', type: 'slider', min: 0, max: 100, step: 1 },
  { id: 'audio.ui', category: 'audio', label: 'Interface', description: 'Cliques, avisos e sons de menus.', type: 'slider', min: 0, max: 100, step: 1 },
  { id: 'audio.voice', category: 'audio', label: 'Falas', description: 'Canal reservado para vozes de NPCs e cenas.', type: 'slider', min: 0, max: 100, step: 1, future: true },

  { id: 'interface.showMinimap', category: 'interface', label: 'Mostrar minimapa no PC', description: 'Exibe o minimapa permanente no desktop.', type: 'toggle' },
  { id: 'interface.showQuestTracker', category: 'interface', label: 'Rastreador de missão', description: 'Mostra a missão rastreada no HUD.', type: 'toggle' },
  { id: 'interface.showDesktopShortcuts', category: 'interface', label: 'Dicas de atalhos', description: 'Mostra a faixa de atalhos na parte inferior do PC.', type: 'toggle' },
  { id: 'interface.showNames', category: 'interface', label: 'Nomes de personagens e monstros', description: 'Base para controle de nomes do mundo.', type: 'toggle' },
  { id: 'interface.showFloatingDamage', category: 'interface', label: 'Números flutuantes', description: 'Mostra dano, cura, EXP e coleta acima do mundo.', type: 'toggle' },

  { id: 'gameplay.tutorials', category: 'gameplay', label: 'Dicas e tutoriais', description: 'Permite mensagens de orientação para sistemas novos.', type: 'toggle' },
  { id: 'gameplay.confirmRareDiscard', category: 'gameplay', label: 'Confirmar descarte raro', description: 'Preparado para exigir confirmação ao descartar itens valiosos.', type: 'toggle', future: true },
  { id: 'gameplay.confirmRareSell', category: 'gameplay', label: 'Confirmar venda rara', description: 'Preparado para exigir confirmação ao vender equipamentos valiosos.', type: 'toggle', future: true },
];
