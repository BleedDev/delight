/**
 * Runs in test pages before discord.com's scripts. Discord's login page asks for passkeys, and in a
 * real Chrome on Windows that pops a Windows Hello / security key dialog on the user's desktop, even
 * headless. Tests never log in, so WebAuthn is switched off entirely.
 */
export function disablePasskeys() {
    const refuse = () => Promise.reject(new DOMException("Disabled in tests", "NotAllowedError"));
    try {
        if (navigator.credentials) {
            Object.defineProperty(navigator.credentials, "get", { value: refuse, configurable: true });
            Object.defineProperty(navigator.credentials, "create", { value: refuse, configurable: true });
        }
        const pkc = (window as any).PublicKeyCredential;
        if (pkc) {
            pkc.isConditionalMediationAvailable = () => Promise.resolve(false);
            pkc.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false);
        }
    } catch { }
}
