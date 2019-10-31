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
