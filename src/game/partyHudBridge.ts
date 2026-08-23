export type DesktopPartyMember = {
  id: string;
  name: string;
  level?: number;
  hp: number;
  maxHp: number;
  role?: string;
};

type PartyUpdateDetail = { members?: DesktopPartyMember[] };

export function setDesktopPartyMembers(members: DesktopPartyMember[]) {
  window.dispatchEvent(new CustomEvent<PartyUpdateDetail>('ascension-party-update', { detail: { members } }));
}

export function installDesktopPartyHudBridge() {
  const panel = document.querySelector<HTMLElement>('#party-panel');
  const list = panel?.querySelector<HTMLElement>('#party-members');
  if (!panel || !list || panel.dataset.partyBridge === '1') return;
  panel.dataset.partyBridge = '1';

  const render = (members: DesktopPartyMember[]) => {
    const active = members.length > 0;
    panel.classList.toggle('party-hidden', !active);
    if (!active) { list.innerHTML = ''; return; }
    list.innerHTML = members.map((member) => {
      const hpPct = Math.max(0, Math.min(100, member.hp / Math.max(1, member.maxHp) * 100));
      return `<article class="party-member" data-party-member="${member.id}">
        <div class="party-member-avatar">${member.name.slice(0, 1).toUpperCase()}</div>
        <div class="party-member-copy"><div><strong>${member.name}</strong><span>${member.level ? `Nv. ${member.level}` : member.role ?? ''}</span></div><div class="party-hp"><i style="width:${hpPct}%"></i></div></div>
      </article>`;
    }).join('');
  };

  window.addEventListener('ascension-party-update', (event) => {
    const detail = (event as CustomEvent<PartyUpdateDetail>).detail;
    render(Array.isArray(detail?.members) ? detail.members : []);
  });

  render([]);
}
