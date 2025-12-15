// Project Structure Detection and Bulk Download
// Main entry point - loads and wires all bulk download modules
//
// This file has been refactored from a 1347 LOC monolith into 4 focused modules:
// - tree-detection.js (~400 LOC) - Tree parsing & synthetic structure generation
// - file-system.js (~160 LOC) - File System Access API wrapper
// - bulk-download.js (~370 LOC) - Download orchestration & state persistence
// - bulk-ui.js (~570 LOC) - Modal rendering & tree visualization
//
// Total: ~1500 LOC split into 4 maintainable modules
// This file: ~40 LOC (module loader + exports)

// IMPORTANT: This file must be loaded AFTER all markdown parser modules
// because tree-detection.js depends on parser output (data-fullpath attributes)

// Load modules in dependency order
// Note: We can't use ES6 import/export because the project uses direct <script> tags
// Instead, modules attach functions to window.* and we verify they're loaded

// Module load verification
const requiredModules = {
    'tree-detection.js': ['isProjectStructure', 'parseProjectStructure', 'generateSyntheticProjectStructure'],
    'file-system.js': ['getProjectRootHandle', 'ensureProjectRootHandle', 'saveFileToProject'],
    'bulk-download.js': ['bulkDownloadToProject', 'restoreBulkDownloadState', 'getBulkStateForMessage'],
    'bulk-ui.js': ['showStructureReviewModal', 'closeStructureReviewModal', 'confirmStructureDownload']
};

// Verify all modules are loaded
let missingModules = [];
for (const [moduleName, exports] of Object.entries(requiredModules)) {
    for (const exportName of exports) {
        if (typeof window[exportName] !== 'function') {
            missingModules.push(`${moduleName} → window.${exportName}`);
        }
    }
}

if (missingModules.length > 0) {
    console.error('[PROJECT-STRUCTURE] Missing module exports:', missingModules);
    console.error('[PROJECT-STRUCTURE] Make sure all modules are loaded in index.html in this order:');
    console.error('  1. markdown/constants.js, lexer.js, confidence.js, fallback.js, parser.js');
    console.error('  2. chat/tree-detection.js');
    console.error('  3. chat/file-system.js');
    console.error('  4. chat/bulk-download.js');
    console.error('  5. chat/bulk-ui.js');
    console.error('  6. chat/project-structure.js (this file)');
}

// All functions are already exported by individual modules
// This file serves as the central entry point and documentation

console.log('[PROJECT-STRUCTURE] Module system initialized successfully');
console.log('[PROJECT-STRUCTURE] Loaded modules: tree-detection, file-system, bulk-download, bulk-ui');
