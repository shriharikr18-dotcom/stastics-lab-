/**
 * Discrete Probability Distributions - AIML Laboratory Web Application
 * Core Application Logic (Vanilla JavaScript)
 */

(function () {
  'use strict';

  // --- STATE MANAGEMENT ---
  // Default values per Prompt 2 requirements: n = 20, p = 0.35
  const state = {
    n: 20,
    p: 0.35,
    k: 7,
    calcMode: 'exact', // 'exact' | 'atmost' | 'atleast'
    probabilities: [],
    cumulative: [],
    tail: [],
    hoveredIndex: -1,
    activeTab: 'home',
    theme: 'light',
    isValidN: true,
    isValidP: true
  };

  // Safe localStorage helper
  function safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSetItem(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      // Ignored in restricted environments
    }
  }

  // --- MATHEMATICAL HELPERS ---

  /**
   * Precomputed log factorials for numerical stability
   * logFact[x] = ln(x!)
   */
  const logFactCache = [0];
  function getLogFact(m) {
    while (logFactCache.length <= m) {
      const idx = logFactCache.length;
      logFactCache.push(logFactCache[idx - 1] + Math.log(idx));
    }
    return logFactCache[m];
  }

  /**
   * Exact BigInt combination nCr
   */
  function combinationsBigInt(n, r) {
    if (r < 0 || r > n) return 0n;
    if (r === 0 || r === n) return 1n;
    if (r > n - r) r = n - r;
    let res = 1n;
    for (let i = 1n; i <= BigInt(r); i++) {
      res = (res * (BigInt(n) - i + 1n)) / i;
    }
    return res;
  }

  /**
   * Calculates Binomial PMF: P(X = x) for given n, p
   * Uses log-space calculations to avoid overflow and maintain high precision
   */
  function calculateBinomialDistribution(n, p) {
    const probs = new Array(n + 1).fill(0);

    if (p === 0) {
      probs[0] = 1.0;
      return probs;
    }
    if (p === 1) {
      probs[n] = 1.0;
      return probs;
    }

    const logP = Math.log(p);
    const log1MinusP = Math.log(1 - p);
    const logFactN = getLogFact(n);

    for (let x = 0; x <= n; x++) {
      const logComb = logFactN - getLogFact(x) - getLogFact(n - x);
      const logProb = logComb + x * logP + (n - x) * log1MinusP;
      probs[x] = Math.exp(logProb);
    }

    return probs;
  }

  // --- TAB NAVIGATION ---
  window.switchTab = function (tabName) {
    if (!['home', 'binomial', 'poisson', 'geometric'].includes(tabName)) {
      tabName = 'home';
    }
    state.activeTab = tabName;

    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach((tab) => {
      if (tab.getAttribute('data-tab') === tabName) {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
      } else {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      }
    });

    const viewPanels = document.querySelectorAll('.view-panel');
    viewPanels.forEach((panel) => {
      if (panel.id === `tab-${tabName}`) {
        panel.classList.add('active-panel');
      } else {
        panel.classList.remove('active-panel');
      }
    });

    // Update URL hash safely without reload
    try {
      if (window.location.hash !== `#${tabName}`) {
        history.replaceState(null, '', `#${tabName}`);
      }
    } catch (e) {}

    // Redraw canvas if switching to binomial
    if (tabName === 'binomial') {
      requestAnimationFrame(() => {
        resizeAndDrawChart();
      });
      setTimeout(() => {
        resizeAndDrawChart();
      }, 60);
    }

    // Scroll smoothly to top
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {}
  };

  // --- THEME MANAGEMENT ---
  function initTheme() {
    try {
      const savedTheme = safeGetItem('aiml-lab-theme');
      if (savedTheme) {
        state.theme = savedTheme;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        state.theme = 'dark';
      } else {
        state.theme = 'light';
      }
    } catch (e) {
      state.theme = 'light';
    }
    applyTheme();
  }

  function applyTheme() {
    const iconSpan = document.querySelector('#theme-toggle-btn .theme-icon');
    if (state.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (iconSpan) iconSpan.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (iconSpan) iconSpan.textContent = '🌙';
    }
    safeSetItem('aiml-lab-theme', state.theme);
    drawDistributionChart();
  }

  window.toggleTheme = function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
  };

  // --- INPUT VALIDATION FUNCTIONS (PROMPT 2) ---
  /**
   * Validates n: must be a positive integer (n in Z, n >= 1)
   */
  function validateN(val) {
    if (val === '' || val === null || val === undefined) {
      return 'Number of trials (n) is required.';
    }
    const num = Number(val);
    if (isNaN(num)) {
      return 'Number of trials (n) must be a numeric value.';
    }
    if (!Number.isInteger(num)) {
      return 'n must be an integer (whole number, no decimals).';
    }
    if (num <= 0) {
      return 'n must be a positive integer (n ≥ 1).';
    }
    if (num > 100) {
      return 'For laboratory computation performance, please keep n ≤ 100.';
    }
    return null;
  }

  /**
   * Validates p: must be between 0 and 1 (0 <= p <= 1)
   */
  function validateP(val) {
    if (val === '' || val === null || val === undefined) {
      return 'Probability of success (p) is required.';
    }
    const num = Number(val);
    if (isNaN(num)) {
      return 'Probability (p) must be a numeric value.';
    }
    if (num < 0 || num > 1) {
      return 'p must be between 0 and 1 (0.00 ≤ p ≤ 1.00).';
    }
    return null;
  }

  // --- UPDATE SELECTED VALUES DISPLAY (PROMPT 2 & 3) ---
  function updateSelectedDisplays() {
    const { n, p, isValidN, isValidP } = state;

    const dispN = document.getElementById('disp-selected-n');
    const dispP = document.getElementById('disp-selected-p');
    const dispPct = document.getElementById('disp-selected-pct');
    const dispQ = document.getElementById('disp-selected-q');
    const dispQPct = document.getElementById('disp-selected-q-pct');
    const dispNotation = document.getElementById('selected-model-notation');
    const dispMean = document.getElementById('disp-selected-mean');
    const dispVar = document.getElementById('disp-selected-var');
    const dispStd = document.getElementById('disp-selected-std');
    const statusBadge = document.getElementById('validation-status-badge');

    if (isValidN && isValidP) {
      const q = 1 - p;
      const mean = n * p;
      const variance = n * p * q;
      const stdDev = Math.sqrt(variance);

      if (dispN) dispN.textContent = n;
      if (dispP) dispP.textContent = p.toFixed(2);
      if (dispPct) dispPct.textContent = `${(p * 100).toFixed(1)}% per trial`;
      if (dispQ) dispQ.textContent = q.toFixed(2);
      if (dispQPct) dispQPct.textContent = `${(q * 100).toFixed(1)}% per trial`;
      if (dispNotation) dispNotation.textContent = `X ~ B(n = ${n}, p = ${p.toFixed(2)})`;
      if (dispMean) dispMean.textContent = Number.isInteger(mean) ? mean.toString() : mean.toFixed(2);
      if (dispVar) dispVar.textContent = Number.isInteger(variance) ? variance.toString() : variance.toFixed(2);
      if (dispStd) dispStd.textContent = stdDev.toFixed(3);

      if (statusBadge) {
        statusBadge.className = 'validation-badge valid';
        statusBadge.textContent = `✓ Inputs Valid (n = ${n}, p = ${p.toFixed(2)})`;
      }
    } else {
      if (dispNotation) dispNotation.textContent = 'X ~ B(n = ?, p = ?)';
      if (statusBadge) {
        statusBadge.className = 'validation-badge invalid';
        statusBadge.textContent = '⚠️ Invalid Input Detected';
      }
    }
  }

  // --- STATISTIC CARDS CALCULATION & DISPLAY (PROMPT 3) ---
  /**
   * Calculates and updates the 5 statistic cards:
   * 1. Mean = np
   * 2. Variance = np(1-p)
   * 3. Standard deviation = sqrt(np(1-p))
   * 4. Second moment E[X²] = Variance + Mean²
   * 5. Skewness = (1-2p) / sqrt(np(1-p))
   */
  function updateStatisticCards() {
    const { n, p, isValidN, isValidP } = state;

    const elMean = document.getElementById('stat-val-mean');
    const elSubMean = document.getElementById('stat-sub-mean');
    const elVar = document.getElementById('stat-val-var');
    const elSubVar = document.getElementById('stat-sub-var');
    const elStd = document.getElementById('stat-val-std');
    const elSubStd = document.getElementById('stat-sub-std');
    const elSecondMoment = document.getElementById('stat-val-second-moment');
    const elSubSecondMoment = document.getElementById('stat-sub-second-moment');
    const elSkewness = document.getElementById('stat-val-skewness');
    const elSubSkewness = document.getElementById('stat-sub-skewness');
    const badgeCalc = document.getElementById('stats-badge-calc');

    if (!isValidN || !isValidP) {
      if (elMean) elMean.textContent = '--';
      if (elSubMean) elSubMean.textContent = 'Invalid input';
      if (elVar) elVar.textContent = '--';
      if (elSubVar) elSubVar.textContent = 'Invalid input';
      if (elStd) elStd.textContent = '--';
      if (elSubStd) elSubStd.textContent = 'Invalid input';
      if (elSecondMoment) elSecondMoment.textContent = '--';
      if (elSubSecondMoment) elSubSecondMoment.textContent = 'Invalid input';
      if (elSkewness) elSkewness.textContent = '--';
      if (elSubSkewness) elSubSkewness.textContent = 'Invalid input';
      if (badgeCalc) {
        badgeCalc.className = 'badge-status pending';
        badgeCalc.textContent = 'Awaiting valid inputs';
      }
      return;
    }

    // Formulas requested in prompt:
    // Mean = np
    const mean = n * p;
    // Variance = np(1-p)
    const variance = n * p * (1 - p);
    // Standard deviation = sqrt(variance)
    const stdDev = Math.sqrt(variance);
    // Second moment E[X²] = Variance + Mean²
    const secondMoment = variance + Math.pow(mean, 2);
    // Skewness = (1-2p) / sqrt(np(1-p))
    let skewness = 0;
    if (variance > 0) {
      skewness = (1 - 2 * p) / Math.sqrt(variance);
    }

    // Formatting for clean display
    // For n=20, p=0.35: mean=7, variance=4.55, std=2.133, secondMoment=53.55, skewness=0.141
    const meanFormatted = Number.isInteger(mean) ? mean.toString() : mean.toFixed(2);
    const varFormatted = Number.isInteger(variance) ? variance.toString() : variance.toFixed(2);
    const stdFormatted = stdDev.toFixed(3);
    const secondMomentFormatted = Number.isInteger(secondMoment) ? secondMoment.toString() : secondMoment.toFixed(2);
    const skewnessFormatted = skewness.toFixed(3);

    // 1. Mean
    if (elMean) elMean.textContent = meanFormatted;
    if (elSubMean) elSubMean.textContent = `${n} × ${p.toFixed(2)} = ${meanFormatted}`;

    // 2. Variance
    if (elVar) elVar.textContent = varFormatted;
    if (elSubVar) elSubVar.textContent = `${n} × ${p.toFixed(2)} × ${(1 - p).toFixed(2)} = ${varFormatted}`;

    // 3. Standard Deviation
    if (elStd) elStd.textContent = stdFormatted;
    if (elSubStd) elSubStd.textContent = `√${varFormatted} = ${stdFormatted}`;

    // 4. Second Moment
    if (elSecondMoment) elSecondMoment.textContent = secondMomentFormatted;
    if (elSubSecondMoment) elSubSecondMoment.textContent = `${varFormatted} + ${meanFormatted}² = ${secondMomentFormatted}`;

    // 5. Skewness
    if (elSkewness) elSkewness.textContent = skewness > 0 ? `+${skewnessFormatted}` : skewnessFormatted;
    if (elSubSkewness) {
      if (Math.abs(p - 0.5) < 0.0001) {
        elSubSkewness.textContent = 'Symmetric (γ₁ = 0.000)';
      } else if (p < 0.5) {
        elSubSkewness.textContent = 'Positive (right-skewed)';
      } else {
        elSubSkewness.textContent = 'Negative (left-skewed)';
      }
    }

    if (badgeCalc) {
      badgeCalc.className = 'badge-status ready';
      badgeCalc.textContent = `Calculated: n = ${n}, p = ${p.toFixed(2)}`;
    }
  }

  // --- UPDATE AND RENDER LOGIC ---
  function updateCalculations() {
    const { n, p, k, calcMode, isValidN, isValidP } = state;

    // Update the prominent Prompt 2 selected values display
    updateSelectedDisplays();

    // Update the 5 simple statistic cards (Prompt 3)
    updateStatisticCards();

    // If inputs are currently invalid, halt calculation and chart update
    if (!isValidN || !isValidP) {
      return;
    }

    // Calculate all PMF values
    state.probabilities = calculateBinomialDistribution(n, p);

    // Compute cumulative and tail distributions
    state.cumulative = new Array(n + 1).fill(0);
    state.tail = new Array(n + 1).fill(0);

    let cumSum = 0;
    for (let x = 0; x <= n; x++) {
      cumSum += state.probabilities[x];
      state.cumulative[x] = Math.min(1.0, cumSum);
    }

    let tailSum = 0;
    for (let x = n; x >= 0; x--) {
      tailSum += state.probabilities[x];
      state.tail[x] = Math.min(1.0, tailSum);
    }

    // Statistical Parameters
    const mean = n * p;
    const variance = n * p * (1 - p);
    const stdDev = Math.sqrt(variance);

    // Update Input Display Badges
    const displayN = document.getElementById('display-n');
    const displayP = document.getElementById('display-p');
    const displayK = document.getElementById('display-k');
    if (displayN) displayN.textContent = n;
    if (displayP) displayP.textContent = p.toFixed(2);
    if (displayK) displayK.textContent = k;

    // Bound sliders and inputs
    const sliderK = document.getElementById('slider-k');
    const inputK = document.getElementById('input-k');
    if (sliderK) sliderK.max = n;
    if (inputK) inputK.max = n;

    // Target Metric Card Update
    const exactProb = state.probabilities[k] || 0;
    const cumProb = state.cumulative[k] || 0;
    const tailProb = state.tail[k] || 0;

    const metricProbTitle = document.getElementById('metric-prob-title');
    const valExactProb = document.getElementById('val-exact-prob');
    const valExactPct = document.getElementById('val-exact-pct');
    const valCumProb = document.getElementById('val-cum-prob');
    const valCumPct = document.getElementById('val-cum-pct');
    const valMean = document.getElementById('val-mean');
    const valVar = document.getElementById('val-var');
    const valStd = document.getElementById('val-std');

    if (metricProbTitle && valExactProb && valExactPct) {
      if (calcMode === 'exact') {
        metricProbTitle.textContent = `P(X = ${k})`;
        valExactProb.textContent = exactProb.toFixed(4);
        valExactPct.textContent = `${(exactProb * 100).toFixed(2)}% probability`;
      } else if (calcMode === 'atmost') {
        metricProbTitle.textContent = `P(X ≤ ${k})`;
        valExactProb.textContent = cumProb.toFixed(4);
        valExactPct.textContent = `${(cumProb * 100).toFixed(2)}% cumulative`;
      } else {
        metricProbTitle.textContent = `P(X ≥ ${k})`;
        valExactProb.textContent = tailProb.toFixed(4);
        valExactPct.textContent = `${(tailProb * 100).toFixed(2)}% tail`;
      }
    }

    if (valCumProb) valCumProb.textContent = cumProb.toFixed(4);
    if (valCumPct) valCumPct.textContent = `${(cumProb * 100).toFixed(2)}% cumulative`;
    if (valMean) valMean.textContent = Number.isInteger(mean) ? mean.toString() : mean.toFixed(2);
    if (valVar) valVar.textContent = Number.isInteger(variance) ? variance.toString() : variance.toFixed(2);
    if (valStd) valStd.textContent = `σ = ${stdDev.toFixed(3)}`;

    // Update Step-by-Step Breakdown
    updateBreakdown(n, p, k, exactProb);

    // Update Case Study Values
    updateCaseStudy(n, p, k, mean, exactProb, tailProb);

    // Update PMF & CDF Calculator Displays (Prompt 4)
    updateCalculatorDisplays();

    // Update Distribution Table
    renderDistributionTable();

    // Redraw Chart
    drawDistributionChart();
  }

  function updateBreakdown(n, p, k, prob) {
    const paramKTexts = document.querySelectorAll('.param-k-text');
    paramKTexts.forEach((el) => (el.textContent = k));

    const calcStepNcr = document.getElementById('calc-step-ncr');
    const calcStepPk = document.getElementById('calc-step-pk');
    const calcStepQnk = document.getElementById('calc-step-qnk');
    const calcStepResult = document.getElementById('calc-step-result');

    // Step 1: Combinations
    const ncrBig = combinationsBigInt(n, k);
    let ncrFormatted = ncrBig.toString();
    if (ncrFormatted.length > 15) {
      ncrFormatted = ncrBig.toExponential(4);
    }
    if (calcStepNcr) {
      calcStepNcr.innerHTML = `ⁿCₖ = ${n}! / (${k}! · ${n - k}!) = <strong>${ncrFormatted}</strong>`;
    }

    // Step 2: p^k
    const pkVal = Math.pow(p, k);
    if (calcStepPk) {
      calcStepPk.innerHTML = `pᵏ = ${p.toFixed(2)}<sup>${k}</sup> = <strong>${pkVal < 0.0001 && pkVal > 0 ? pkVal.toExponential(4) : pkVal.toFixed(5)}</strong>`;
    }

    // Step 3: (1 - p)^(n - k)
    const q = 1 - p;
    const nk = n - k;
    const qnkVal = Math.pow(q, nk);
    if (calcStepQnk) {
      calcStepQnk.innerHTML = `(1 - p)ⁿ⁻ᵏ = ${q.toFixed(2)}<sup>${nk}</sup> = <strong>${qnkVal < 0.0001 && qnkVal > 0 ? qnkVal.toExponential(4) : qnkVal.toFixed(5)}</strong>`;
    }

    // Final result
    const pct = (prob * 100).toFixed(2);
    if (calcStepResult) {
      calcStepResult.innerHTML = `P(X = ${k}) = ${ncrFormatted} · ${pkVal < 0.0001 && pkVal > 0 ? pkVal.toExponential(3) : pkVal.toFixed(4)} · ${qnkVal < 0.0001 && qnkVal > 0 ? qnkVal.toExponential(3) : qnkVal.toFixed(4)} = <strong>${prob.toFixed(4)}</strong> (${pct}%)`;
    }
  }

  function updateCaseStudy(n, p, k, mean, exactProb, tailProb) {
    const caseN = document.getElementById('case-n');
    const caseP = document.getElementById('case-p');
    const caseK = document.getElementById('case-k');
    const caseMean = document.getElementById('case-mean');
    const caseProb = document.getElementById('case-prob');
    const caseKAtleast = document.getElementById('case-k-atleast');
    const caseCum = document.getElementById('case-cum');

    if (caseN) caseN.textContent = `n = ${n}`;
    if (caseP) caseP.textContent = `p = ${p.toFixed(2)}`;
    if (caseK) caseK.textContent = `k = ${k}`;
    if (caseMean) caseMean.textContent = `μ = ${mean.toFixed(2)}`;
    if (caseProb) caseProb.textContent = exactProb.toFixed(4);
    if (caseKAtleast) caseKAtleast.textContent = `k = ${k}`;
    if (caseCum) caseCum.textContent = tailProb.toFixed(4);
  }

  // --- PMF & CDF CALCULATOR DISPLAY UPDATE (PROMPT 4) ---
  /**
   * Updates the PMF calculator card and CDF calculator card
   * based on the current state (n, p, k, probabilities, cumulative)
   */
  function updateCalculatorDisplays() {
    const { n, p, k, probabilities, cumulative, isValidN, isValidP } = state;

    // --- PMF Calculator ---
    const pmfResultLabel = document.getElementById('pmf-result-label');
    const pmfValResult   = document.getElementById('pmf-val-result');
    const pmfPctResult   = document.getElementById('pmf-pct-result');
    const pmfExplanation = document.getElementById('pmf-explanation-text');

    // --- CDF Calculator ---
    const cdfLabelAtmost  = document.getElementById('cdf-label-atmost');
    const cdfValAtmost    = document.getElementById('cdf-val-atmost');
    const cdfPctAtmost    = document.getElementById('cdf-pct-atmost');
    const cdfLabelGreater = document.getElementById('cdf-label-greater');
    const cdfValGreater   = document.getElementById('cdf-val-greater');
    const cdfPctGreater   = document.getElementById('cdf-pct-greater');

    if (!isValidN || !isValidP || !probabilities || probabilities.length === 0) {
      if (pmfValResult)   pmfValResult.textContent   = '--';
      if (pmfResultLabel) pmfResultLabel.textContent = 'Exact Probability P(X = k)';
      if (pmfPctResult)   pmfPctResult.textContent   = 'Enter valid n and p to compute.';
      if (pmfExplanation) pmfExplanation.textContent = 'Awaiting valid inputs.';
      if (cdfValAtmost)   cdfValAtmost.textContent   = '--';
      if (cdfValGreater)  cdfValGreater.textContent  = '--';
      return;
    }

    const exactProb = probabilities[k] !== undefined ? probabilities[k] : 0;
    const cumProb   = cumulative[k]    !== undefined ? cumulative[k]    : 0;
    const tailProb  = Math.max(0, 1 - cumProb + exactProb); // P(X > k) = 1 - P(X <= k)
    // More accurate: P(X > k) = 1 - P(X <= k)
    const greaterProb = Math.max(0, 1 - cumProb);

    // PMF Card
    if (pmfResultLabel) pmfResultLabel.textContent = `Exact Probability P(X = ${k})`;
    if (pmfValResult)   pmfValResult.textContent   = exactProb.toFixed(4);
    if (pmfPctResult)   pmfPctResult.textContent   = `${(exactProb * 100).toFixed(2)}% probability of observing exactly ${k} success${k !== 1 ? 'es' : ''}`;
    if (pmfExplanation) {
      pmfExplanation.textContent =
        `P(X = ${k}) represents the exact probability of observing precisely ${k} success${k !== 1 ? 'es' : ''} in ${n} independent Bernoulli trial${n !== 1 ? 's' : ''}.`;
    }

    // CDF Card
    if (cdfLabelAtmost)  cdfLabelAtmost.textContent  = `Cumulative P(X \u2264 ${k})`;
    if (cdfValAtmost)    cdfValAtmost.textContent    = cumProb.toFixed(4);
    if (cdfPctAtmost)    cdfPctAtmost.textContent    = `${(cumProb * 100).toFixed(2)}% cumulative probability`;
    if (cdfLabelGreater) cdfLabelGreater.textContent = `Tail P(X > ${k}) = 1 - P(X \u2264 ${k})`;
    if (cdfValGreater)   cdfValGreater.textContent   = greaterProb.toFixed(4);
    if (cdfPctGreater)   cdfPctGreater.textContent   = `${(greaterProb * 100).toFixed(2)}% complementary probability`;
  }

  function renderDistributionTable() {
    const { n, k, probabilities, cumulative, tail } = state;
    const tbody = document.getElementById('binomial-table-body');
    if (!tbody) return;

    let html = '';
    for (let x = 0; x <= n; x++) {
      const pVal = probabilities[x] || 0;
      const isSelected = x === k;
      const pct = (pVal * 100).toFixed(2);
      const cumVal = cumulative[x] || 0;
      const tailVal = tail[x] || 0;

      html += `
        <tr class="${isSelected ? 'row-selected' : ''}">
          <td><strong>${x}</strong> ${isSelected ? '★' : ''}</td>
          <td>${pVal.toFixed(5)}</td>
          <td>${pct}%</td>
          <td>${cumVal.toFixed(5)}</td>
          <td>${tailVal.toFixed(5)}</td>
        </tr>
      `;
    }
    tbody.innerHTML = html;
  }

  // --- CANVAS CHART RENDERING ---
  const chartLayout = {
    bars: [],
    paddingLeft: 55,
    paddingRight: 25,
    paddingTop: 30,
    paddingBottom: 40
  };

  function resizeAndDrawChart() {
    const canvas = document.getElementById('distribution-canvas');
    if (!canvas) return;

    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : null;
    const dpr = window.devicePixelRatio || 1;

    let w = (rect && rect.width > 50) ? rect.width : 760;
    let h = (rect && rect.height > 50) ? rect.height : 320;

    canvas.width = w * dpr;
    canvas.height = h * dpr;

    drawDistributionChart();
  }

  function drawDistributionChart() {
    const canvas = document.getElementById('distribution-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const { n, k, calcMode, probabilities, hoveredIndex, isValidN, isValidP } = state;
    if (!isValidN || !isValidP || !probabilities || probabilities.length === 0) {
      ctx.restore();
      return;
    }

    const { paddingLeft, paddingRight, paddingTop, paddingBottom } = chartLayout;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    if (chartW <= 20 || chartH <= 20) {
      ctx.restore();
      return;
    }

    // Determine Y max for pleasant scaling
    let maxP = 0;
    for (let i = 0; i <= n; i++) {
      if (probabilities[i] > maxP) maxP = probabilities[i];
    }
    if (maxP === 0) maxP = 1.0;
    // Add 18% headroom
    const yMax = Math.min(1.0, maxP * 1.18);

    // CSS Theme colors
    const isDark = state.theme === 'dark';
    const gridColor = isDark ? '#374151' : '#e2e8f0';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const barNormal = isDark ? '#1e3a8a' : '#bfdbfe';
    const barHighlight = isDark ? '#3b82f6' : '#2563eb';
    const barHover = isDark ? '#60a5fa' : '#1d4ed8';
    const meanColor = isDark ? '#f87171' : '#dc2626';

    // 1. Draw horizontal gridlines & Y-axis labels
    const ySteps = 4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = textColor;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let s = 0; s <= ySteps; s++) {
      const frac = s / ySteps;
      const val = frac * yMax;
      const yPos = paddingTop + chartH - frac * chartH;

      ctx.beginPath();
      ctx.moveTo(paddingLeft, yPos);
      ctx.lineTo(width - paddingRight, yPos);
      ctx.stroke();

      ctx.fillText(val.toFixed(val >= 0.1 ? 2 : 3), paddingLeft - 8, yPos);
    }

    // Y-Axis Title
    ctx.save();
    ctx.translate(14, paddingTop + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.fillText('P(X = x)', 0, 0);
    ctx.restore();

    // 2. Draw Bars
    const totalBars = n + 1;
    const barSlotWidth = chartW / totalBars;
    const barMargin = Math.max(1, Math.min(6, barSlotWidth * 0.18));
    const barWidth = Math.max(2, barSlotWidth - barMargin * 2);

    chartLayout.bars = [];

    for (let x = 0; x <= n; x++) {
      const pVal = probabilities[x] || 0;
      const barH = (pVal / yMax) * chartH;
      const xPos = paddingLeft + x * barSlotWidth + barMargin;
      const yPos = paddingTop + chartH - barH;

      // Check highlight condition
      let isHighlighted = false;
      if (calcMode === 'exact') {
        isHighlighted = x === k;
      } else if (calcMode === 'atmost') {
        isHighlighted = x <= k;
      } else if (calcMode === 'atleast') {
        isHighlighted = x >= k;
      }

      const isHovered = x === hoveredIndex;

      // Choose fill
      if (isHovered) {
        ctx.fillStyle = barHover;
      } else if (isHighlighted) {
        ctx.fillStyle = barHighlight;
      } else {
        ctx.fillStyle = barNormal;
      }

      // Rounded top rectangle
      drawRoundedBar(ctx, xPos, yPos, barWidth, barH, Math.min(4, barWidth / 2));

      // Record bar bounding box for hover detection
      chartLayout.bars.push({
        xIndex: x,
        x: xPos,
        y: yPos,
        w: barWidth,
        h: barH,
        pVal: pVal
      });

      // Label on X-axis (decimate if many bars)
      const labelInterval = n > 35 ? 5 : n > 20 ? 2 : 1;
      if (x % labelInterval === 0 || x === k) {
        ctx.fillStyle = x === k ? (isDark ? '#60a5fa' : '#2563eb') : textColor;
        ctx.font = x === k ? 'bold 11px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(x.toString(), xPos + barWidth / 2, paddingTop + chartH + 7);
      }
    }

    // X-Axis Title
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Number of Successes (x)', paddingLeft + chartW / 2, height - 8);

    // 3. Draw Mean Marker (μ)
    const mean = state.n * state.p;
    if (mean >= 0 && mean <= n) {
      const meanX = paddingLeft + (mean + 0.5) * barSlotWidth;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = meanColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(meanX, paddingTop);
      ctx.lineTo(meanX, paddingTop + chartH);
      ctx.stroke();

      // Label mean
      ctx.fillStyle = meanColor;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`μ = ${mean.toFixed(2)}`, meanX, paddingTop - 4);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawRoundedBar(ctx, x, y, width, height, radius) {
    if (height <= 0) return;
    radius = Math.min(radius, height);
    ctx.beginPath();
    ctx.moveTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.closePath();
    ctx.fill();
  }

  // --- TOOLTIP & MOUSE INTERACTION ---
  function setupChartHover() {
    const canvas = document.getElementById('distribution-canvas');
    const tooltip = document.getElementById('chart-tooltip');
    if (!canvas || !tooltip) return;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      let found = -1;
      for (let i = 0; i < chartLayout.bars.length; i++) {
        const b = chartLayout.bars[i];
        if (mouseX >= b.x - 2 && mouseX <= b.x + b.w + 2) {
          found = b.xIndex;
          break;
        }
      }

      if (found !== -1) {
        state.hoveredIndex = found;
        drawDistributionChart();

        const pVal = state.probabilities[found] || 0;
        const cumVal = state.cumulative[found] || 0;
        const pct = (pVal * 100).toFixed(2);

        tooltip.innerHTML = `
          <div>X = ${found}</div>
          <div>P(X=${found}) = ${pVal.toFixed(4)}</div>
        `;
        tooltip.hidden = false;

        // Position tooltip
        const barInfo = chartLayout.bars[found];
        if (barInfo) {
          const ttX = barInfo.x + barInfo.w / 2;
          const ttY = Math.max(30, barInfo.y);
          tooltip.style.left = `${ttX}px`;
          tooltip.style.top = `${ttY}px`;
        }
      } else {
        if (state.hoveredIndex !== -1) {
          state.hoveredIndex = -1;
          drawDistributionChart();
        }
        tooltip.hidden = true;
      }
    });

    canvas.addEventListener('mouseleave', () => {
      state.hoveredIndex = -1;
      tooltip.hidden = true;
      drawDistributionChart();
    });

    // Clicking a bar sets k
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      for (let i = 0; i < chartLayout.bars.length; i++) {
        const b = chartLayout.bars[i];
        if (mouseX >= b.x - 2 && mouseX <= b.x + b.w + 2) {
          setK(b.xIndex);
          break;
        }
      }
    });
  }

  // --- CONTROLS SYNCHRONIZATION WITH VALIDATION (PROMPT 2) ---
  function handleNChange(rawVal, sourceSlider) {
    const errorMsg = validateN(rawVal);
    const errorContainer = document.getElementById('error-n');
    const inputN = document.getElementById('input-n');
    const sliderN = document.getElementById('slider-n');

    if (errorMsg) {
      state.isValidN = false;
      if (errorContainer) {
        errorContainer.textContent = `⚠️ ${errorMsg}`;
        errorContainer.hidden = false;
      }
      if (inputN) inputN.classList.add('input-invalid');
      updateSelectedDisplays();
    } else {
      state.isValidN = true;
      const num = parseInt(rawVal, 10);
      state.n = num;

      if (errorContainer) {
        errorContainer.hidden = true;
        errorContainer.textContent = '';
      }
      if (inputN) {
        inputN.classList.remove('input-invalid');
        if (sourceSlider) inputN.value = num;
      }
      if (sliderN && !sourceSlider) {
        sliderN.value = Math.min(60, num);
      }

      // Automatically adjust target k if k > n
      if (state.k > num) {
        setK(num);
      } else {
        updateCalculations();
      }
    }
  }

  function handlePChange(rawVal, sourceSlider) {
    const errorMsg = validateP(rawVal);
    const errorContainer = document.getElementById('error-p');
    const inputP = document.getElementById('input-p');
    const sliderP = document.getElementById('slider-p');

    if (errorMsg) {
      state.isValidP = false;
      if (errorContainer) {
        errorContainer.textContent = `⚠️ ${errorMsg}`;
        errorContainer.hidden = false;
      }
      if (inputP) inputP.classList.add('input-invalid');
      updateSelectedDisplays();
    } else {
      state.isValidP = true;
      const num = parseFloat(Number(rawVal).toFixed(4));
      state.p = num;

      if (errorContainer) {
        errorContainer.hidden = true;
        errorContainer.textContent = '';
      }
      if (inputP) {
        inputP.classList.remove('input-invalid');
        if (sourceSlider) inputP.value = num.toFixed(2);
      }
      if (sliderP && !sourceSlider) {
        sliderP.value = num;
      }

      updateCalculations();
    }
  }

  function setK(val) {
    val = Math.max(0, Math.min(state.n, parseInt(val, 10) || 0));
    state.k = val;
    const sliderK = document.getElementById('slider-k');
    const inputK = document.getElementById('input-k');
    if (sliderK) sliderK.value = val;
    if (inputK) inputK.value = val;
    updateCalculations();
  }

  function clearPresetSelection() {
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach((chip) => chip.classList.remove('active'));
  }

  function setupControls() {
    const sliderN = document.getElementById('slider-n');
    const inputN = document.getElementById('input-n');
    if (sliderN) {
      sliderN.addEventListener('input', (e) => {
        handleNChange(e.target.value, true);
        clearPresetSelection();
      });
    }
    if (inputN) {
      inputN.addEventListener('input', (e) => {
        handleNChange(e.target.value, false);
        clearPresetSelection();
      });
      inputN.addEventListener('change', (e) => {
        handleNChange(e.target.value, false);
        clearPresetSelection();
      });
    }

    const sliderP = document.getElementById('slider-p');
    const inputP = document.getElementById('input-p');
    if (sliderP) {
      sliderP.addEventListener('input', (e) => {
        handlePChange(e.target.value, true);
        clearPresetSelection();
      });
    }
    if (inputP) {
      inputP.addEventListener('input', (e) => {
        handlePChange(e.target.value, false);
        clearPresetSelection();
      });
      inputP.addEventListener('change', (e) => {
        handlePChange(e.target.value, false);
        clearPresetSelection();
      });
    }

    const sliderK = document.getElementById('slider-k');
    const inputK = document.getElementById('input-k');
    if (sliderK) sliderK.addEventListener('input', (e) => setK(e.target.value));
    if (inputK) inputK.addEventListener('change', (e) => setK(e.target.value));

    // Calculation Mode Radios
    const calcModeRadios = document.querySelectorAll('input[name="calc-mode"]');
    calcModeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        state.calcMode = e.target.value;
        updateCalculations();
      });
    });

    // Reset button - resets to default requirements n = 20, p = 0.35
    const resetBtn = document.getElementById('reset-params-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.n = 20;
        state.p = 0.35;
        state.k = 7;
        state.calcMode = 'exact';
        state.isValidN = true;
        state.isValidP = true;

        if (sliderN) sliderN.value = 20;
        if (inputN) {
          inputN.value = 20;
          inputN.classList.remove('input-invalid');
        }
        const errorN = document.getElementById('error-n');
        if (errorN) errorN.hidden = true;

        if (sliderP) sliderP.value = 0.35;
        if (inputP) {
          inputP.value = 0.35;
          inputP.classList.remove('input-invalid');
        }
        const errorP = document.getElementById('error-p');
        if (errorP) errorP.hidden = true;

        if (sliderK) {
          sliderK.max = 20;
          sliderK.value = 7;
        }
        if (inputK) {
          inputK.max = 20;
          inputK.value = 7;
        }

        const radioExact = document.querySelector('input[name="calc-mode"][value="exact"]');
        if (radioExact) radioExact.checked = true;

        highlightPreset(20, 0.35, 7);
        updateCalculations();
      });
    }

    // Presets
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const n = parseInt(chip.dataset.n, 10);
        const p = parseFloat(chip.dataset.p);
        const k = parseInt(chip.dataset.k, 10);

        presetChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        state.n = n;
        state.p = p;
        state.k = k;
        state.isValidN = true;
        state.isValidP = true;

        const errorN = document.getElementById('error-n');
        const errorP = document.getElementById('error-p');
        if (errorN) errorN.hidden = true;
        if (errorP) errorP.hidden = true;

        if (sliderN) sliderN.value = Math.min(60, n);
        if (inputN) {
          inputN.value = n;
          inputN.classList.remove('input-invalid');
        }
        if (sliderP) sliderP.value = p;
        if (inputP) {
          inputP.value = p;
          inputP.classList.remove('input-invalid');
        }
        if (sliderK) {
          sliderK.max = n;
          sliderK.value = k;
        }
        if (inputK) {
          inputK.max = n;
          inputK.value = k;
        }

        updateCalculations();
      });
    });

    // Toggle Table View
    const toggleTableBtn = document.getElementById('toggle-table-btn');
    const tableWrapper = document.getElementById('prob-table-wrapper');
    if (toggleTableBtn && tableWrapper) {
      toggleTableBtn.addEventListener('click', () => {
        const isCollapsed = tableWrapper.style.maxHeight === '800px';
        tableWrapper.style.maxHeight = isCollapsed ? '280px' : '800px';
        toggleTableBtn.textContent = isCollapsed ? 'Toggle Full Table View' : 'Collapse Table View';
      });
    }

    // Nav Tab Clicks
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        if (target) switchTab(target);
      });
    });

    // Theme Toggle
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Window Resize Observer for Chart
    window.addEventListener('resize', () => {
      resizeAndDrawChart();
    });

    // Listen to hash change
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && ['home', 'binomial', 'poisson', 'geometric'].includes(hash)) {
        switchTab(hash);
      }
    });
  }

  function highlightPreset(n, p, k) {
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach((chip) => {
      if (parseInt(chip.dataset.n, 10) === n && Math.abs(parseFloat(chip.dataset.p) - p) < 0.001 && parseInt(chip.dataset.k, 10) === k) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  // --- INITIALIZATION ---
  function init() {
    try { initTheme(); } catch (e) { console.warn('Theme init warning:', e); }
    try { setupControls(); } catch (e) { console.warn('Controls init warning:', e); }
    try { setupChartHover(); } catch (e) { console.warn('Chart hover warning:', e); }
    try { updateCalculations(); } catch (e) { console.warn('Calculations init warning:', e); }

    // Check initial hash
    try {
      const hash = window.location.hash.replace('#', '');
      if (hash && ['home', 'binomial', 'poisson', 'geometric'].includes(hash)) {
        switchTab(hash);
      }
    } catch (e) {}

    // Initial chart draw
    setTimeout(() => {
      resizeAndDrawChart();
    }, 100);
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// =============================================================================
// POISSON DISTRIBUTION MODULE
// =============================================================================
(function () {
  'use strict';

  const poisState = {
    lambda: 6,
    k: 6,
    calcMode: 'exact',
    probabilities: [],
    cumulative: [],
    tail: [],
    hoveredIndex: -1,
    isValid: true
  };

  function poisMaxX(lambda) {
    return Math.max(15, Math.ceil(lambda + 4 * Math.sqrt(lambda)) + 2);
  }

  function calcPoissonPMF(lambda) {
    const maxX = poisMaxX(lambda);
    const probs = new Array(maxX + 1).fill(0);
    const logLambda = Math.log(lambda);
    const lfCache = [0];
    function lf(m) {
      while (lfCache.length <= m) {
        const i = lfCache.length;
        lfCache.push(lfCache[i - 1] + Math.log(i));
      }
      return lfCache[m];
    }
    for (let x = 0; x <= maxX; x++) {
      probs[x] = Math.exp(x * logLambda - lambda - lf(x));
    }
    return probs;
  }

  function setTxt(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  function poisUpdateAll() {
    const { lambda, k, calcMode, isValid } = poisState;
    const lf = lambda % 1 === 0 ? String(lambda) : lambda.toFixed(2);
    const std = Math.sqrt(lambda);
    const skew = 1 / Math.sqrt(lambda);
    const mode = Math.floor(lambda);

    setTxt('pois-disp-lambda', lf);
    setTxt('pois-disp-mean', lf);
    setTxt('pois-disp-var', lf);
    setTxt('pois-disp-std', std.toFixed(3));
    setTxt('pois-selected-notation', `X \u223c Poisson(\u03bb = ${lf})`);
    setTxt('pois-display-lambda', lf);
    setTxt('pois-display-k', k);
    setTxt('pois-stat-mean', lf);
    setTxt('pois-stat-sub-mean', `\u03bb = ${lf}`);
    setTxt('pois-stat-var', lf);
    setTxt('pois-stat-sub-var', `\u03c3\u00b2 = \u03bb = ${lf}`);
    setTxt('pois-stat-std', std.toFixed(3));
    setTxt('pois-stat-sub-std', `\u221a${lf} = ${std.toFixed(3)}`);
    setTxt('pois-stat-skewness', skew > 0 ? `+${skew.toFixed(3)}` : skew.toFixed(3));
    setTxt('pois-stat-sub-skewness', lambda < 1 ? 'Heavily right-skewed' : lambda > 10 ? 'Near symmetric' : 'Positive (right-skewed)');
    setTxt('pois-stat-mode', mode);
    setTxt('pois-stat-sub-mode', `\u230a\u03bb\u230b = ${mode} (most likely outcome)`);
    setTxt('pois-stats-badge', `Calculated: \u03bb = ${lf}`);

    const badge = document.getElementById('pois-validation-badge');
    if (badge) {
      badge.className = `validation-badge ${isValid ? 'valid' : 'invalid'}`;
      badge.textContent = isValid ? '\u2713 Inputs Valid' : '\u26a0\ufe0f Invalid Input';
    }

    if (!isValid) {
      ['pois-pmf-val', 'pois-cdf-atmost', 'pois-cdf-greater'].forEach((id) => setTxt(id, '--'));
      return;
    }

    // Compute distribution
    poisState.probabilities = calcPoissonPMF(lambda);
    const n = poisState.probabilities.length;
    poisState.cumulative = new Array(n).fill(0);
    poisState.tail       = new Array(n).fill(0);
    let cumSum = 0;
    for (let x = 0; x < n; x++) { cumSum += poisState.probabilities[x]; poisState.cumulative[x] = Math.min(1, cumSum); }
    let tailSum = 0;
    for (let x = n - 1; x >= 0; x--) { tailSum += poisState.probabilities[x]; poisState.tail[x] = Math.min(1, tailSum); }

    const safeK     = Math.min(k, n - 1);
    const exactProb = poisState.probabilities[safeK] || 0;
    const cumProb   = poisState.cumulative[safeK]    || 0;
    const greaterProb = Math.max(0, 1 - cumProb);

    // PMF card
    setTxt('pois-pmf-result-label', `Exact Probability P(X = ${safeK})`);
    setTxt('pois-pmf-val',          exactProb.toFixed(4));
    setTxt('pois-pmf-pct',          `${(exactProb * 100).toFixed(2)}% probability of observing exactly ${safeK} event${safeK !== 1 ? 's' : ''}`);
    setTxt('pois-pmf-explanation',  `P(X = ${safeK}) is the probability of observing precisely ${safeK} event${safeK !== 1 ? 's' : ''} in the interval when \u03bb = ${lf}.`);

    // CDF card
    setTxt('pois-cdf-label-atmost',  `Cumulative P(X \u2264 ${safeK})`);
    setTxt('pois-cdf-atmost',         cumProb.toFixed(4));
    setTxt('pois-cdf-pct-atmost',    `${(cumProb * 100).toFixed(2)}% cumulative probability`);
    setTxt('pois-cdf-label-greater', `Tail P(X > ${safeK}) = 1 \u2212 P(X \u2264 ${safeK})`);
    setTxt('pois-cdf-greater',        greaterProb.toFixed(4));
    setTxt('pois-cdf-pct-greater',   `${(greaterProb * 100).toFixed(2)}% complementary probability`);

    // Table
    const tbody = document.getElementById('pois-table-body');
    if (tbody) {
      let html = '';
      for (let x = 0; x < n; x++) {
        const pv = poisState.probabilities[x] || 0;
        const cv = poisState.cumulative[x]    || 0;
        const tv = poisState.tail[x]          || 0;
        html += `<tr class="${x === safeK ? 'row-selected' : ''}"><td><strong>${x}</strong>${x === safeK ? ' \u2605' : ''}</td><td>${pv.toFixed(5)}</td><td>${(pv * 100).toFixed(2)}%</td><td>${cv.toFixed(5)}</td><td>${tv.toFixed(5)}</td></tr>`;
      }
      tbody.innerHTML = html;
    }

    poisDrawChart();
  }

  // --- CHART ---
  const poisCL = { bars: [], paddingLeft: 55, paddingRight: 25, paddingTop: 30, paddingBottom: 40 };

  function poisResizeAndDraw() {
    const canvas = document.getElementById('pois-distribution-canvas');
    if (!canvas) return;
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : null;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = ((rect && rect.width  > 50) ? rect.width  : 760) * dpr;
    canvas.height = ((rect && rect.height > 50) ? rect.height : 320) * dpr;
    poisDrawChart();
  }

  function poisDrawChart() {
    const canvas = document.getElementById('pois-distribution-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { probabilities, k, calcMode, hoveredIndex, isValid, lambda } = poisState;
    if (!isValid || !probabilities || probabilities.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width  = canvas.width  / dpr;
    const height = canvas.height / dpr;
    const { paddingLeft, paddingRight, paddingTop, paddingBottom } = poisCL;
    const chartW = width  - paddingLeft - paddingRight;
    const chartH = height - paddingTop  - paddingBottom;
    if (chartW <= 20 || chartH <= 20) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const isDark       = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor    = isDark ? '#374151' : '#e2e8f0';
    const textColor    = isDark ? '#94a3b8' : '#64748b';
    const barNormal    = isDark ? '#14532d' : '#bbf7d0';
    const barHighlight = isDark ? '#16a34a' : '#16a34a';
    const barHover     = isDark ? '#4ade80' : '#15803d';
    const meanColor    = isDark ? '#f87171' : '#dc2626';

    let maxP = 0;
    for (const p of probabilities) if (p > maxP) maxP = p;
    if (maxP === 0) maxP = 1;
    const yMax = Math.min(1.0, maxP * 1.18);

    // Grid & Y-labels
    ctx.lineWidth = 1; ctx.strokeStyle = gridColor; ctx.fillStyle = textColor;
    ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let s = 0; s <= 4; s++) {
      const frac = s / 4;
      const yPos = paddingTop + chartH - frac * chartH;
      ctx.beginPath(); ctx.moveTo(paddingLeft, yPos); ctx.lineTo(width - paddingRight, yPos); ctx.stroke();
      ctx.fillText((frac * yMax).toFixed(frac * yMax >= 0.1 ? 2 : 3), paddingLeft - 8, yPos);
    }
    ctx.save(); ctx.translate(14, paddingTop + chartH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = textColor; ctx.font = '12px sans-serif';
    ctx.fillText('P(X = x)', 0, 0); ctx.restore();

    // Bars
    const n = probabilities.length;
    const barSlotW  = chartW / n;
    const barMargin = Math.max(1, Math.min(6, barSlotW * 0.18));
    const barWidth  = Math.max(2, barSlotW - barMargin * 2);
    poisCL.bars = [];
    const safeK = Math.min(k, n - 1);

    for (let x = 0; x < n; x++) {
      const pVal = probabilities[x] || 0;
      const barH = (pVal / yMax) * chartH;
      const xPos = paddingLeft + x * barSlotW + barMargin;
      const yPos = paddingTop + chartH - barH;

      let hi = false;
      if (calcMode === 'exact')   hi = x === safeK;
      if (calcMode === 'atmost')  hi = x <= safeK;
      if (calcMode === 'atleast') hi = x >= safeK;

      ctx.fillStyle = x === hoveredIndex ? barHover : hi ? barHighlight : barNormal;
      if (barH > 0) {
        const r = Math.min(4, barWidth / 2);
        ctx.beginPath();
        ctx.moveTo(xPos, yPos + barH);
        ctx.lineTo(xPos, yPos + r);
        ctx.quadraticCurveTo(xPos, yPos, xPos + r, yPos);
        ctx.lineTo(xPos + barWidth - r, yPos);
        ctx.quadraticCurveTo(xPos + barWidth, yPos, xPos + barWidth, yPos + r);
        ctx.lineTo(xPos + barWidth, yPos + barH);
        ctx.closePath();
        ctx.fill();
      }
      poisCL.bars.push({ xIndex: x, x: xPos, y: yPos, w: barWidth, h: barH, pVal });

      const labelInterval = n > 35 ? 5 : n > 20 ? 2 : 1;
      if (x % labelInterval === 0 || x === safeK) {
        ctx.fillStyle = x === safeK ? (isDark ? '#4ade80' : '#16a34a') : textColor;
        ctx.font = x === safeK ? 'bold 11px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(String(x), xPos + barWidth / 2, paddingTop + chartH + 7);
      }
    }

    // X-axis title
    ctx.fillStyle = textColor; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Number of Events (x)', paddingLeft + chartW / 2, height - 8);

    // Mean dashed line
    const meanX = paddingLeft + (lambda + 0.5) * barSlotW;
    if (meanX >= paddingLeft && meanX <= paddingLeft + chartW) {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = meanColor; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(meanX, paddingTop); ctx.lineTo(meanX, paddingTop + chartH); ctx.stroke();
      ctx.fillStyle = meanColor; ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`\u03bc = ${lambda % 1 === 0 ? lambda : lambda.toFixed(1)}`, meanX, paddingTop - 4);
      ctx.restore();
    }
    ctx.restore();
  }

  function poisSetupHover() {
    const canvas  = document.getElementById('pois-distribution-canvas');
    const tooltip = document.getElementById('pois-chart-tooltip');
    if (!canvas || !tooltip) return;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      let found = -1;
      for (const b of poisCL.bars) {
        if (mouseX >= b.x - 2 && mouseX <= b.x + b.w + 2) { found = b.xIndex; break; }
      }
      if (found !== -1) {
        poisState.hoveredIndex = found;
        poisDrawChart();
        const pVal = poisState.probabilities[found] || 0;
        tooltip.innerHTML = `<div>X = ${found}</div><div>P(X=${found}) = ${pVal.toFixed(4)}</div>`;
        tooltip.hidden = false;
        const bi = poisCL.bars[found];
        if (bi) { tooltip.style.left = `${bi.x + bi.w / 2}px`; tooltip.style.top = `${Math.max(30, bi.y)}px`; }
      } else {
        if (poisState.hoveredIndex !== -1) { poisState.hoveredIndex = -1; poisDrawChart(); }
        tooltip.hidden = true;
      }
    });
    canvas.addEventListener('mouseleave', () => {
      poisState.hoveredIndex = -1; tooltip.hidden = true; poisDrawChart();
    });
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      for (const b of poisCL.bars) {
        if (mouseX >= b.x - 2 && mouseX <= b.x + b.w + 2) { poisSetK(b.xIndex); break; }
      }
    });
  }

  function poisSetK(val) {
    val = Math.max(0, Math.round(Number(val)) || 0);
    poisState.k = val;
    const sk = document.getElementById('pois-slider-k');
    const ik = document.getElementById('pois-input-k');
    if (sk) { sk.max = Math.max(30, val + 5); sk.value = val; }
    if (ik) ik.value = val;
    setTxt('pois-display-k', val);
    poisUpdateAll();
  }

  function poisSetLambda(val, fromSlider) {
    const num = parseFloat(val);
    const errEl = document.getElementById('pois-error-lambda');
    if (isNaN(num) || num <= 0) {
      poisState.isValid = false;
      if (errEl) { errEl.textContent = '\u26a0\ufe0f \u03bb must be a positive number (\u03bb > 0).'; errEl.hidden = false; }
      poisUpdateAll(); return;
    }
    poisState.isValid = true;
    poisState.lambda  = parseFloat(num.toFixed(4));
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    const sl = document.getElementById('pois-slider-lambda');
    const il = document.getElementById('pois-input-lambda');
    if (fromSlider && il) il.value = num % 1 === 0 ? num : num.toFixed(1);
    if (!fromSlider && sl) sl.value = Math.min(20, num);
    poisUpdateAll();
  }

  function poisClearPresets() {
    document.querySelectorAll('.pois-preset-chip').forEach((c) => c.classList.remove('active'));
  }

  function poisHighlightPreset(lambda) {
    document.querySelectorAll('.pois-preset-chip').forEach((c) => {
      c.classList.toggle('active', Math.abs(parseFloat(c.dataset.lambda) - lambda) < 0.01);
    });
  }

  function poisSetupControls() {
    const sl = document.getElementById('pois-slider-lambda');
    const il = document.getElementById('pois-input-lambda');
    const sk = document.getElementById('pois-slider-k');
    const ik = document.getElementById('pois-input-k');

    if (sl) sl.addEventListener('input', (e) => { poisSetLambda(e.target.value, true); poisClearPresets(); });
    if (il) {
      il.addEventListener('input',  (e) => { poisSetLambda(e.target.value, false); poisClearPresets(); });
      il.addEventListener('change', (e) => { poisSetLambda(e.target.value, false); poisClearPresets(); });
    }
    if (sk) sk.addEventListener('input', (e) => poisSetK(e.target.value));
    if (ik) {
      ik.addEventListener('input',  (e) => poisSetK(e.target.value));
      ik.addEventListener('change', (e) => poisSetK(e.target.value));
    }

    document.querySelectorAll('input[name="pois-calc-mode"]').forEach((r) => {
      r.addEventListener('change', (e) => { poisState.calcMode = e.target.value; poisDrawChart(); });
    });

    const resetBtn = document.getElementById('pois-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      poisState.lambda = 6; poisState.k = 6; poisState.calcMode = 'exact'; poisState.isValid = true;
      if (sl) sl.value = 6; if (il) il.value = 6;
      if (sk) { sk.max = 30; sk.value = 6; } if (ik) ik.value = 6;
      const errL = document.getElementById('pois-error-lambda');
      if (errL) errL.hidden = true;
      const radioExact = document.querySelector('input[name="pois-calc-mode"][value="exact"]');
      if (radioExact) radioExact.checked = true;
      poisHighlightPreset(6);
      poisUpdateAll();
    });

    document.querySelectorAll('.pois-preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const lam = parseFloat(chip.dataset.lambda);
        const kk  = parseInt(chip.dataset.k, 10);
        poisState.lambda = lam; poisState.k = kk; poisState.isValid = true; poisState.calcMode = 'exact';
        if (sl) sl.value = Math.min(20, lam); if (il) il.value = lam;
        if (sk) { sk.max = Math.max(30, kk + 10); sk.value = kk; } if (ik) ik.value = kk;
        const errL = document.getElementById('pois-error-lambda');
        if (errL) errL.hidden = true;
        const radioExact = document.querySelector('input[name="pois-calc-mode"][value="exact"]');
        if (radioExact) radioExact.checked = true;
        poisHighlightPreset(lam);
        poisUpdateAll();
      });
    });

    const toggleBtn = document.getElementById('pois-toggle-table-btn');
    const wrapper   = document.getElementById('pois-table-wrapper');
    if (toggleBtn && wrapper) {
      toggleBtn.addEventListener('click', () => {
        const isCollapsed = wrapper.style.maxHeight === '800px';
        wrapper.style.maxHeight = isCollapsed ? '280px' : '800px';
        toggleBtn.textContent = isCollapsed ? 'Toggle Full Table View' : 'Collapse Table View';
      });
    }

    window.addEventListener('resize', () => {
      const panel = document.getElementById('tab-poisson');
      if (panel && panel.classList.contains('active-panel')) poisResizeAndDraw();
    });
  }

  // Patch switchTab to redraw Poisson chart when tab is activated
  const _origSwitchTab = window.switchTab;
  window.switchTab = function (tabName) {
    _origSwitchTab(tabName);
    if (tabName === 'poisson') {
      requestAnimationFrame(() => poisResizeAndDraw());
      setTimeout(() => poisResizeAndDraw(), 60);
    }
  };

  function poisInit() {
    poisSetupControls();
    poisSetupHover();
    poisHighlightPreset(6);
    poisUpdateAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', poisInit);
  } else {
    poisInit();
  }
})();

