export type VoiceSkillId = 'workspace.status' | 'memory.preview' | 'skills.status';

export type VoiceSkill = {
  id: VoiceSkillId;
  label: string;
  description: string;
  effect: 'read-only';
};

export const VOICE_SKILL_ALLOWLIST: VoiceSkill[] = [
  { id: 'workspace.status', label: 'Статус рабочего места', description: 'Показать локальный runtime и безопасные границы.', effect: 'read-only' },
  { id: 'memory.preview', label: 'Просмотр Markdown memory', description: 'Подготовить preview без записи в память.', effect: 'read-only' },
  { id: 'skills.status', label: 'Статус навыков', description: 'Показать allowlist и причины блокировки.', effect: 'read-only' },
];

export type VoicePlan = {
  skill: VoiceSkill;
  command: string;
  steps: string[];
  diff: string[];
};

export function buildVoicePlan(skillId: VoiceSkillId, rawCommand: string): VoicePlan | null {
  const command = rawCommand.trim().replace(/\s+/g, ' ').slice(0, 500);
  const skill = VOICE_SKILL_ALLOWLIST.find((item) => item.id === skillId);
  if (!command || !skill) return null;
  return {
    skill,
    command,
    steps: ['Проверить skill allowlist', 'Собрать read-only результат', 'Сформировать локальный receipt'],
    diff: [
      'Файлы: без изменений',
      'Shell и сеть: не используются',
      'Markdown memory: только preview, запись запрещена',
    ],
  };
}

export function executeReadOnlyPlan(plan: VoicePlan): string[] {
  if (plan.skill.effect !== 'read-only') throw new Error('Skill is not read-only');
  if (plan.skill.id === 'workspace.status') {
    return ['Runtime: dashboard sandbox', 'Execution: read-only', 'Voice I/O: not attested'];
  }
  if (plan.skill.id === 'memory.preview') {
    return ['# Sentinel memory proposal', '', `- Command: ${plan.command}`, '- Status: preview only'];
  }
  return VOICE_SKILL_ALLOWLIST.map((skill) => `${skill.id}: allowed (${skill.effect})`);
}
