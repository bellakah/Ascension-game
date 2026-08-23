let selectedMonsterId: string | null = null;

export function getSelectedMonsterId() {
  return selectedMonsterId;
}

export function setSelectedMonsterId(id: string | null) {
  selectedMonsterId = id;
  window.dispatchEvent(new CustomEvent('ascension-target-change', { detail: { monsterId: id } }));
}

export function clearSelectedMonsterId() {
  setSelectedMonsterId(null);
}
