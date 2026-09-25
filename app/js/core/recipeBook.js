// 레시피 목록 = 앱에 들어 있는 프리셋 + 사용자가 가져온 레시피(저장소 'recipes', 계정이면 기기 간 동기화).
// 기록에는 그때의 레시피 원본(snapshot)이 들어가므로, 가져온 레시피를 지워도 옛 기록은 그대로다.

import { PRESETS } from '../data/presets.js';
import { store } from './store.js';

export function userRecipes() {
  return store.list('recipes').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function allRecipes() {
  return [...PRESETS, ...userRecipes()];
}

export function findRecipe(id) {
  return PRESETS.find((r) => r.id === id) ?? store.get('recipes', id) ?? null;
}
