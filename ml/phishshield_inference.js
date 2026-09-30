/**
 * PhishShield - Browser ML Inference Engine (Step 4B)
 *
 * Runs local, client-side inference using ONNX Runtime Web and the trained
 * Logistic Regression model (models/phishshield_model.onnx).
 *
 * Zero external network calls, zero remote telemetry, 100% local in-browser execution.
 */

// Exact 26-feature sequence matching ml/model_features.json and content.js
const ML_FEATURE_NAMES = [
    "urlLength",
    "hostnameLength",
    "pathLength",
    "dotCount",
    "digitCount",
    "specialCharCount",
    "hyphenCount",
    "hasExcessiveHyphens",
    "subdomainCount",
    "hasHttps",
    "isIpAddress",
    "isPrivateIp",
    "hasPort",
    "hasSuspiciousPort",
    "hasLogin",
    "hasVerify",
    "hasAccount",
    "hasPassword",
    "hasReset",
    "hasSecure",
    "keywordCount",
    "hasAtSymbol",
    "atCount",
    "hasUrlEncoding",
    "urlEncodingCount",
    "hasSuspiciousTLD"
];

// Session cache to prevent reloading the model on every URL
let mlSession = null;
let mlSessionPromise = null;
let mlInitializationFailed = false;

/**
 * Initializes and caches the ONNX Runtime Web InferenceSession.
 * Configured for single-threaded local WebAssembly execution in Manifest V3.
 *
 * @returns {Promise<ort.InferenceSession|null>} The loaded session, or null if initialization fails.
 */
async function initMLSession() {
    if (mlSession) {
        return mlSession;
    }

    if (mlInitializationFailed) {
        return null;
    }

    if (mlSessionPromise) {
        return mlSessionPromise;
    }

    mlSessionPromise = (async () => {
        try {
            // Verify ONNX Runtime is present in global scope
            if (typeof ort === "undefined") {
                console.warn("PhishShield ML: ONNX Runtime (ort) is not defined. Falling back to rule-based scanning.");
                mlInitializationFailed = true;
                return null;
            }

            // Configure local WebAssembly runtime paths within extension
            if (ort.env && ort.env.wasm) {
                // Ensure ONNX runtime resolves wasm binaries locally without CDN requests
                const libUrl = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
                    ? chrome.runtime.getURL("lib/")
                    : "lib/";
                ort.env.wasm.wasmPaths = libUrl;
                // Single-thread execution ensures compatibility across all pages without SharedArrayBuffer / COOP headers
                ort.env.wasm.numThreads = 1;
            }

            const modelUrl = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
                ? chrome.runtime.getURL("models/phishshield_model.onnx")
                : "models/phishshield_model.onnx";
            console.log("PhishShield ML: Loading ONNX model from:", modelUrl);

            // Create ONNX inference session
            const session = await ort.InferenceSession.create(modelUrl, {
                executionProviders: ["wasm"],
                graphOptimizationLevel: "all"
            });

            mlSession = session;
            console.log("PhishShield ML: Logistic Regression ONNX session successfully initialized");
            return mlSession;
        } catch (err) {
            console.error("PhishShield ML: Failed to initialize ONNX model session. Continuing with rule-based detection only.", err);
            mlInitializationFailed = true;
            mlSession = null;
            return null;
        } finally {
            mlSessionPromise = null;
        }
    })();

    return mlSessionPromise;
}

/**
 * Executes local ML phishing inference for a single URL using the cached ONNX model.
 *
 * @param {string} url - Target URL to analyze
 * @returns {Promise<{
 *   prediction: number,
 *   legitimateProbability: number,
 *   phishingProbability: number,
 *   mlScore: number
 * }|null>} Prediction result object, or null if ML is unavailable
 */
async function predictWithML(url) {
    if (!url || typeof url !== "string") {
        return null;
    }

    try {
        const session = await initMLSession();
        if (!session) {
            return null;
        }

        // Feature extraction must use existing extractFeatures from content.js for parity
        if (typeof extractFeatures !== "function") {
            console.warn("PhishShield ML: extractFeatures function not found in scope.");
            return null;
        }

        const features = extractFeatures(url);

        // Build 26-value Float32Array in exact model feature order
        const vectorValues = new Float32Array(ML_FEATURE_NAMES.length);
        for (let i = 0; i < ML_FEATURE_NAMES.length; i++) {
            const featName = ML_FEATURE_NAMES[i];
            const val = features[featName];
            vectorValues[i] = typeof val === "number" ? val : 0;
        }

        // Prepare ONNX tensor of shape [1, 26]
        const inputName = (session.inputNames && session.inputNames[0]) || "float_input";
        const inputTensor = new ort.Tensor("float32", vectorValues, [1, ML_FEATURE_NAMES.length]);
        const feeds = { [inputName]: inputTensor };

        // Execute inference
        const results = await session.run(feeds);

        // Extract class and probabilities
        const labelName = (session.outputNames && session.outputNames[0]) || "label";
        const probName = (session.outputNames && session.outputNames[1]) || "probabilities";

        const labelTensor = results[labelName];
        const probTensor = results[probName];

        const predictedClass = (labelTensor && labelTensor.data) ? Number(labelTensor.data[0]) : 0;

        let legitProb = 0.5;
        let phishProb = 0.5;

        if (probTensor && probTensor.data && probTensor.data.length >= 2) {
            legitProb = Number(probTensor.data[0]);
            phishProb = Number(probTensor.data[1]);
        }

        const mlScore = phishProb * 100;

        return {
            prediction: predictedClass,
            legitimateProbability: legitProb,
            phishingProbability: phishProb,
            mlScore: mlScore
        };
    } catch (err) {
        console.error("PhishShield ML: Inference error for URL:", url, err);
        return null;
    }
}
