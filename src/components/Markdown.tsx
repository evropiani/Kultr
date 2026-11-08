import { Fragment, type ReactNode } from 'react'

/**
 * Just enough Markdown for the changelog: paragraphs, bullet lists (with
 * wrapped lines), **bold**, *italic*, `code`, <kbd> and [links](https://…).
 * Built as React elements, never as HTML, so nothing in the text can run.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let list: string[] = []
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join(' '))}</p>)
    paragraph = []
  }
  const flushList = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length}>
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      )
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    const bullet = /^\s*[-*] (.*)$/.exec(line)
    if (bullet) {
      flushParagraph()
      list.push(bullet[1])
    } else if (list.length && /^\s{2,}\S/.test(line)) {
      list[list.length - 1] += ' ' + line.trim()
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  }
  flushParagraph()
  flushList()
  return <div className="markdown">{blocks}</div>
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|<kbd>[^<]+<\/kbd>|\[[^\]]+\]\([^)\s]+\))/g

function inline(text: string): ReactNode {
  const parts = text.split(TOKEN)
  return parts.map((part, i) => {
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('<kbd>')) return <kbd key={i}>{part.slice(5, -6)}</kbd>
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      const href = /^(https?:|\/|#)/.test(link[2]) ? link[2] : `https://github.com/evropiani/Kultr/blob/main/${link[2].replace(/^\.\//, '')}`
      return (
        <a key={i} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
          {link[1]}
        </a>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}
