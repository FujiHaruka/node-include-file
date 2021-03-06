const fs = require('fs').promises
const path = require('path')
const { EOL } = require('os')

const parseIncludePaths = (content) =>
  [...content.matchAll(/^\$include\s+(.+)/gm)].map(([, filePath]) => filePath)
const escapeIncludePaths = (content) =>
  content.replace(/^\$\$include\s/gm, '$include ')

const replaceInclusions = (content, inclusions) => {
  let replaced = content
  for (const { includePath, content } of inclusions) {
    const pattern = new RegExp(`^\\$include\\s+${includePath}${EOL}?`, 'gm')
    replaced = replaced.replace(pattern, content)
  }
  return replaced
}

const includeRecursively = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf-8')
  const includePaths = parseIncludePaths(content)
  const baseDir = path.dirname(path.resolve(filePath))
  let inclusions
  inclusions = await Promise.all(
    includePaths.map((includePath) =>
      includeRecursively(path.join(baseDir, includePath))
        .then((content) => ({
          includePath,
          content,
        }))
        .catch((e) => {
          e.includeFailed = true
          e.messages = (e.messages || []).concat(
            `  at "$include ${includePath}" in ${path.relative(
              process.cwd(),
              filePath,
            )}`,
          )
          throw e
        }),
    ),
  )
  const replaced = replaceInclusions(content, inclusions)
  const result = escapeIncludePaths(replaced)
  return result
}

/**
 * Resolve `$include` and build a file content.
 * @param {string} entryPath - the entrypoint file path
 */
async function includeFile(entryPath) {
  let result
  try {
    result = await includeRecursively(entryPath)
  } catch (e) {
    if (e.includeFailed) {
      e.message = [
        `Faield to include a file;\n${e.message}`,
        ...e.messages,
      ].join(EOL)
    }
    throw e
  }
  return result
}

module.exports = includeFile
