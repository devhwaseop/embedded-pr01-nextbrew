// 블렌드(9/26 사용자 요청). 세 경우를 나눈다.
// ① 로스터리 블렌드: 산 원두가 블렌드 — 원두 등록에서 산지별 구성(비율)을 적는다. bean.blend = { by: 'roaster', parts: [{ country, region, variety, process, pct }] }
// ② 내가 섞은 블렌드: 가진 원두를 미리 섞어 담아 둔 것 — 원두 등록에서 섞은 원두와 무게를 적는다. bean.blend = { by: 'me', parts: [{ beanId, name, g }] }
//    섞은 무게만큼 그 원두들의 남은 양에서 빼고(schema.js beanStock), 블렌드는 섞은 무게 합을 자기 양으로 갖는다.
// ③ 블렌드 템플릿: 추출할 때마다 가진 원두를 섞는 비율 — 따로 등록한다(blends 컬렉션). 준비 화면에서 고르면
//    원두량을 비율대로 나눠 원두마다 뺀다. 기록은 brew.bean = { id: null, name, blendId, parts: [{ id, name, ratio, g }] }.
// 원두·템플릿 이름은 포인터로 따라간다(core/migrate.js syncRefs · syncBlendParts).

import { n2, newId, SCHEMA_VERSION } from './schema.js';

export const BLEND_KINDS = { single: '싱글 오리진', roaster: '로스터리 블렌드', me: '내가 섞은 블렌드' };
export const MAX_PARTS = 8;

export function blendKind(bean) {
  return bean?.blend?.by === 'roaster' || bean?.blend?.by === 'me' ? bean.blend.by : 'single';
}

export function createBlend(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('blend', now),
    name: '',
    nameAuto: true, // 이름 = 섞는 원두 이름을 « + »로 이은 것. false = 직접 적은 이름
    parts: [], // [{ beanId, name(원두를 지웠을 때 남는 마지막 이름), ratio(비율 — 합이 100 이 아니어도 된다) }]
    memo: '',
    inactive: null, // 9/27 비활성화 { at } — 추출 준비의 원두 목록에서 빠진다(core/schema.js isActive)
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}

// 이름 자동 짓기 — 로스터리 블렌드: 「에티오피아·브라질 블렌드」, 내가 섞은 블렌드·템플릿: 「A + B」
export function blendAutoName(bean) {
  const kind = blendKind(bean);
  if (kind === 'roaster') {
    const countries = [...new Set((bean.blend.parts ?? []).map((p) => (p.country ?? '').trim()).filter(Boolean))];
    return countries.length ? `${countries.join('·')} 블렌드` : '';
  }
  if (kind === 'me') return partNames(bean.blend.parts);
  return '';
}
export function templateAutoName(t) {
  return partNames(t.parts);
}
function partNames(parts) {
  return (parts ?? []).map((p) => (p.name ?? '').trim()).filter(Boolean).join(' + ');
}

// 비율 합(0 이하·빈 값은 뺀다)
export function ratioSum(parts) {
  return (parts ?? []).reduce((a, p) => a + (Number(p.ratio) > 0 ? Number(p.ratio) : 0), 0);
}
// 비율 → 퍼센트(둘째 자리까지). 합이 0 이면 null
export function ratioPct(parts, p) {
  const sum = ratioSum(parts);
  return sum > 0 && Number(p.ratio) > 0 ? n2((Number(p.ratio) / sum) * 100) : null;
}

// 원두량을 비율대로 나눈다 → [{ id, name, ratio, g }]. 둘째 자리까지 반올림하고, 반올림으로 생긴 차이는 마지막 원두에 얹어 합이 원두량과 같게 한다.
export function splitDose(parts, doseG) {
  const use = (parts ?? []).filter((p) => p.beanId && Number(p.ratio) > 0);
  const sum = ratioSum(use);
  const dose = Number(doseG) || 0;
  if (!use.length || sum <= 0) return [];
  const out = use.map((p) => ({ id: p.beanId, name: p.name ?? '', ratio: Number(p.ratio), g: n2((dose * Number(p.ratio)) / sum) }));
  const rest = n2(dose - out.slice(0, -1).reduce((a, x) => a + x.g, 0));
  out[out.length - 1].g = rest;
  return out;
}

// 「A 10g + B 5g」(기록) · 「A 60% + B 40%」(템플릿) · 「에티오피아 예가체프 50% · 브라질 50%」(로스터리)
export function partsLine(parts, { kind = 'grams' } = {}) {
  const list = parts ?? [];
  if (kind === 'origin') {
    return list
      .map((p) => {
        const where = [p.country, p.region, p.variety, p.process].map((v) => (v ?? '').trim()).filter(Boolean).join(' ');
        return p.pct != null ? `${where} ${n2(p.pct)}%` : where;
      })
      .filter(Boolean)
      .join(' · ');
  }
  if (kind === 'ratio') return list.map((p) => `${p.name}${ratioPct(list, p) != null ? ` ${ratioPct(list, p)}%` : ''}`).join(' + ');
  return list.map((p) => `${p.name} ${n2(p.g)}g`).join(' + ');
}

// 기록이 가리키는 «원두 쪽» 식별자: 등록 원두 ID 또는 블렌드 템플릿 ID(접두어가 달라 겹치지 않는다)
export function beanRef(brew) {
  return brew?.bean?.id ?? brew?.bean?.blendId ?? null;
}

// 이 기록에서 실제로 쓴 등록 원두 ID 들(템플릿이면 섞은 원두들)
export function brewBeanIds(brew) {
  if (brew?.bean?.parts?.length) return brew.bean.parts.map((p) => p.id).filter(Boolean);
  return brew?.bean?.id ? [brew.bean.id] : [];
}

// 기록 한 줄 원두 표기: 템플릿으로 섞었으면 이름 뒤에 원두별 무게
export function brewBeanLabel(brew) {
  const b = brew?.bean;
  if (!b) return null;
  return b.parts?.length ? `${b.name} (${partsLine(b.parts)})` : b.name;
}
