// Les 3 vies affichées comme 3 rondelles. Une vie perdue devient une rondelle pâle.
export default function Lives({ n, size = 22 }) {
  const left = Math.max(0, Math.min(3, n || 0));
  return (
    <span className="lives" role="img" aria-label={`${left} vie${left > 1 ? 's' : ''} sur 3`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} className={'puck' + (i >= left ? ' lost' : '')} width={size} height={Math.round(size * 0.72)} viewBox="0 0 30 22" aria-hidden="true">
          <path d="M1 8v6c0 3.6 6.3 6.5 14 6.5S29 17.6 29 14V8" fill="currentColor" />
          <path d="M1 11.5c0 3.6 6.3 6.5 14 6.5s14-2.9 14-6.5" fill="none" stroke="var(--puck-band)" strokeWidth="1.2" />
          <ellipse cx="15" cy="8" rx="14" ry="6.5" fill="currentColor" />
          <ellipse cx="15" cy="8" rx="14" ry="6.5" fill="none" stroke="var(--puck-edge)" strokeWidth="1" />
        </svg>
      ))}
    </span>
  );
}
