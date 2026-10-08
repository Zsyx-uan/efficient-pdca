import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X, BookOpen, Plus } from 'lucide-react';
let modalCount = 0;
let previousOverflow = '';
export function Dialog({ title, children, onClose, dirty = false, wide = false }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    dirty?: boolean;
    wide?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null), titleId = useId();
    const close = () => {
        if (!dirty || window.confirm('尚有未保存的修改。草稿会保留，确定关闭？'))
            onClose();
    };
    useEffect(() => {
        const element = ref.current;
        if (element && !element.open) element.showModal();
        if (modalCount++ === 0) { previousOverflow = document.documentElement.style.overflowY; document.documentElement.style.overflowY = 'hidden'; }
        return () => { element?.close(); if (--modalCount === 0) document.documentElement.style.overflowY = previousOverflow; };
    }, []);
    return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
            if (event.target === event.currentTarget) {
                const r = event.currentTarget.getBoundingClientRect();
                if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
                    close();
            }
        }}>
    <header className="dialog-head">
    <div>
    <p className="eyebrow">KNOWLEDGE GARDEN</p>
    <h2 id={titleId}>{title}</h2>
    </div>
    <button type="button" className="icon-button" aria-label={`关闭${title}`} onClick={close}>
    <X size={20}/>
    </button>
    </header>{children}</dialog>;
}
export function Empty({ title, detail, action, onAction }: {
    title: string;
    detail: string;
    action?: string;
    onAction?: () => void;
}) {
    return <div className="empty-state">
    <BookOpen size={30}/>
    <h3>{title}</h3>
    <p>{detail}</p>{action && <button className="primary-button" onClick={onAction}>
        <Plus size={16}/>{action}</button>}</div>;
}
export function PageHeading({ eyebrow, title, detail, children }: {
    eyebrow: string;
    title: string;
    detail: string;
    children?: ReactNode;
}) {
    return <header className="page-heading">
    <div>
    <p className="eyebrow">{eyebrow}</p>
    <h1>{title}</h1>
    <p>{detail}</p>
    </div>{children}</header>;
}
function safeUrl(url: string) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.href : undefined;
    }
    catch {
        return undefined;
    }
}
function Inline({ text }: {
    text: string;
}) {
    const pieces = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g);
    return <>{pieces.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**'))
                return <strong key={index}>{part.slice(2, -2)}</strong>;
            if (part.startsWith('`') && part.endsWith('`'))
                return <code key={index}>{part.slice(1, -1)}</code>;
            const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (link) {
                const href = safeUrl(link[2]);
                return href ? <a key={index} href={href} target="_blank" rel="noreferrer noopener">{link[1]}</a> : <span key={index}>{link[1]}</span>;
            }
            if (part.startsWith('*') && part.endsWith('*'))
                return <em key={index}>{part.slice(1, -1)}</em>;
            return part;
        })}</>;
}
export function Markdown({ content }: {
    content: string;
}) {
    const lines = content.replace(/\r\n?/g, '\n').split('\n'), nodes: ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (/^```/.test(line)) {
            const language = line.slice(3), code: string[] = [];
            i++;
            while (i < lines.length && !/^```/.test(lines[i]))
                code.push(lines[i++]);
            nodes.push(<pre key={i}>
            <small>{language}</small>
            <code>{code.join('\n')}</code>
            </pre>);
            i++;
            continue;
        }
        if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-+/.test(lines[i + 1] ?? '')) {
            const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            const head = cells(line), rows: string[][] = [];
            i += 2;
            while (i < lines.length && /^\s*\|/.test(lines[i]))
                rows.push(cells(lines[i++]));
            nodes.push(<div className="table-scroll" key={i}>
            <table>
            <thead>
            <tr>{head.map((c, k) => <th key={k}>
                <Inline text={c}/>
                </th>)}</tr>
            </thead>
            <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>
                    <Inline text={c}/>
                    </td>)}</tr>)}</tbody>
            </table>
            </div>);
            continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            const Level = `h${Math.min(6, Math.max(3, heading[1].length))}` as 'h3' | 'h4' | 'h5' | 'h6';
            nodes.push(<Level key={i}>
            <Inline text={heading[2]}/>
            </Level>);
            i++;
            continue;
        }
        if (/^[-*+]\s+|^\d+[.、]\s+/.test(line)) {
            const ordered = /^\d/.test(line), items: string[] = [];
            const pattern = ordered ? /^\d+[.、]\s+/ : /^[-*+]\s+/;
            while (i < lines.length && pattern.test(lines[i]))
                items.push(lines[i++].replace(pattern, ''));
            const List = ordered ? 'ol' : 'ul';
            nodes.push(<List key={i}>{items.map((item, k) => <li key={k}>
                <Inline text={item}/>
                </li>)}</List>);
            continue;
        }
        if (/^>\s?/.test(line))
            nodes.push(<blockquote key={i}>
            <Inline text={line.replace(/^>\s?/, '')}/>
            </blockquote>);
        else if (/^---+$/.test(line.trim()))
            nodes.push(<hr key={i}/>);
        else if (line.trim()) {
            const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
            if (image) {
                const href = safeUrl(image[2]);
                nodes.push(<p key={i}>{href ? <a href={href} rel="noreferrer noopener" target="_blank">查看外部图片：{image[1] || '图片'} ↗</a> : '图片地址不可用'}</p>);
            }
            else
                nodes.push(<p key={i}>
                <Inline text={line}/>
                </p>);
        }
        i++;
    }
    return <div className="markdown-content">{nodes}</div>;
}
