/**
 * Breadth-first search through a React element tree (or any nested object), following only the
 * given keys. Handy in `after` hooks on components to find the element you want to change.
 */
export function findInTree<T = any>(
    tree: unknown,
    predicate: (node: any) => boolean,
    { walk = ["props", "children"], maxNodes = 5000 }: { walk?: string[]; maxNodes?: number; } = {},
): T | undefined {
    const queue: unknown[] = [tree];
    let visited = 0;

    while (queue.length && visited++ < maxNodes) {
        const node = queue.shift();
        if (node == null || typeof node !== "object") continue;

        if (Array.isArray(node)) {
            queue.push(...node);
            continue;
        }
        try {
            if (predicate(node)) return node as T;
        } catch { }
        for (const key of walk) {
            if (key in node) queue.push((node as any)[key]);
        }
    }
}
