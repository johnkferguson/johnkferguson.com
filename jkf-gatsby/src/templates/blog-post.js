import React from "react"

import { graphql } from "gatsby"
import Layout from "../components/layout"
import { formatDate } from "../utils/format-date"

export const query = graphql`
  query($slug: String!) {
    markdownRemark(fields: { slug: { eq: $slug } }) {
      frontmatter {
        title
        date
      }
      html
    }
  }
`

const BlogPost = props => {
  return (
    <Layout>
      <div class="post">
        <header className="post-header">
          <h1>{props.data.markdownRemark.frontmatter.title}</h1>
          <p className="meta">
            {formatDate(props.data.markdownRemark.frontmatter.date)}
          </p>
        </header>
        <article
          className="post-content"
          dangerouslySetInnerHTML={{ __html: props.data.markdownRemark.html }}
        ></article>
      </div>
    </Layout>
  )
}

export default BlogPost
