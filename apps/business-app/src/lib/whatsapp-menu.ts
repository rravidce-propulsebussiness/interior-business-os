export type WhatsAppMenuOption = { key: string; title: string; reply: string };

/**
 * Build the auto-reply menu message. The text lists every option so customers
 * can type a number; the interactive list lets them tap instead. Meta limits:
 * body 1024 chars, button 20, row title 24, up to 10 rows.
 */
export function whatsappMenuMessage(
  intro: string,
  rule: { rule_id?: string; menu?: unknown },
) {
  const options = (Array.isArray(rule.menu) ? rule.menu : [])
    .filter(
      (item): item is WhatsAppMenuOption =>
        !!item &&
        typeof item === 'object' &&
        /^[0-9]{1,2}$/.test(String((item as WhatsAppMenuOption).key)) &&
        typeof (item as WhatsAppMenuOption).title === 'string',
    )
    .slice(0, 10);
  if (!options.length || !rule.rule_id) return null;
  const lines = options.map((option) => `${option.key}. ${option.title}`);
  const text = `${intro.trim()}\n\n${lines.join('\n')}\n\nReply with a number, or type MENU to see this again.`;
  return {
    text,
    interactive: {
      type: 'list',
      body: { text: text.slice(0, 1024) },
      action: {
        button: 'Choose an option',
        sections: [
          {
            title: 'Options',
            rows: options.map((option) => ({
              id: `menu:${rule.rule_id}:${option.key}`,
              title: `${option.key}. ${option.title}`.slice(0, 24),
            })),
          },
        ],
      },
    },
  };
}
