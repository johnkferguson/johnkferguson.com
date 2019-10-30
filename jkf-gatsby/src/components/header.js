import React from "react"
import { Link } from "gatsby"

const Header = () => {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link className="site-title" to="/">
          John K. Ferguson
        </Link>
        <nav className="site-nav">
          <div className="trigger"></div>
        </nav>
      </div>
    </header>
  )
}

export default Header
