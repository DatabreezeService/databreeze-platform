export function MemberAgentSettings({
  locale,
  level,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly level: 'NONE' | 'ANALYZE' | 'PROPOSE_CHANGES' | 'APPLY_CONFIRMED_CHANGES';
}) {
  return (
    <section aria-label={locale === 'vi-VN' ? 'Quyền trợ lý' : 'Agent grant'}>
      <h2>{locale === 'vi-VN' ? 'Mức trợ lý' : 'Agent level'}</h2>
      <p>{level}</p>
    </section>
  );
}
