import React from 'react'

function LiveMatches({ matches }) {
  const getStatusClass = (status) => {
    switch (status) {
      case 'live': return 'status-live'
      case 'upcoming': return 'status-upcoming'
      case 'completed': return 'status-completed'
      default: return ''
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'live': return 'LIVE'
      case 'upcoming': return 'UPCOMING'
      case 'completed': return 'COMPLETED'
      default: return status.toUpperCase()
    }
  }

  return (
    <section id="matches" className="matches-section">
      <div className="container">
        <h2 className="section-title">
          <span className="live-indicator"></span>
          Live Matches
        </h2>
        <div className="matches-grid">
          {matches.map((match) => (
            <div key={match.id} className="match-card">
              <div className="match-header">
                <span className="match-format">{match.format}</span>
                <span className={`match-status ${getStatusClass(match.status)}`}>
                  {getStatusLabel(match.status)}
                </span>
              </div>
              <div className="teams">
                <div className="team">
                  <div
                    className="team-logo"
                    style={{ background: match.team1.color }}
                  >
                    {match.team1.short}
                  </div>
                  <div className="team-name">{match.team1.name}</div>
                  <div className="team-score">{match.team1.score}</div>
                </div>
                <div className="vs">VS</div>
                <div className="team">
                  <div
                    className="team-logo"
                    style={{ background: match.team2.color }}
                  >
                    {match.team2.short}
                  </div>
                  <div className="team-name">{match.team2.name}</div>
                  <div className="team-score">{match.team2.score}</div>
                </div>
              </div>
              <div className="match-info">
                <div className="overs">Overs: {match.team1.overs} | {match.team2.overs}</div>
                <div className="run-rate">Run Rate: {match.runRate}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  {match.venue}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default LiveMatches
