const API = "http://127.0.0.1:5000";

// ============================
// SERVER STATUS CHECK
// ============================
async function checkServer() {
  const dot = document.getElementById("serverDot");
  const label = document.getElementById("serverLabel");
  try {
    const res = await fetch(`${API}/cv`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      dot.className = "dot online";
      label.textContent = "Server online ✓";
      return true;
    }
  } catch (_) {}
  dot.className = "dot offline";
  label.textContent = "Server offline — iniciá INICIAR_SERVIDOR.bat";
  return false;
}

// ============================
// UTILS
// ============================
function setStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = type;
}

function setProgress(pct) {
  const bar = document.getElementById("progressBar");
  const fill = document.getElementById("progressFill");
  bar.style.display = pct > 0 ? "block" : "none";
  fill.style.width = `${pct}%`;
}

function getLanguage() {
  return document.getElementById("language").value;
}

// ============================
// FILL FORM
// ============================
document.getElementById("fillBtn").addEventListener("click", async () => {
  const online = await checkServer();
  if (!online) return;

  const btn = document.getElementById("fillBtn");
  btn.disabled = true;
  setProgress(5);
  setStatus("Buscando campos en la página...", "working");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 1. Scan all fields (including iframes)
    const scanResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanFields
    });

    const fields = scanResult[0].result;
    setStatus(`${fields.length} campos encontrados`, "working");

    if (fields.length === 0) {
      setStatus("❌ No se encontraron campos. Puede ser un iframe protegido.", "error");
      setProgress(0);
      btn.disabled = false;
      return;
    }

    const language = getLanguage();

    // Experience context tracking
    // companyCount: how many "company" fields seen so far → determines which job block we're on
    let companyCount = 0;       // increments each time we see a new "company" field
    let currentExpIdx = 0;      // the index of the current experience block
    let inExpContext = false;   // true once we've entered an experience block
    let descriptionCount = 0;  // for multiple description fields

    // 2. For each field: interpret → get value → fill
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const pct = 10 + Math.round((i / fields.length) * 85);
      setProgress(pct);
      setStatus(`Llenando (${i + 1}/${fields.length}): ${field.label || "campo"}`, "working");

      try {
        // Interpret field type
        const interpRes = await fetch(`${API}/interpret`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: field.label, context: field.context })
        });
        const { type } = await interpRes.json();

        if (type === "unknown") continue;

        // ---- Experience context tracking ----
        // When we see a "company" field, we've entered a new experience block.
        // The FIRST company field → experience[0], second → experience[1], etc.
        if (type === "company") {
          currentExpIdx = companyCount;
          companyCount++;
          inExpContext = true;
          descriptionCount = 0;
        }

        // If we see job_title/start_date/end_date/experience_description/location
        // while inExpContext=true, they belong to the current experience block.
        // For location: use experience location if we're inside an experience block.
        let resolvedType = type;
        if (type === "location" && inExpContext) {
          resolvedType = "experience_location";
        }
        if (type === "experience_description") {
          descriptionCount++;
        }

        // Get value from API
        const valueRes = await fetch(`${API}/value`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: resolvedType,
            field: field.label,
            language,
            experience_index: currentExpIdx
          })
        });
        const { value } = await valueRes.json();

        if (value === null || value === undefined || value === "") continue;
        if (value === false && type !== "currently_working") continue;

        // Fill the field in the page
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: fillField,
          args: [field.index, field.iframeIndex, field.inputType, value]
        });

      } catch (e) {
        console.warn("Error en campo", field.label, e);
      }
    }

    setProgress(100);
    setStatus(`✓ ¡Listo! ${fields.length} campos procesados`, "success");
    setTimeout(() => { setProgress(0); setStatus("Ready"); }, 5000);

  } catch (err) {
    setStatus("Error: " + err.message, "error");
    setProgress(0);
    console.error(err);
  }

  btn.disabled = false;
});


// ============================
// COVER LETTER BUTTON
// ============================
document.getElementById("coverBtn").addEventListener("click", async () => {
  const online = await checkServer();
  if (!online) return;

  setStatus("Generando cover letter...", "working");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const textResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText.slice(0, 3000)
  });

  const pageText = textResult[0].result || "";
  const language = getLanguage();

  try {
    const res = await fetch(`${API}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `Write a cover letter for this job posting:\n\n${pageText}`,
        language
      })
    });
    const { response } = await res.json();
    await navigator.clipboard.writeText(response);
    setStatus("✓ Cover letter copiada al portapapeles!", "success");
    setTimeout(() => setStatus("Ready"), 5000);
  } catch (e) {
    setStatus("Error generando cover letter", "error");
  }
});


// ============================
// ANALYZE JOB BUTTON
// ============================
document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const online = await checkServer();
  if (!online) return;

  setStatus("Analizando oferta...", "working");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const textResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText.slice(0, 3000)
  });

  const pageText = textResult[0].result || "";
  const language = getLanguage();

  try {
    const res = await fetch(`${API}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `Analyze this job offer and give a strategic breakdown for Pedro's application:
1. Key requirements
2. Most relevant parts of Pedro's profile
3. Skills to highlight
4. Potential gaps
5. Suggested positioning
6. Recommended tone

Job posting:
${pageText}`,
        language
      })
    });
    const { response } = await res.json();
    await navigator.clipboard.writeText(response);
    setStatus("✓ Análisis copiado al portapapeles!", "success");
    setTimeout(() => setStatus("Ready"), 5000);
  } catch (e) {
    setStatus("Error analizando oferta", "error");
  }
});


// On popup open: check server & save language preference
checkServer();

const savedLang = localStorage.getItem("jobAgentLang");
if (savedLang) document.getElementById("language").value = savedLang;
document.getElementById("language").addEventListener("change", e => {
  localStorage.setItem("jobAgentLang", e.target.value);
});


// ============================================================
// PAGE FUNCTIONS — injected into the tab via executeScript
// These run in the PAGE context, not the extension context.
// ============================================================

/**
 * Scan all form fields in the page, including same-origin iframes.
 * Returns an array of field descriptors.
 */
function scanFields() {
  const results = [];

  function getLabel(el) {
    // 1. aria-label
    let label = el.getAttribute("aria-label") || "";

    // 2. aria-labelledby
    if (!label && el.getAttribute("aria-labelledby")) {
      const ids = el.getAttribute("aria-labelledby").split(" ");
      label = ids.map(id => {
        const el2 = document.getElementById(id);
        return el2 ? el2.innerText : "";
      }).join(" ");
    }

    // 3. <label for="id">
    if (!label && el.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl) label = labelEl.innerText;
    }

    // 4. placeholder
    if (!label && el.placeholder) label = el.placeholder;

    // 5. name attribute (humanized)
    if (!label && el.name) label = el.name.replace(/[_\-\.]/g, " ");

    // 6. Previous sibling label-like element
    if (!label) {
      let prev = el.previousElementSibling;
      while (prev) {
        const tag = prev.tagName.toLowerCase();
        if (tag === "label" || tag === "span" || tag === "p" || tag === "div") {
          const txt = prev.innerText.trim();
          if (txt.length > 0 && txt.length < 100) { label = txt; break; }
        }
        prev = prev.previousElementSibling;
      }
    }

    // 7. Parent or ancestor label
    if (!label) {
      let parent = el.parentElement;
      for (let depth = 0; depth < 4 && parent; depth++) {
        const labelEl = parent.querySelector("label");
        if (labelEl && labelEl.innerText.trim()) { label = labelEl.innerText.trim(); break; }
        parent = parent.parentElement;
      }
    }

    return label.replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function getContext(el) {
    try {
      // Walk up to find a meaningful container (fieldset, form-group, etc.)
      const container = el.closest(
        "fieldset, [class*='group'], [class*='field'], [class*='form'], [class*='row'], [class*='section'], li, tr"
      ) || el.parentElement;
      if (container) return container.innerText.replace(/\s+/g, " ").trim().slice(0, 200);
    } catch (_) {}
    return "";
  }

  const SELECTOR = [
    'input:not([type="hidden"])',
    'input:not([type="submit"])',
    'input:not([type="button"])',
    'input:not([type="reset"])',
    'input:not([type="image"])',
    'textarea',
    'select'
  ].join(", ");

  // Actually build a clean selector
  const CLEAN_SELECTOR =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select';

  function scanDoc(doc, iframeIndex) {
    let elements;
    try {
      elements = doc.querySelectorAll(CLEAN_SELECTOR);
    } catch (e) {
      return;
    }

    elements.forEach((el, index) => {
      // Skip invisible elements
      try {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;
      } catch (_) {}

      const label = getLabel(el) || "unknown";
      const context = getContext(el);
      const inputType = el.getAttribute("type") || el.tagName.toLowerCase();

      results.push({
        index,
        iframeIndex,   // -1 = main doc, 0+ = iframe index
        label,
        context,
        inputType
      });
    });
  }

  // Scan main document
  scanDoc(document, -1);

  // Scan iframes (same-origin only — cross-origin blocked by browser)
  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((iframe, fi) => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) scanDoc(iframeDoc, fi);
    } catch (e) {
      // Cross-origin iframe — can't access, skip silently
    }
  });

  return results;
}


/**
 * Fill a single form field.
 * iframeIndex: -1 = main doc, 0+ = iframe index
 */
function fillField(elementIndex, iframeIndex, inputType, value) {

  // Get the right document
  let doc = document;
  if (iframeIndex >= 0) {
    try {
      const iframes = document.querySelectorAll("iframe");
      const iframe = iframes[iframeIndex];
      doc = iframe.contentDocument || iframe.contentWindow.document;
    } catch (e) {
      return;
    }
  }

  const CLEAN_SELECTOR =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select';

  const elements = doc.querySelectorAll(CLEAN_SELECTOR);
  const el = elements[elementIndex];
  if (!el) return;

  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute("type") || "").toLowerCase();

  // ---- CHECKBOX ----
  if (type === "checkbox") {
    const shouldCheck = value === true || value === "true" || value === "yes" || value === "sí";
    if (el.checked !== shouldCheck) el.click();
    return;
  }

  // ---- RADIO ----
  if (type === "radio") {
    const labelText = (el.parentElement?.innerText || "").toLowerCase();
    const valueStr = String(value).toLowerCase();
    if (labelText.includes(valueStr)) el.click();
    return;
  }

  // ---- SELECT (dropdown) ----
  if (tag === "select") {
    const strVal = String(value).toLowerCase();
    for (const opt of el.options) {
      if (
        opt.text.toLowerCase().includes(strVal) ||
        opt.value.toLowerCase().includes(strVal)
      ) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
    return;
  }

  // ---- DATE INPUT (type="date" → needs YYYY-MM-DD) ----
  if (type === "date") {
    el.focus();
    el.value = String(value); // Already in YYYY-MM-DD from cv.json
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    return;
  }

  // ---- TEXT / TEXTAREA / EMAIL / TEL / URL / NUMBER / etc. ----
  el.focus();

  // Step 1: clear the field
  el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));

  // Step 2: use the React/Angular-compatible native setter
  try {
    const proto = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value");
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, String(value));
    } else {
      el.value = String(value);
    }
  } catch (_) {
    el.value = String(value);
  }

  // Step 3: fire all relevant events so React/Angular/Vue pick up the change
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
  el.dispatchEvent(new KeyboardEvent("keyup",   { bubbles: true, key: "a" }));

  el.blur();
}
