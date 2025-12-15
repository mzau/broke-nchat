/**
 * Confidence Evaluation Logic
 * Determines if filenames should be accepted based on context and verification
 */

/**
 * Extension verification: check if filename extension matches block language
 * @param {string} extension - File extension (e.g., "js", "py")
 * @param {string} blockLanguage - Code block language identifier
 * @returns {boolean} - True if extension matches language
 */
window.extensionMatchesLanguage = function(extension, blockLanguage) {
    if (!extension || !blockLanguage) return false;

    const ext = extension.toLowerCase();
    const lang = blockLanguage.toLowerCase();

    const validLanguages = window.EXTENSION_TO_LANGUAGE[ext] || [];
    return validLanguages.includes(lang);
};

/**
 * Evaluate confidence level for a filename based on context
 * @param {Object} token - Filename token with value, extension, hasColon properties
 * @param {Object} context - Context object with afterTermFile, inHeading, inList, expectedFilenames
 * @returns {'HIGH'|'MEDIUM'|'LOW'} - Confidence level (per BNF-GRAMMAR v0.1.3 spec)
 */
window.evaluateConfidence = function(token, context = {}) {
    const { afterTermFile = false, inHeading = false, inList = false, expectedFilenames = [] } = context;
    const basename = token.value.split('/').pop();

    // HIGH CONFIDENCE cases:

    // 1. After TERM_FILE keyword (explicit declaration)
    if (afterTermFile) {
        return 'HIGH';
    }

    // 2. Filename with colon suffix (declarative syntax)
    if (token.hasColon) {
        return 'HIGH';
    }

    // 3. Well-known configuration/manifest files
    if (window.HIGH_CONFIDENCE_FILENAMES.includes(basename)) {
        return 'HIGH';
    }

    // 4. Matches path from detected project structure
    const isInStructure = expectedFilenames.some(expected =>
        expected === token.value || expected.endsWith('/' + token.value)
    );
    if (isInStructure) {
        return 'HIGH';
    }

    // MEDIUM CONFIDENCE cases (per BNF-GRAMMAR v0.1.3):

    // 5. In markdown heading or list (structural markers, but require validation)
    if (inHeading || inList) {
        return 'MEDIUM';
    }

    // Default: LOW CONFIDENCE (requires extension verification)
    return 'LOW';
};

/**
 * Verify filename acceptance based on confidence and extension matching
 * @param {Object} token - Filename token with value, extension, basename properties
 * @param {string} blockLanguage - Code block language
 * @param {Object} context - Context for confidence evaluation
 * @returns {boolean} - True if filename should be accepted
 *
 * NOTE: This function provides basic validation. For full BNF Constraint 3 compliance,
 * use shouldAcceptCandidate() which includes comprehensive whitelist checking.
 */
window.verifyFilename = function(token, blockLanguage, context = {}) {
    const confidence = window.evaluateConfidence(token, context);

    // HIGH CONFIDENCE: Accept (assumes caller will validate extension whitelist)
    if (confidence === 'HIGH') {
        return true;
    }

    // MEDIUM CONFIDENCE: Accept if has valid extension (basic check)
    // Full whitelist validation should be done by shouldAcceptCandidate()
    if (confidence === 'MEDIUM') {
        const hasExtension = !!token.extension;
        const isKnownExt = hasExtension && window.KNOWN_EXTENSIONS.includes(token.extension.toLowerCase());
        const isKnownFilename = window.HIGH_CONFIDENCE_FILENAMES.some(
            known => known.toLowerCase() === token.value.split('/').pop().toLowerCase()
        );
        return isKnownExt || isKnownFilename;
    }

    // LOW CONFIDENCE: Verify extension matches language (strictest check)
    return window.extensionMatchesLanguage(token.extension, blockLanguage);
};
