/**
 * Code with @evi/api's names marked: hovering or focusing `findByProps`, `ctx.hookExport` or `$self`
 * shows its signature and summary (shared/apiDocs.ts). Used in Patch Helper's code views.
 */
import { ApiDoc, highlightApi } from "@shared/apiDocs";

import { React } from "../webpack/common";
import { Tooltip } from "./components";

/** What the tooltip says: the signature, then the summary */
export const apiTooltip = (doc: ApiDoc) => doc.doc ? `${doc.signature}\n\n${doc.doc}` : doc.signature;

function ApiName({ text, doc }: { text: string; doc: ApiDoc; }) {
    return (
        <Tooltip text={apiTooltip(doc)}>
            <span className="dl-api-name" tabIndex={0} aria-label={`${text}: ${doc.signature}. ${doc.doc}`.trim()}>{text}</span>
        </Tooltip>
    );
}

/** `text` as is, with every known API name in it marked */
export function ApiText({ text }: { text: string; }) {
    const segments = React.useMemo(() => highlightApi(text), [text]);
    return <>{segments.map((s, i) => s.doc ? <ApiName key={i} text={s.text} doc={s.doc} /> : s.text)}</>;
}
