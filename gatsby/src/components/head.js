import React from "react"
import { Helmet } from "react-helmet"
import { useStaticQuery, graphql } from "gatsby"

const Head = ({ pageTitle }) => {
  const data = useStaticQuery(graphql`
    query {
      site {
        siteMetadata {
          title
        }
      }
    }
  `)

  const siteTitle = data.site.siteMetadata.title
  const fullTitle = pageTitle ? `${pageTitle} | ${siteTitle}` : `${siteTitle}`
  return <Helmet title={fullTitle} />
}

export default Head
