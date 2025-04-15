import React from "react"

import GithubIcon from "./icons/github_icon"
import TwitterIcon from "./icons/twitter_icon"
import EmailIcon from "./icons/email_icon"

const Footer = () => {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <ul className="social-icons">
          <li>
            <TwitterIcon />
          </li>
          <li>
            <GithubIcon />
          </li>
          <li>
            <EmailIcon />
          </li>
        </ul>
      </div>
    </footer>
  )
}

export default Footer
