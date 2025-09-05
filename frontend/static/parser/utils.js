export function sliceStr(s, start, stop) {
    stop = stop ?? start;
    return s.substring(start - 1, stop).trim();
}

export function resCompare(a, b) {
    a = a.toString();
    b = b.toString();
    if (a === b) return 0;
    const numA = parseInt(a.match(/\d+/) || 0, 10);
    const numB = parseInt(b.match(/\d+/) || 0, 10);
    if (numA !== numB) return numA - numB;
    const chrA = a.replace(/\d+/g, '').charCodeAt(0) || 0;
    const chrB = b.replace(/\d+/g, '').charCodeAt(0) || 0;
    return chrA - chrB;
}

export function mark(breaks, rid, pos, type) {
    if (!breaks.has(rid)) breaks.set(rid, {start: null, end: null});
    breaks.get(rid)[pos] = type;
}