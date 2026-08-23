export const cleanViteId = (id: string) => id.split('?')[0].replace(/\\/g, '/');

export const hasAny = (source: string, markers: string[]) => markers.some((marker) => source.includes(marker));
