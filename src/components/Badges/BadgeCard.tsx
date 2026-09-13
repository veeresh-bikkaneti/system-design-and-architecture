import { Link } from 'react-router-dom';
import { badgeIconUrl, type BadgeWithStatus } from '../../lib/badges';
import './badges.css';

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

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
            <LockIcon />
          </span>
        )}
      </span>
      <span className="badge-card__name">{badge.name}</span>
      <span className="badge-card__status">
        {badge.unlocked ? (
          <span className="badge-card__pill badge-card__pill--unlocked">
            <CheckIcon />
            Unlocked
          </span>
        ) : (
          <span className="badge-card__hint">{badge.criteria}</span>
        )}
      </span>
    </Link>
  );
}
