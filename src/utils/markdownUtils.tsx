import React from 'react';

const parseInline = (text: string): React.ReactNode[] => {
    // Order matters: bold (**) before italic (*) to avoid conflicts
    const parts = text.split(/(\*\*.*?\*\*|\*[^*]+\*|`.*?`)/g);
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index} className="font-bold text-blue-100">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return <em key={index} className="italic text-slate-300">{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={index} className="bg-black/30 px-1 rounded text-xs font-mono text-blue-300 border border-blue-500/20">{part.slice(1, -1)}</code>;
        }
        return part;
    });
};

export const MarkdownText: React.FC<{ content: string; readable?: boolean }> = ({ content, readable = false }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];
  let isOrdered = false;

  const flushList = (key: string) => {
    if (!inList) return;
    if (isOrdered) {
      elements.push(<ol key={key} className="mb-3 ml-4 space-y-1 list-decimal list-outside">{listItems}</ol>);
    } else {
      elements.push(<ul key={key} className="mb-3 ml-2 space-y-1">{listItems}</ul>);
    }
    listItems = [];
    inList = false;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Horizontal rule
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList(`ul-${i}`);
      elements.push(<hr key={`hr-${i}`} className="border-slate-700/50 my-3" />);
      return;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushList(`ul-${i}`);
      const text = trimmed.slice(2);
      elements.push(
        <div key={`bq-${i}`} className="border-l-2 border-blue-500/40 pl-3 my-2 text-[#8a8f98] text-xs italic">
          {parseInline(text)}
        </div>
      );
      return;
    }

    // Headers (h1 through h4+)
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      flushList(`ul-${i}`);
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const styles: Record<number, string> = {
        1: "text-base font-bold text-white mt-4 mb-2 border-b border-blue-500/40 pb-1.5",
        2: "text-sm font-bold text-white mt-3 mb-1.5 border-b border-blue-500/30 pb-1",
        3: "text-sm font-semibold text-slate-100 mt-2.5 mb-1",
        4: "text-xs font-semibold text-slate-200 mt-2 mb-1",
      };
      const className = styles[Math.min(level, 4)] || styles[4];
      elements.push(<div key={`h-${i}`} className={className}>{parseInline(text)}</div>);
      return;
    }

    // Bullet lists
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
    // Numbered lists
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);

    if (isBullet) {
      if (!inList || isOrdered) { flushList(`ul-${i}`); inList = true; isOrdered = false; }
      const text = trimmed.replace(/^[*-]\s+/, '');
      listItems.push(
        <li key={`li-${i}`} className="pl-1 leading-relaxed text-slate-300">
          <span className="mr-1.5 text-blue-400/70">-</span>
          {parseInline(text)}
        </li>
      );
      return;
    }

    if (numMatch) {
      if (!inList || !isOrdered) { flushList(`ul-${i}`); inList = true; isOrdered = true; }
      listItems.push(
        <li key={`li-${i}`} className="leading-relaxed text-slate-300">
          {parseInline(numMatch[2])}
        </li>
      );
      return;
    }

    // Empty line
    if (trimmed === '') {
      flushList(`ul-${i}`);
      elements.push(<div key={`sp-${i}`} className="h-1.5" />);
      return;
    }

    // Regular paragraph
    flushList(`ul-${i}`);
    elements.push(
      <p key={`p-${i}`} className="mb-1.5 leading-relaxed text-slate-200">
        {parseInline(line)}
      </p>
    );
  });

  flushList('ul-end');
  return <div className={readable ? 'text-base leading-relaxed' : 'text-[13px]'}>{elements}</div>;
};

export const renderMarkdown = (text: string) => <MarkdownText content={text} />;
