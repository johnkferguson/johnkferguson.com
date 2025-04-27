import React from "react"
import Link from "next/link"
import TwitterIcon from "./icons/TwitterIcon"
import GithubIcon from "./icons/GithubIcon"
import EmailIcon from "./icons/EmailIcon"

export default function SiteFooter() {
  const emailAddress = "hello@johnkellyferguson.com"
  const githubUsername = "johnkferguson"
  const twitterUsername = "johnkferguson"

  return (
    <footer className="border-t border-[#e8e8e8] bg-[#fdfdfd] py-[1.7rem] text-center">
      <div className="max-w-[30rem] mx-auto px-3 text-left">
        <ul className="flex flex-row justify-start gap-[0.25rem] p-0">
          <li className="h-[3.45rem] list-none">
            <a
              href={`https://twitter.com/${twitterUsername}`}
              aria-label="Twitter"
              className="flex items-center justify-center"
            >
              <TwitterIcon className="w-[2.3rem] h-[2.3rem] fill-[#c2c2c2] hover:fill-[#9ae4e8] transition-colors" />
            </a>
          </li>
          <li className="github px-4">
            <a
              href={`https://github.com/${githubUsername}`}
              aria-label="GitHub"
              className="flex items-center justify-center"
            >
              <GithubIcon className="w-[2.3rem] h-[2.3rem] fill-[#c2c2c2] hover:fill-black transition-colors" />
            </a>
          </li>
          <li>
            <a
              href={`mailto:${emailAddress}`}
              aria-label="Email"
              className="flex items-center justify-center"
            >
              <EmailIcon className="w-[2.3rem] h-[2.3rem] fill-[#c2c2c2] hover:fill-[#000] transition-colors" />
            </a>
          </li>
        </ul>
      </div>
    </footer>
  )
}
