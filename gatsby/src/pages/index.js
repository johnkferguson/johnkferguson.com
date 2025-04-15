import React from "react"

import Layout from "../components/layout"
import Head from "../components/head"
import { Link, graphql, useStaticQuery } from "gatsby"

const IndexPage = () => {
  const data = useStaticQuery(graphql`
    query {
      allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
        edges {
          node {
            frontmatter {
              title
              date(formatString: "MMM D, YYYY")
            }
            fields {
              slug
            }
          }
        }
      }
    }
  `)

  return (
    <Layout>
      <Head />
      <ul className="posts">
        {data.allMarkdownRemark.edges.map(edge => {
          return (
            <li>
              <span className="post-date">{edge.node.frontmatter.date}</span>
              <Link className="post-link" to={edge.node.fields.slug}>
                {edge.node.frontmatter.title}
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="rss-subscribe">
        subscribe <a href="/rss.xml">via RSS</a>
      </p>
    </Layout>
  )
}

export default IndexPage
