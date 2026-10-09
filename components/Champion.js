import styles from './champion.module.css';

// Bannière du gagnant d'une ronde
export default function Champion({ name, round, pot, compact = false }) {
  return (
    <section className={styles.banner + (compact ? ' ' + styles.compact : '')} aria-label={`Champion de la ronde ${round}: ${name}`}>
      <img className={styles.crest} src="/logo.png" alt="" width="74" height="83" />
      <div>
        <div className={styles.eyebrow}>Champion · Ronde {round}</div>
        <div className={styles.name}>{name}</div>
        <div className={styles.pot}>{Number(pot) > 0 ? <>Remporte la cagnotte de <b>{Number(pot)} $</b></> : 'Dernier survivant de la ronde'}</div>
      </div>
    </section>
  );
}
