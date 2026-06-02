import React from 'react'

function StatsSection({ stats }) {
  if (!stats || !stats.topRunScorers) return null

  return (
    <section id="stats" className="stats-section">
      <div className="container">
        <h2 className="section-title">Player Stats</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Top Run Scorers</span>
            </div>
            <ul className="stat-list">
              {stats.topRunScorers.map((player, idx) => (
                <li key={idx} className="stat-item">
                  <span className="player-name">{player.name} <small style={{ color: 'var(--text-muted)' }}>({player.team})</small></span>
                  <span className="player-stat">{player.stat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Top Wicket Takers</span>
            </div>
            <ul className="stat-list">
              {stats.topWicketTakers.map((player, idx) => (
                <li key={idx} className="stat-item">
                  <span className="player-name">{player.name} <small style={{ color: 'var(--text-muted)' }}>({player.team})</small></span>
                  <span className="player-stat">{player.stat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Highest Scores</span>
            </div>
            <ul className="stat-list">
              {stats.highestScores.map((player, idx) => (
                <li key={idx} className="stat-item">
                  <span className="player-name">{player.name} <small style={{ color: 'var(--text-muted)' }}>({player.team})</small></span>
                  <span className="player-stat">{player.stat}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

export default StatsSection
