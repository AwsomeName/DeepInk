const GERBER_EXTENSIONS = new Set([
  '.gbr',
  '.ger',
  '.gko',
  '.gml',
  '.gmb',
  '.gpb',
  '.gtl',
  '.gbl',
  '.gts',
  '.gbs',
  '.gto',
  '.gbo',
  '.gtp',
  '.gbp',
  '.gp1',
  '.gp2',
  '.drl',
  '.xln',
])

export function isGerberFileExtension(extension?: string): boolean {
  const normalized = (extension ?? '').toLowerCase()
  return GERBER_EXTENSIONS.has(normalized) || /^\.gm\d+$/.test(normalized)
}
