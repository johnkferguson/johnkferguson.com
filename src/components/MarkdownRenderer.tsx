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


const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  blurMap = {},
}) => {
  return (
    <ReactMarkdown
      components={{
        img: ({ ...props }) => {
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
