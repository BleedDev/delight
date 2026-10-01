import { expect, test } from "bun:test";

import { NEUTRAL_TINT_CSS } from "../src/shared/discordTint";

test("an Evi theme turns Discord's colour theme tint and gradients off, over Discord's inline styles", () => {
    expect(NEUTRAL_TINT_CSS).toContain('[style*="--custom-theme-"]');
    for (const v of ["--custom-theme-base-color-amount: 0% !important;", "--custom-theme-text-color-amount: 0% !important;", "--background-gradient-chat: initial !important;"]) {
        expect(NEUTRAL_TINT_CSS).toContain(v);
    }
});
