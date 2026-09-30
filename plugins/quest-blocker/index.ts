import { definePlugin } from "@evi/api";

/**
 * Discord asks one hook whether to show the quest bar above the user panel (the popup at the bottom
 * left). Checked 2026-09-30, it reads:
 *     let{quest:t}=e, ...hooks...; if(null==t)return{isQuestBarVisible:!1,reason:"quest_is_null"};
 * We take that early return every time, after Discord's hooks have run so their order never changes.
 * The panel's "quest bar open" styling reads the same hook, so it goes too. Turned off, $self is gone
 * and Discord decides as before.
 */
export default definePlugin({
    patches: [
        {
            find: 'reason:"quest_is_null"',
            replace: {
                match: /if\(null==(\i)\)(?=return\{isQuestBarVisible:!1,reason:"quest_is_null"\})/,
                with: "if($self?.blocked?.()||null==$1)",
            },
        },
    ],
    blocked: () => true,
});
