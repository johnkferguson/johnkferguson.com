import React from "react"

import Layout from "../components/layout"
import { Link, graphql, useStaticQuery } from "gatsby"
import { formatDateShortMonth } from "../helpers/format-date"

const IndexPage = () => {
  const data = useStaticQuery(graphql`
    query {
      allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
        edges {
          node {
            frontmatter {
              title
              date
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
      <ul className="posts">
        {data.allMarkdownRemark.edges.map(edge => {
          return (
            <li>
              <span className="post-date">
                {formatDateShortMonth(edge.node.frontmatter.date)}
              </span>
              <Link className="post-link" to={edge.node.fields.slug}>
                {edge.node.frontmatter.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </Layout>
  )
}

export default IndexPage
