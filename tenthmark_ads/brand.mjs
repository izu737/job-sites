// Tenthmark brand tokens and proof points. Every template reads from here,
// so a palette or claim change happens in one place.

export const brand = {
  name: 'tenthmark',
  fonts: {
    display: "'Inter Display', 'Inter', system-ui, sans-serif",
    text: "'Inter', system-ui, sans-serif",
  },
  colors: {
    ink: '#0B1F1A',
    deep: '#0C3A2D',
    base: '#11694F',
    emerald: '#18A374',
    mint: '#5EE6A8',
    lime: '#D7F75B',
    cream: '#F6F3EA',
    paper: '#FFFFFF',
    muted: '#5B6B66',
    line: '#E3E8E5',
  },
  proof: {
    revenue: '$56,000',
    backers: ['Y Combinator', 'Sequoia Capital'],
    creator: '150K followers',
    promise: '0 to 20 users in 60 days',
  },
};

// Wordmark: a small tally glyph (four strokes crossed by a fifth) plus the name.
export function logo({ color = '#fff', size = 44 } = {}) {
  const s = size;
  return `
  <div class="logo" style="display:flex;align-items:center;gap:${s * 0.28}px;color:${color}">
    <svg width="${s * 0.82}" height="${s * 0.82}" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round">
      <line x1="8" y1="6" x2="8" y2="34"/><line x1="16" y1="6" x2="16" y2="34"/>
      <line x1="24" y1="6" x2="24" y2="34"/><line x1="32" y1="6" x2="32" y2="34"/>
      <line x1="3" y1="30" x2="37" y2="10"/>
    </svg>
    <span style="font-family:${brand.fonts.display};font-weight:700;font-size:${s}px;letter-spacing:-0.045em;line-height:1">${brand.name}</span>
  </div>`;
}
