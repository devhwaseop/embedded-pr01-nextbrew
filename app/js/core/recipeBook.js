// 레시피 목록 = 앱에 들어 있는 프리셋 + 사용자가 가져온 레시피(저장소 'recipes', 계정이면 기기 간 동기화).
// 기록에는 그때의 레시피 원본(snapshot)이 들어가므로, 가져온 레시피를 지워도 옛 기록은 그대로다.

import { PRESETS } from '../data/presets.js';
import { store } from './store.js';

export function userRecipes() {
  return store.list('recipes').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// 목록 순서(9/27 사용자 요청 — 프리셋은 지울 수 없어 비활성화 대신 순서를 바꾼다): 설정 recipeOrder(ID 목록)에 적힌 것이 먼저,
// 적히지 않은 것(새로 가져온 레시피 등)은 그 뒤에 원래 순서(프리셋 → 가져온 것 이름순)대로. 지운 레시피 ID 는 건너뛴다.
export function orderRecipes(list, order = []) {
  const at = new Map((order ?? []).map((id, i) => [id, i]));
  return list
    .map((r, i) => [r, at.has(r.id) ? at.get(r.id) : order.length + i])
    .sort((a, b) => a[1] - b[1])
    .map(([r]) => r);
}

export function allRecipes() {
  return orderRecipes([...PRESETS, ...userRecipes()], store.settings().recipeOrder);
}

export function findRecipe(id) {
  return PRESETS.find((r) => r.id === id) ?? store.get('recipes', id) ?? null;
}
