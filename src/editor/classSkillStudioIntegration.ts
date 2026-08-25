import { listPublishedSkills } from '../skills/skillStudioStore';

export function installClassSkillStudioIntegration(root: HTMLElement) {
  let frame = 0;
  const enhance = () => {
    frame = 0;
    const textarea = root.querySelector<HTMLTextAreaElement>('textarea[data-skills]');
    if (!textarea || textarea.dataset.skillPickerInstalled === '1') return;
    textarea.dataset.skillPickerInstalled = '1';
    textarea.style.display = 'none';
    const selected = new Set(textarea.value.split(/\n|,/).map((value) => value.trim()).filter(Boolean));
    const holder = document.createElement('div');
    holder.className = 'class-section-body';
    holder.style.cssText = 'display:grid;gap:7px;margin-top:6px;padding:0';
    const skills = listPublishedSkills().sort((a,b)=>a.classId.localeCompare(b.classId)||a.slot-b.slot);
    if (!skills.length) holder.innerHTML = '<div class="class-empty">Nenhuma Skill publicada no Skill Studio.</div>';
    for (const skill of skills) {
      const label = document.createElement('label'); label.className='class-check';
      const input = document.createElement('input'); input.type='checkbox'; input.checked=selected.has(skill.key);
      input.addEventListener('change',()=>{
        if(input.checked) selected.add(skill.key); else selected.delete(skill.key);
        textarea.value=[...selected].join('\n');
        textarea.dispatchEvent(new Event('change',{bubbles:true}));
      });
      const text=document.createElement('span'); text.textContent=`${skill.icon} #${skill.numericId} · ${skill.name} — ${skill.className} · slot ${skill.slot}`;
      label.append(input,text); holder.appendChild(label);
    }
    const open=document.createElement('button');open.type='button';open.className='class-btn';open.textContent='Abrir Skill Studio';open.onclick=()=>{const url=new URL(window.location.href);url.searchParams.set('editor','skills');window.location.href=url.toString();};holder.appendChild(open);
    textarea.parentElement?.appendChild(holder);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(enhance);};
  const observer=new MutationObserver(schedule); observer.observe(root,{childList:true,subtree:true}); enhance();
  window.addEventListener('pagehide',()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);},{once:true});
}
