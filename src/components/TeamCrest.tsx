import { useState } from 'react';
import type { Team } from '../types';
import { initials, teamTextColor } from '../lib/format';

export function TeamCrest({ team, size = 44 }: { team: Team; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="team-crest"
      style={{ width: size, height: size, background: team.color, color: teamTextColor(team.color) }}
      aria-hidden="true"
    >
      {team.logo && !failed ? (
        <img src={team.logo} alt="" onError={() => setFailed(true)} loading="lazy" />
      ) : (
        <span className="team-crest__initials">{initials(team.name)}</span>
      )}
    </span>
  );
}

export function TeamColorBar({ team }: { team: Team }) {
  return (
    <span className="team-color-bar" aria-hidden="true">
      <span style={{ background: team.color }} />
      <span style={{ background: team.altColor }} />
    </span>
  );
}
