// Stub — Purple Dawn skin toggle. Full implementation pending.

export type SkinType = 'classic' | 'dawn';

const SKIN_KEY = 'purpclaw-skin';

export function getSavedSkin(): SkinType {
  if (typeof window === 'undefined') return 'classic';
  const saved = localStorage.getItem(SKIN_KEY);
  return saved === 'dawn' ? 'dawn' : 'classic';
}

export function setSavedSkin(skin: SkinType) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SKIN_KEY, skin);
}
