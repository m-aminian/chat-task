import { useMemo } from "react";
import { renderMarkdown } from "../markdown/render";
import { looksLikeMarkdown } from "../utils/text";

interface Props {
  body: string;
  prefix?: string;
}

export function MessageBody({ body, prefix }: Props) {
  const markdown = looksLikeMarkdown(body);
  const html = useMemo(() => (markdown ? renderMarkdown(body) : ""), [markdown, body]);
  if (!markdown) {
    return (
      <p className="body body--plain">
        {prefix ? <span className="body__prefix">{prefix} </span> : null}
        {body}
      </p>
    );
  }
  return (
    <div className="body body--markdown">
      {prefix ? <span className="body__prefix">{prefix} </span> : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
