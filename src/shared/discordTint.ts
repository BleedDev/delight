/**
 * Discord's colour themes (Nitro's client themes) tint most of its colours with the theme's: each
 * colour is a color-mix of Discord's own with --custom-theme-base-color by an amount, and panels get
 * --background-gradient-* images. Discord sets those inline, on whatever element carries the theme.
 *
 * An Evi theme sets the colours it cares about, but anything it doesn't (a dialog's footer, a card
 * deep in some menu) kept the Discord theme's tint: a green footer under a black dialog. While an
 * Evi theme is on, the mix amounts are 0 and the gradients are off, so what the Evi theme leaves out
 * is Discord's plain colour, not the Discord theme's.
 */
const GRADIENTS = ["lowest", "lower", "low", "high", "higher", "highest", "chat", "chat-preview", "app-frame"].map(g => `--background-gradient-${g}`);

export const NEUTRAL_TINT_CSS = `/* Evi: Discord's colour theme stays out of the way of Evi's theme */
:root, .custom-theme-background, [style*="--custom-theme-"] {
    --custom-theme-base-color-amount: 0% !important;
    --custom-theme-text-color-amount: 0% !important;
    --custom-theme-border-color-amount: 0% !important;
${GRADIENTS.map(g => `    ${g}: initial !important;`).join("\n")}
}
`;
