/**
 * Duplicate Android Resources Checker
 *
 * Verifies that no single Android res qualifier directory contains two or more
 * files that compile to the same resource name (e.g., splash.png and splash.xml
 * inside the same drawable folder), which causes AAPT2 "Duplicate resources" build errors.
 */

const fs = require('fs');
const path = require('path');

function checkDuplicateResources(resDirPath) {
  const resolvedPath = path.resolve(resDirPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Android res directory not found at: ${resolvedPath}`);
  }

  const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
  const errors = [];
  let checkedFolders = 0;
  let checkedFiles = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    checkedFolders++;

    const subDirPath = path.join(resolvedPath, entry.name);
    const files = fs.readdirSync(subDirPath, { withFileTypes: true });
    const resourceMap = new Map();

    for (const file of files) {
      if (!file.isFile()) continue;
      checkedFiles++;

      // In Android, resource name is the base name without extension
      // E.g. "splash.png" -> "splash", "splash.xml" -> "splash"
      const parsed = path.parse(file.name);
      const resName = parsed.name.toLowerCase();

      if (resourceMap.has(resName)) {
        const existing = resourceMap.get(resName);
        errors.push(
          `Duplicate resource found in '${entry.name}': '${existing}' and '${file.name}' both compile to resource name '@${entry.name.split('-')[0]}/${resName}'`
        );
      } else {
        resourceMap.set(resName, file.name);
      }
    }
  }

  return {
    checkedFolders,
    checkedFiles,
    errors,
  };
}

function run() {
  const defaultResDir = path.resolve(__dirname, '../android/app/src/main/res');
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultResDir;

  console.log(`[check-duplicate-resources] Scanning: ${targetDir}`);
  const result = checkDuplicateResources(targetDir);
  console.log(`[check-duplicate-resources] Checked ${result.checkedFiles} files across ${result.checkedFolders} resource folders.`);

  if (result.errors.length > 0) {
    console.error(`\n[check-duplicate-resources] FAILED with ${result.errors.length} duplicate resource conflict(s):`);
    result.errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('[check-duplicate-resources] PASSED: Exactly one unique resource per name in every res folder.');
}

if (require.main === module) {
  run();
}

module.exports = { checkDuplicateResources };
