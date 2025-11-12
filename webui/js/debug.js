// Debug mode state
let debugMode = 'auto';

// Debug toggle functionality
window.toggleDebugView = function() {
    // Check if BROKE cluster is detected
    if (!serverCapabilities || !serverCapabilities.hasDebugEndpoints) {
        console.log('⚠️ Debug mode only available for BROKE Cluster');
        alert('Debug mode is only available when connected to a BROKE Cluster.');
        return;
    }

    const debugControls = document.getElementById('debugControls');
    const rawDebug = document.getElementById('rawDebug');
    const isVisible = debugControls.classList.contains('visible');

    if (isVisible) {
        // Debug Panel wird geschlossen - Reset auf Auto Mode
        setMode('auto');
        resetDebugSettings();
        debugControls.classList.remove('visible');
        rawDebug.classList.remove('visible');
    } else {
        debugControls.classList.add('visible');
        rawDebug.classList.add('visible');
    }
}

// Reset debug settings to defaults
function resetDebugSettings() {
    const complexitySlider = document.getElementById('complexitySlider');
    const modelSelect = document.getElementById('modelSelect');
    
    if (complexitySlider) {
        complexitySlider.value = 0.5;
        updateComplexityValue(0.5);
        complexitySlider.disabled = false;
        complexitySlider.style.opacity = '1';
    }
    
    if (modelSelect) {
        modelSelect.value = 'auto';
        modelSelect.style.borderColor = '#e2e8f0';
        modelSelect.style.backgroundColor = 'white';
    }
}

// Debug mode switching
window.setMode = function(mode) {
    debugMode = mode;
    const autoBtn = document.getElementById('autoMode');
    const manualBtn = document.getElementById('manualMode');
    const manualControls = document.getElementById('manualControls');
    
    if (mode === 'auto') {
        autoBtn.classList.add('active');
        manualBtn.classList.remove('active');
        manualControls.style.display = 'none';
    } else {
        autoBtn.classList.remove('active');
        manualBtn.classList.add('active');
        manualControls.style.display = 'block';
    }
}

// Model selection change handler
window.onModelSelectChange = function() {
    const modelSelect = document.getElementById('modelSelect');
    const complexitySlider = document.getElementById('complexitySlider');
    
    if (modelSelect.value !== 'auto') {
        // Model manually selected - show visual feedback
        modelSelect.style.borderColor = '#48bb78';
        modelSelect.style.backgroundColor = '#f0fff4';
        // Disable complexity slider when model is manually selected
        complexitySlider.disabled = true;
        complexitySlider.style.opacity = '0.5';
    } else {
        // Auto mode - re-enable complexity slider
        modelSelect.style.borderColor = '#e2e8f0';
        modelSelect.style.backgroundColor = 'white';
        complexitySlider.disabled = false;
        complexitySlider.style.opacity = '1';
    }
}

// Complexity value update
window.updateComplexityValue = function(value) {
    const complexity = parseFloat(value);
    let tier = 'Fast';
    if (complexity >= 0.85) tier = 'Premium';
    else if (complexity >= 0.4) tier = 'Balanced';
    
    document.getElementById('complexityValue').textContent = `${tier} (${complexity.toFixed(2)})`;
}

// Load and populate model dropdown
async function populateModelDropdown() {
    const modelData = await loadAvailableModels();
    if (!modelData) {
        // Hide manual model selection if no models available
        const manualControls = document.getElementById('manualControls');
        if (manualControls) {
            const modelSelectGroup = manualControls.querySelector('.model-select-group');
            if (modelSelectGroup) {
                modelSelectGroup.style.display = 'none';
            }
        }
        return;
    }
    
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;
    
    // Clear existing options (except Auto)
    const autoOption = modelSelect.querySelector('option[value="auto"]');
    modelSelect.innerHTML = '';
    modelSelect.appendChild(autoOption);
    
    // Add models grouped by tier
    const tiers = ['fast', 'balanced', 'premium'];
    tiers.forEach(tier => {
        if (modelData.models_by_tier[tier] && modelData.models_by_tier[tier].length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${tier.charAt(0).toUpperCase() + tier.slice(1)} Tier`;
            
            modelData.models_by_tier[tier].forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                // Simplify display name for MLX models
                const displayName = model.replace('mlx-community/', '');
                option.textContent = displayName;
                optgroup.appendChild(option);
            });
            
            modelSelect.appendChild(optgroup);
        }
    });
    
    // If only one tier has models (typical for MLX Knife), don't use optgroups
    const hasMultipleTiers = tiers.filter(tier => 
        modelData.models_by_tier[tier] && modelData.models_by_tier[tier].length > 0
    ).length > 1;
    
    if (!hasMultipleTiers && modelData.models && modelData.models.length > 0) {
        // Just add models directly without tier grouping
        modelSelect.innerHTML = '';
        modelSelect.appendChild(autoOption);
        
        modelData.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            const displayName = model.replace('mlx-community/', '');
            option.textContent = displayName;
            modelSelect.appendChild(option);
        });
    }
}

// Initialize debug functionality
window.initializeDebug = async function() {
    console.log('🔧 initializeDebug called with capabilities:', serverCapabilities);
    
    // Check if debug features should be shown
    const hasDebugFeatures = serverCapabilities.hasComplexityEndpoint || 
                            serverCapabilities.hasModelsDebugEndpoint;
    
    console.log('🔧 hasDebugFeatures:', hasDebugFeatures, '(hasComplexityEndpoint:', serverCapabilities.hasComplexityEndpoint, ', hasModelsDebugEndpoint:', serverCapabilities.hasModelsDebugEndpoint, ')');
    
    if (!hasDebugFeatures) {
        console.log('❌ initializeDebug: Hiding debug button - no debug features');
        // Hide debug button if no debug features available
        const debugButton = document.querySelector('button[onclick="toggleDebugView()"]');
        if (debugButton) {
            debugButton.style.display = 'none';
            console.log('🚫 Debug button hidden');
        }
        return;
    }
    
    console.log('✅ initializeDebug: Debug features available - keeping debug button visible');
    
    // Load available models for manual selection if any model endpoint exists
    if (serverCapabilities.hasModelsDebugEndpoint || serverCapabilities.hasStandardModelsEndpoint) {
        populateModelDropdown();
    }
}