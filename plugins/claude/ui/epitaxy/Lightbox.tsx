// In-app image viewer: click an image in the transcript, a tool result or the composer.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePortal } from "../cds/shadow";
import { Button } from "../cds/Button";

export function useLightbox() {
    const [src, setSrc] = useState<string | null>(null);
    const portal = usePortal();
    useEffect(() => {
        if (!src) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setSrc(null));
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [src]);
    const view =
        src && portal
            ? createPortal(
                  <div
                      role="dialog"
                      aria-modal="true"
                      aria-label="Image"
                      className="fixed inset-0 grid place-items-center animate-lightbox-backdrop-in"
                      style={{ zIndex: 1000, background: "rgba(0,0,0,.7)" }}
                      onClick={() => setSrc(null)}
                  >
                      <img
                          src={src}
                          alt=""
                          className="object-contain rounded-lg shadow-panel animate-lightbox-content-in"
                          style={{ maxWidth: "92%", maxHeight: "88%" }}
                          onClick={e => e.stopPropagation()}
                      />
                      <div className="absolute" style={{ top: 16, right: 16 }}>
                          <Button iconOnly icon="X" variant="secondary" aria-label="Close" onClick={() => setSrc(null)} />
                      </div>
                  </div>,
                  portal,
              )
            : null;
    return [view, setSrc] as const;
}
