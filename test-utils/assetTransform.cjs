/**
 * Jest transformer for static asset imports (images, audio, stylesheets).
 *
 * Returns a CommonJS module whose default export is the source file path.
 * This keeps each imported asset distinct (so React keys derived from asset
 * URLs stay unique) without requiring Jest to actually parse the binary.
 */
module.exports = {
  process(_sourceText, sourcePath) {
    return { code: `module.exports = ${JSON.stringify(sourcePath)};` }
  },
  getCacheKey(_sourceText, sourcePath) {
    return sourcePath
  },
}
