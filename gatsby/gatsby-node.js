const path = require("path")

exports.onCreateNode = ({ node, actions }) => {
  const { createNodeField } = actions

  if (node.internal.type === "MarkdownRemark") {
    const fileName = path.basename(node.fileAbsolutePath, ".md")
    const slug = fileName.replace(/\d\d\d\d-\d\d-\d\d-/g, "")

    createNodeField({
      node,
      name: "slug",
      value: slug,
    })
  }
}

exports.createPages = async ({ graphql, actions }) => {
  const { createPage } = actions

  const blogPostTemplate = path.resolve("./src/templates/blog-post.js")

  const response = await graphql(
    `
      query loadBlogPostsQuery {
        allMarkdownRemark {
          edges {
            node {
              fields {
                slug
              }
            }
          }
        }
      }
    `
  )

  response.data.allMarkdownRemark.edges.forEach(edge => {
    createPage({
      path: `${edge.node.fields.slug}`,
      component: blogPostTemplate,
      context: {
        slug: edge.node.fields.slug,
      },
    })
  })
}
