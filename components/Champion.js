import styles from './champion.module.css';

// Bannière du ou des gagnants d'une ronde
export default function Champion({ name, round, pot, winners = 1, share, compact = false }) {
  const many = winners > 1;
  const potNum = Number(pot) || 0;
  return (
    <section className={styles.banner + (compact ? ' ' + styles.compact : '')} aria-label={`${many ? 'Champions' : 'Champion'} de la ronde ${round}: ${name}`}>
      <img className={styles.crest} src="/logo.png" alt="" width="74" height="83" />
      <div>
        <div className={styles.eyebrow}>{many ? 'Co-champions' : 'Champion'} · Ronde {round}</div>
        <div className={styles.name}>{name}</div>
        <div className={styles.pot}>
          {potNum <= 0
            ? (many ? 'Derniers survivants de la ronde' : 'Dernier survivant de la ronde')
            : many
              ? <>Se partagent la cagnotte de <b>{potNum} $</b>, soit <b>{Number(share).toFixed(2)} $</b> chacun</>
              : <>Remporte la cagnotte de <b>{potNum} $</b></>}
        </div>
      </div>
    </section>
  );
}
