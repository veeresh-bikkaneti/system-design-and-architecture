import { Link } from 'react-router-dom';
import { badgeIconUrl, type BadgeWithStatus } from '../../lib/badges';
import { Icon } from '../ui/Icon';
import './badges.css';

/**
 * A badge tile in the gallery. `isNew` is true for unlocked badges the
 * learner hasn't seen in the gallery yet — only those get the pop-in
 * animation (`.badge-card--fresh`), so it doesn't replay for every
 * unlocked badge on every visit.
 */
export function BadgeCard({ badge, isNew = false }: { badge: BadgeWithStatus; isNew?: boolean }) {
  const fresh = badge.unlocked && isNew;
  return (
    <Link
      to={`/badges/${badge.id}`}
      aria-label={`${badge.name} — ${badge.unlocked ? 'unlocked' : 'locked'}`}
      className={`badge-card ${badge.unlocked ? 'badge-card--unlocked' : 'badge-card--locked'}${fresh ? ' badge-card--fresh' : ''}`}
    >
      <span className="badge-card__art">
        <img
          src={badgeIconUrl(badge.iconFile)}
          alt=""
          draggable={false}
          className="badge-card__img"
        />
        {!badge.unlocked && (
          <span className="badge-card__lock" aria-hidden="true">
            <Icon name="lockFilled" className="h-7 w-7" />
          </span>
        )}
      </span>
      <span className="badge-card__name">{badge.name}</span>
      <span className="badge-card__status">
        {badge.unlocked ? (
          <span className="badge-card__pill badge-card__pill--unlocked">
            <Icon name="checkFilled" className="h-3.5 w-3.5" />
            Unlocked
          </span>
        ) : (
          <span className="badge-card__hint">{badge.criteria}</span>
        )}
      </span>
    </Link>
  );
}
