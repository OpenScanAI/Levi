import React, { useState, useEffect } from 'react'
import Header from './components/Header'
import LiveMatches from './components/LiveMatches'
import StatsSection from './components/StatsSection'
import PointsTable from './components/PointsTable'
import Footer from './components/Footer'

function App() {
  const [matches, setMatches] = useState([])
  const [stats, setStats] = useState({})
  const [pointsTable, setPointsTable] = useState([])
  const [loading, setLoading] = useState(true)

  // Mock data for IPL 2025
  useEffect(() => {
    // Simulate API fetch
    setTimeout(() => {
      setMatches([
        {
          id: 1,
          team1: { name: 'MI', short: 'MI', color: '#004ba0', score: '186/4', overs: '20.0' },
          team2: { name: 'CSK', short: 'CSK', color: '#f85c00', score: '172/6', overs: '20.0' },
          status: 'live',
          format: 'T20',
          venue: 'Wankhede Stadium, Mumbai',
          runRate: '9.30'
        },
        {
          id: 2,
          team1: { name: 'RCB', short: 'RCB', color: '#ec1c24', score: '0/0', overs: '0.0' },
          team2: { name: 'KKR', short: 'KKR', color: '#3a225d', score: '0/0', overs: '0.0' },
          status: 'upcoming',
          format: 'T20',
          venue: 'M. Chinnaswamy Stadium, Bangalore',
          runRate: '-'
        },
        {
          id: 3,
          team1: { name: 'DC', short: 'DC', color: '#17479b', score: '201/5', overs: '20.0' },
          team2: { name: 'SRH', short: 'SRH', color: '#f7a721', score: '189/8', overs: '20.0' },
          status: 'completed',
          format: 'T20',
          venue: 'Arun Jaitley Stadium, Delhi',
          runRate: '10.05'
        }
      ])

      setStats({
        topRunScorers: [
          { name: 'Virat Kohli', team: 'RCB', stat: '485 runs' },
          { name: 'Rohit Sharma', team: 'MI', stat: '442 runs' },
          { name: 'Shubman Gill', team: 'GT', stat: '418 runs' },
          { name: 'Ruturaj Gaikwad', team: 'CSK', stat: '395 runs' },
          { name: 'KL Rahul', team: 'LSG', stat: '372 runs' }
        ],
        topWicketTakers: [
          { name: 'Jasprit Bumrah', team: 'MI', stat: '18 wickets' },
          { name: 'Yuzvendra Chahal', team: 'RR', stat: '16 wickets' },
          { name: 'Rashid Khan', team: 'GT', stat: '15 wickets' },
          { name: 'Arshdeep Singh', team: 'PBKS', stat: '14 wickets' },
          { name: 'Mohammed Shami', team: 'SRH', stat: '13 wickets' }
        ],
        highestScores: [
          { name: 'Jos Buttler', team: 'RR', stat: '124* (67)' },
          { name: 'Quinton de Kock', team: 'LSG', stat: '116 (58)' },
          { name: 'Sanju Samson', team: 'RR', stat: '109* (62)' },
          { name: 'Shubman Gill', team: 'GT', stat: '104* (55)' },
          { name: 'Virat Kohli', team: 'RCB', stat: '101* (63)' }
        ]
      })

      setPointsTable([
        { rank: 1, team: 'RR', played: 10, won: 7, lost: 3, points: 14, nrr: '+0.847' },
        { rank: 2, team: 'KKR', played: 10, won: 6, lost: 4, points: 12, nrr: '+0.512' },
        { rank: 3, team: 'MI', played: 10, won: 6, lost: 4, points: 12, nrr: '+0.321' },
        { rank: 4, team: 'CSK', played: 10, won: 5, lost: 5, points: 10, nrr: '+0.128' },
        { rank: 5, team: 'RCB', played: 10, won: 5, lost: 5, points: 10, nrr: '-0.045' },
        { rank: 6, team: 'GT', played: 10, won: 5, lost: 5, points: 10, nrr: '-0.156' },
        { rank: 7, team: 'SRH', played: 10, won: 4, lost: 6, points: 8, nrr: '-0.298' },
        { rank: 8, team: 'DC', played: 10, won: 4, lost: 6, points: 8, nrr: '-0.412' },
        { rank: 9, team: 'LSG', played: 10, won: 4, lost: 6, points: 8, nrr: '-0.534' },
        { rank: 10, team: 'PBKS', played: 10, won: 3, lost: 7, points: 6, nrr: '-0.678' }
      ])

      setLoading(false)
    }, 1000)
  }, [])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--bg)'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid var(--primary-light)',
          borderTop: '3px solid var(--accent)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div>
      <Header />
      <main>
        <LiveMatches matches={matches} />
        <StatsSection stats={stats} />
        <PointsTable teams={pointsTable} />
      </main>
      <Footer />
    </div>
  )
}

export default App
