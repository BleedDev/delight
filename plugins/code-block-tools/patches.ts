/**
 * Code Block Tools' source patches, pure so tests/codeBlockTools.test.ts can apply them to Discord's
 * code (checked 2026-10-02). What each one hooks is described in index.tsx.
 */
import type { SourcePatch } from "@evi/api";

export const PATCHES = {
    /** Discord's code block: our toolbar, gutter and pretty printed code go first in its container */
    codeBlock: {
        find: 'location:"MarkupReactRules"',
        replace: {
            match: /(codeBlock:\{react\((\i),\i,\i\)\{[^]{0,600}?className:\i\.\i,children:\[)/,
            with: "$1$self?.renderCodeTools?.($2),",
        },
    },
    /** Discord's plaintext file preview: the text it shows, buttons in its footer, word wrap off by default */
    preview: {
        find: '"--custom-plaintext-preview-collapsed-lines"',
        replace: [
            {
                match: /(let\{url:(\i),fileName:(\i),fileSize:\i,fileContents:(\i),[^}]*?bytesLeft:(\i),[^}]*\}=\i,\i=)\4(\?\.split\("\\n"\)[^]*?)(\(0,\i\.jsx\)\(\i,\{language:\i,setLanguage:\i,align:"top"\}\))/,
                with: "$1($4=$self?.useText?.($2,$4)??$4)$6$self?.renderPreviewTools?.({url:$2,fileName:$3,text:$4,bytesLeft:$5})??null,$7",
            },
            {
                match: /(\[\i,\i\]=(\i)\.useState\()!0(\),\[\i,\i\]=\2\.useState\(!0\),\{fileContents:)/,
                with: "$1!$self?.numbersFirst?.()$3",
            },
        ],
    },
    /** The text in a plaintext preview (and its full-screen view): line numbers on its <pre> */
    text: {
        find: 'location:"PlaintextFilePreview"',
        replace: {
            match: /(let\{text:(\i),language:\i,className:(\i)\}=\i,[^]{0,300}?"pre",\{)(children:\(0,\i\.jsx\)\(\i\.\i,\{location:"PlaintextFilePreview")/,
            with: "$1...$self?.preProps?.($2,$3),$4",
        },
    },
} satisfies Record<string, SourcePatch>;
