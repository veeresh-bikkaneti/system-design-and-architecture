import { Link } from 'react-router-dom';
import { badgeIconUrl, type BadgeWithStatus } from '../../lib/badges';
import './badges.css';

export function BadgeCard({ badge }: { badge: BadgeWithStatus }) {
  return (
    <Link
      to={`/badges/${badge.id}`}
      aria-label={`${badge.name} — ${badge.unlocked ? 'unlocked' : 'locked'}`}
      className={`badge-card ${badge.unlocked ? 'badge-card--unlocked' : 'badge-card--locked'}`}
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
            🔒
          </span>
        )}
      </span>
      <span className="badge-card__name">{badge.name}</span>
      <span className="badge-card__status">
        {badge.unlocked ? (
          <span className="badge-card__pill badge-card__pill--unlocked">Unlocked</span>
        ) : (
          <span className="badge-card__hint">{badge.criteria}</span>
        )}
      </span>
    </Link>
  );
}
