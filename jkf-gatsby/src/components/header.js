import React from "react"
import { Link, graphql, useStaticQuery } from "gatsby"

const Header = () => {
  const data = useStaticQuery(graphql`
    {
      site {
        siteMetadata {
          title
        }
      }
    }
  `)

  return (
    <header className="site-header">
      <div className="wrap">
        <Link className="site-title" to="/">
          {data.site.siteMetadata.title}
        </Link>
        <nav className="site-nav">
          <div className="trigger"></div>
        </nav>
      </div>
    </header>
  )
}

export default Header
