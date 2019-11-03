import React from "react"

import { graphql } from "gatsby"
import Layout from "../components/layout"
import Head from "../components/head"
import { formatDateFullMonth } from "../helpers/format-date"

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
      <Head pageTitle={props.data.markdownRemark.frontmatter.title} />
      <div class="post">
        <header className="post-header">
          <h1>{props.data.markdownRemark.frontmatter.title}</h1>
          <p className="meta">
            {formatDateFullMonth(props.data.markdownRemark.frontmatter.date)}
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
