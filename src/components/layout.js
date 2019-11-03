import React from "react"

import Header from "./header"
import Footer from "./footer"
import "../styles/index.sass"

const Layout = props => {
  return (
    <div>
      <Header />
      <div className="page-content">
        <div className="wrap">{props.children}</div>
      </div>
      <Footer />
    </div>
  )
}

export default Layout
