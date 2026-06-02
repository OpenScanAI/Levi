import React from 'react'

function Header() {
  return (
    <header className="header">
      <div className="container header-content">
        <div className="logo">IPL 2025</div>
        <nav>
          <ul className="nav-links">
            <li><a href="#matches">Matches</a></li>
            <li><a href="#stats">Stats</a></li>
            <li><a href="#points">Points Table</a></li>
          </ul>
        </nav>
      </div>
      <div className="live-banner">
        <div className="container">
          LIVE: MI 186/4 (20.0) vs CSK 172/6 (20.0) — MI won by 14 runs
        </div>
      </div>
    </header>
  )
}

export default Header
