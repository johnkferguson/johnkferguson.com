import React from "react"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw" // Allows raw HTML (like iframes)
// import rehypeSanitize from 'rehype-sanitize'; // (Optional) Add for extra security
import Image from "next/image"

interface MarkdownRendererProps {
  content: string
  blurMap?: Record<
    string,
    { blurDataURL: string; width: number; height: number }
  >
}

// Helper: Try to extract width/height from Markdown image alt text or fallback
function getImageSize(src: string) {
  // You may want to improve this for your use-case
  // Default sizes (can be overridden by convention)
  if (src.includes("/images/posts/")) {
    return { width: 800, height: 500 }
  }
  return { width: 600, height: 400 }
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  blurMap = {},
}) => {
  return (
    <ReactMarkdown
      components={{
        img: ({ node, ...props }) => {
          const src = typeof props.src === "string" ? props.src : ""
          const imageMeta = blurMap[src]
          const width = imageMeta?.width || 600
          const height = imageMeta?.height || 400
          return (
            <Image
              src={src}
              alt={props.alt || ""}
              width={width}
              height={height}
              {...(imageMeta
                ? { placeholder: "blur", blurDataURL: imageMeta.blurDataURL }
                : {})}
              style={{
                maxWidth: "100%",
                height: "auto",
                borderRadius: "0.25rem",
              }}
            />
          )
        },
      }}
      rehypePlugins={[rehypeRaw /*, rehypeSanitize */]}
    >
      {content}
    </ReactMarkdown>
  )
}

export default MarkdownRenderer
