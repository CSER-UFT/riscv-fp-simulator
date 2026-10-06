/** Gerador pseudoaleatório com semente (mulberry32): a mesma semente dá a mesma sequência em [0, 1). */
export function rng(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
