import React from 'react'

function PointsTable({ teams }) {
  if (!teams || teams.length === 0) return null

  return (
    <section id="points" className="table-section">
      <div className="container">
        <h2 className="section-title">Points Table</h2>
        <table className="points-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>Played</th>
              <th>Won</th>
              <th>Lost</th>
              <th>Points</th>
              <th>NRR</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.rank}>
                <td className="team-rank">{team.rank}</td>
                <td><strong>{team.team}</strong></td>
                <td>{team.played}</td>
                <td>{team.won}</td>
                <td>{team.lost}</td>
                <td><strong>{team.points}</strong></td>
                <td>{team.nrr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default PointsTable
